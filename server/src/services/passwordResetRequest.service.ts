import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Transaction } from 'sequelize';
import { PasswordResetRequest } from '../models/PasswordResetRequest';
import { User } from '../models/User';
import { AppError } from '../middlewares/error.middleware';
import { sequelize } from '../config/sequelize';
import { encryptSecret, decryptSecret } from '../utils/secretCrypto';
import { getBcryptRounds } from '../utils/settingsCache';
import { notificationService } from './notification.service';
import { logError } from '../utils/logger';

const CODE_TTL_MS = 30 * 60 * 1000; // 인증번호 만료 30분
const LOCK_MS = 60 * 60 * 1000; // 3회 오입력 시 잠금 1시간
const MAX_ATTEMPTS = 3;

// 관리자에게만 노출되는 뷰(복호화된 인증번호 포함). 사용자 응답에는 절대 포함하지 않는다.
export interface PasswordResetAdminView {
  id: string;
  userId: string;
  name: string | null;
  code: string; // 복호화된 6자리
  expiresAt: Date;
  attempts: number;
  remainingAttempts: number;
  createdAt: Date;
}

// 6자리 인증번호 — 암호학적 난수(앞자리 0 허용, 편향 없음)
function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

// 상수시간 비교(타이밍 공격 방지) — 길이가 다르면 즉시 false
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

class PasswordResetRequestService {
  // 사용자당 활성(미완료) 요청 1건
  private findActive(userId: string, t?: Transaction) {
    return PasswordResetRequest.findOne({
      where: { userId, completedAt: null },
      order: [['createdAt', 'DESC']],
      ...(t ? { transaction: t, lock: t.LOCK.UPDATE } : {}),
    });
  }

  /**
   * 사용자가 아이디로 초기화를 요청 → 6자리 인증번호를 자동 생성해 암호화 저장한다.
   * ★인증번호는 절대 반환하지 않는다(관리자 목록에서만 복호화 노출).
   * 계정 열거 방지를 위해 존재 여부와 무관하게 void 반환(응답은 항상 동일).
   * 잠금 중(lockedUntil>now)에는 재발급하지 않아 잠금을 우회할 수 없다.
   */
  async createRequest(loginId: string): Promise<void> {
    const user = await User.findOne({
      where: { id: loginId, isActive: true, isDeleted: false },
      attributes: ['id', 'name'],
    });
    if (!user) return; // 조용히 무시(열거 방지)

    const now = new Date();
    let created = false;
    await sequelize.transaction(async t => {
      const existing = await this.findActive(loginId, t);
      if (existing?.lockedUntil && existing.lockedUntil > now) return; // 잠금 중 — 재발급 금지

      const encrypted = encryptSecret(generateCode());
      const expiresAt = new Date(now.getTime() + CODE_TTL_MS);

      if (existing) {
        existing.code = encrypted;
        existing.expiresAt = expiresAt;
        existing.attempts = 0;
        existing.lockedUntil = null;
        existing.status = 'pending';
        await existing.save({ transaction: t });
      } else {
        await PasswordResetRequest.create(
          { userId: loginId, status: 'pending', code: encrypted, expiresAt, attempts: 0 },
          { transaction: t }
        );
        created = true;
      }
    });

    // 새 요청이 생성되면 관리자 전원에게 알림(fire-and-forget). ★알림에는 인증번호를 넣지 않는다
    //    — 관리자가 링크로 목록에 들어가 복호화된 코드를 확인해 전달한다.
    if (created) void this.notifyAdmins(loginId, user.name ?? null);
  }

  // 관리자(admin)에게 초기화 요청 알림 발송. 실패해도 요청 흐름은 막지 않는다.
  private async notifyAdmins(loginId: string, userName: string | null): Promise<void> {
    try {
      const admins = await User.findAll({
        where: { roleId: 'admin', isActive: true, isDeleted: false },
        attributes: ['id'],
      });
      const who = userName ? `${userName}(${loginId})` : loginId;
      await Promise.all(
        admins.map(a =>
          notificationService.create({
            userId: a.id,
            type: 'SYSTEM',
            message: `${who}님이 비밀번호 초기화를 요청했습니다. 인증번호를 확인해 전달하세요.`,
            link: '/admin/password-reset-requests',
          })
        )
      );
    } catch (err) {
      logError('비밀번호 초기화 관리자 알림 발송 실패', err);
    }
  }

