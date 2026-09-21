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

// 6자리 인증번호. 암호학적 난수로 앞자리 0 도 허용한다.
function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

// 상수시간 비교(타이밍 공격 방지)
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

  /** 아이디로 초기화 요청. 인증번호는 반환하지 않고, 계정 열거 방지로 항상 void 다. 잠금 중에는 재발급하지 않는다. */
  async createRequest(loginId: string): Promise<void> {
    const user = await User.findOne({
      where: { id: loginId, isActive: true, isDeleted: false },
      attributes: ['id', 'name'],
    });
    if (!user) return; // 조용히 무시(열거 방지)

    const now = new Date();
    let issued = false; // 코드가 발급(신규 or 재발급)됐는지. 발급 시 관리자에게 알림
    await sequelize.transaction(async t => {
      const existing = await this.findActive(loginId, t);
      if (existing?.lockedUntil && existing.lockedUntil > now) return; // 잠금 중이면 재발급 금지

      const encrypted = encryptSecret(generateCode());
      const expiresAt = new Date(now.getTime() + CODE_TTL_MS);

      if (existing) {
        existing.code = encrypted;
        existing.expiresAt = expiresAt;
        existing.attempts = 0;
        existing.lockedUntil = null;
        await existing.save({ transaction: t });
      } else {
        await PasswordResetRequest.create(
          { userId: loginId, status: 'pending', code: encrypted, expiresAt, attempts: 0 },
          { transaction: t }
        );
      }
      issued = true;
    });

    // 발급되면 관리자 전원에게 알린다. 알림에 인증번호는 넣지 않는다.
    if (issued) void this.notifyAdmins(loginId, user.name ?? null);
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

  /** 인증번호 검증 + 비밀번호 변경. 3회 오입력 시 폐기·1시간 잠금. 트랜잭션과 행 잠금으로 직렬화한다. */
  async verifyAndReset(loginId: string, code: string, newPassword: string): Promise<void> {
    const now = new Date();
    // 콜백 안에서 throw 하면 롤백되어 attempts 증가가 사라진다. 에러는 반환해 커밋한 뒤 밖에서 throw 한다.
    const failure = await sequelize.transaction<AppError | null>(async t => {
      const req = await this.findActive(loginId, t);
      const user = await User.findOne({
        where: { id: loginId, isActive: true, isDeleted: false },
        transaction: t,
      });
      // 요청·사용자가 없어도 같은 일반 메시지로 답한다.
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
          req.code = null; // 잠금 시 코드 폐기(잠금 판단은 lockedUntil)
          await req.save({ transaction: t }); // 커밋됨(정상 반환)
          return new AppError(
            429,
            '인증번호를 3회 틀렸습니다. 1시간 후 다시 초기화를 요청해주세요.'
          );
        }
        await req.save({ transaction: t }); // 커밋됨
        return new AppError(
          400,
          `인증번호가 올바르지 않습니다. (남은 시도 ${MAX_ATTEMPTS - req.attempts}회)`
        );
      }

      // 정답이면 비밀번호를 바꾼다(이미 해싱된 값 저장, 기존 세션 전부 무효화).
      user.password = await bcrypt.hash(newPassword, getBcryptRounds());
      user._skipPasswordHash = true; // beforeUpdate 재해싱 방지
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
      user.mustChangePassword = false; // 사용자가 직접 정한 비밀번호
      user.passwordResetToken = null;
      user.passwordResetExpires = null;
      await user.save({ transaction: t });

      req.completedAt = now; // 완료 판단은 completedAt 으로 한다. status 컬럼은 그대로 둔다
      req.code = null;
      await req.save({ transaction: t });
      return null; // 성공
    });

    if (failure) throw failure;
  }

  /** 관리자용. 진행 중(pending·미만료·미잠금) 요청 목록 + 복호화된 인증번호. */
  async listActive(): Promise<PasswordResetAdminView[]> {
    const now = new Date();
    const rows = await PasswordResetRequest.findAll({
      // 진행 중 = 미완료(completedAt null). status 컬럼은 판단에 쓰지 않는다.
      where: { completedAt: null },
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

  /** 관리자용. 요청 폐기(전달 완료/취소 처리). */
  async dismiss(requestId: string): Promise<void> {
    const req = await PasswordResetRequest.findByPk(requestId);
    if (!req) throw new AppError(404, '요청을 찾을 수 없습니다.');
    await req.destroy();
  }
}

export const passwordResetRequestService = new PasswordResetRequestService();