  /**
   * 인증번호 검증 + 비밀번호 변경. 3회 오입력 시 요청 폐기 + 1시간 잠금.
   * 새 비밀번호 복잡도는 컨트롤러에서 먼저 검증(오입력 카운트 소모 전에).
   * 동시 요청 직렬화를 위해 트랜잭션 + 행 잠금 사용.
   */
  async verifyAndReset(loginId: string, code: string, newPassword: string): Promise<void> {
    const now = new Date();
    // ★오입력 카운트/잠금 저장은 반드시 커밋되어야 한다. 트랜잭션 콜백 안에서 throw하면
    //   Sequelize가 롤백해 attempts 증가가 사라져 잠금이 영영 발동하지 않는다.
    //   따라서 에러는 콜백에서 '반환'해 저장을 커밋한 뒤, 트랜잭션 밖에서 throw한다.
    const failure = await sequelize.transaction<AppError | null>(async t => {
      const req = await this.findActive(loginId, t);
      const user = await User.findOne({
        where: { id: loginId, isActive: true, isDeleted: false },
        transaction: t,
      });
      // 요청/사용자 없음 — 동일한 일반 메시지(정보 최소화)
      if (!req || !user) {
        return new AppError(400, '유효하지 않은 요청입니다. 초기화를 다시 요청해주세요.');
      }
      if (req.lockedUntil && req.lockedUntil > now) {
        const mins = Math.ceil((req.lockedUntil.getTime() - now.getTime()) / 60000);
        return new AppError(429, `인증번호를 여러 번 틀렸습니다. ${mins}분 후 다시 요청해주세요.`);
      }
      if (!req.code || !req.expiresAt || req.expiresAt <= now) {
        return new AppError(400, '인증번호가 만료되었습니다. 초기화를 다시 요청해주세요.');
      }

      const actual = decryptSecret(req.code);
      if (!safeEqual(actual, code)) {
        req.attempts += 1;
        if (req.attempts >= MAX_ATTEMPTS) {
          req.lockedUntil = new Date(now.getTime() + LOCK_MS);
          req.code = null; // 잠금 시 코드 폐기
          req.status = 'locked';
          await req.save({ transaction: t }); // 커밋됨(정상 반환)
          return new AppError(429, '인증번호를 3회 틀렸습니다. 1시간 후 다시 초기화를 요청해주세요.');
        }
        await req.save({ transaction: t }); // 커밋됨
        return new AppError(
          400,
          `인증번호가 올바르지 않습니다. (남은 시도 ${MAX_ATTEMPTS - req.attempts}회)`
        );
      }

      // 정답 — 비밀번호 변경(이미 해싱된 값 저장, 기존 세션 전부 무효화)
      user.password = await bcrypt.hash(newPassword, getBcryptRounds());
      user._skipPasswordHash = true; // beforeUpdate 재해싱 방지
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
      user.mustChangePassword = false; // 사용자가 직접 정한 비밀번호
      user.passwordResetToken = null;
      user.passwordResetExpires = null;
      await user.save({ transaction: t });

      req.completedAt = now;
      req.code = null;
      req.status = 'completed';
      await req.save({ transaction: t });
      return null; // 성공
    });

    if (failure) throw failure;
  }

  /** 관리자 — 진행 중(pending·미만료·미잠금) 요청 목록 + 복호화된 인증번호. */
  async listActive(): Promise<PasswordResetAdminView[]> {
    const now = new Date();
    const rows = await PasswordResetRequest.findAll({
      where: { status: 'pending', completedAt: null },
      include: [{ model: User, as: 'user', attributes: ['id', 'name'], required: true }],
      order: [['createdAt', 'DESC']],
      limit: 200,
    });
    return rows
      .filter(r => r.code && r.expiresAt && r.expiresAt > now)
      .map(r => {
        const user = (r as unknown as { user?: { name?: string } }).user;
        let code = '------';
        try {
          code = decryptSecret(r.code as string);
        } catch {
          code = '------';
        }
        return {
          id: r.id,
          userId: r.userId,
          name: user?.name ?? null,
          code,
          expiresAt: r.expiresAt as Date,
          attempts: r.attempts,
          remainingAttempts: MAX_ATTEMPTS - r.attempts,
          createdAt: r.createdAt,
        };
      });
  }

  /** 관리자 — 요청 폐기(전달 완료/취소 처리). */
  async dismiss(requestId: string): Promise<void> {
    const req = await PasswordResetRequest.findByPk(requestId);
    if (!req) throw new AppError(404, '요청을 찾을 수 없습니다.');
    await req.destroy();
  }
}

export const passwordResetRequestService = new PasswordResetRequestService();
