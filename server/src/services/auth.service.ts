import { BaseService } from './base.service';
import { User, UserInstance } from '../models/User';
import { Role } from '../models/Role';
import { AppError } from '../middlewares/error.middleware';
import bcrypt from 'bcryptjs';
import { getBcryptRounds, getSettings } from '../utils/settingsCache';
import jwt from 'jsonwebtoken';
import Board from '../models/Board';
import BoardAccess from '../models/BoardAccess';
import EventPermission from '../models/EventPermission';
import { Op, UniqueConstraintError } from 'sequelize';
import { sequelize } from '../config/sequelize';
import crypto from 'crypto';
import { securityLogService } from './securityLog.service';
import { loginHistoryService } from './loginHistory.service';
import { pointService } from './point.service';
import { featureFlagService } from './featureFlag.service';
import { userSessionService } from './userSession.service';
import { notificationService } from './notification.service';
import { logWarning, logError } from '../utils/logger';

// 없는 계정으로 로그인해도 실재 계정과 같은 시간이 걸리게 하기 위한 더미 해시.
//
// 응답 문구를 실재 계정 오답과 한 글자도 같게 맞춰 둬도, 비밀번호 비교를 건너뛰면
// 그 자리가 시간으로 드러난다 — 실측으로 없는 계정 ~0.005s, 실재 계정 오답 ~0.09s 였다
// (15~20배). 요청 한 번씩만 보내도 어떤 아이디가 실재하는지 가려낼 수 있다.
//
// bcrypt.compare 의 비용은 넘기는 인자가 아니라 해시에 박힌 계수를 따른다. 그래서 실제
// 비밀번호와 같은 rounds 로 만든 해시여야 시간이 맞는다. rounds 는 사이트 설정이라
// 바뀔 수 있으므로 값과 함께 캐시하고, 바뀌면 다시 만든다.
//
// 한계: 이미 저장된 사용자 해시는 만들 당시의 계수를 그대로 쓴다. 관리자가 rounds 를
// 올린 직후에는 기존 사용자와 더미 사이에 잔차가 남는다 — 여기서 없앨 수 있는 것이 아니다.
let dummyHashCache: { rounds: number; hash: string } | null = null;

async function compareAgainstDummy(password: string): Promise<void> {
  const rounds = getBcryptRounds();
  if (!dummyHashCache || dummyHashCache.rounds !== rounds) {
    const filler = crypto.randomBytes(16).toString('hex');
    dummyHashCache = { rounds, hash: await bcrypt.hash(filler, rounds) };
  }
  await bcrypt.compare(password, dummyHashCache.hash);
}

// Types
export interface UserPayload {
  id: string;
  name: string;
  role: string;
  mustChangePassword?: boolean;
  permissions: {
    events: {
      canCreate: boolean;
      canRead: boolean;
      canUpdate: boolean;
      canDelete: boolean;
    };
    boards: Array<{
      boardId: string;
      canRead: boolean;
      canWrite: boolean;
      canDelete: boolean;
    }>;
    personalBoard: {
      boardId: string;
      boardName: string;
      canRead: boolean;
      canWrite: boolean;
      canDelete: boolean;
    } | null;
  };
}

interface LoginResult {
  user: UserInstance;
  accessToken: string;
  refreshToken: string;
  payload: UserPayload | null;
  requires2FA?: boolean;
  tempToken?: string;
}

interface RegisterDTO {
  id: string;
  password: string;
  name: string;
  email?: string;
}

/**
 * 오늘 몫의 출석 포인트를 준다 — 아직 안 받았을 때만.
 *
 * 응답을 붙잡아 두지 않는다(fire-and-forget). 포인트를 못 받았다고
 * 로그인이나 토큰 갱신이 실패할 이유는 없다.
 */
function grantAttendanceIfDue(userId: string): void {
  void featureFlagService
    .isEnabled('tools.lottery')
    .then(on => (on ? pointService.claimAttendance(userId) : null))
    .catch(err => logError('출석 포인트 지급 실패', err, { userId }));
}

/**
 * 방금 끝난(또는 진행 중인) 토큰 회전을 잠깐 기억해 둔다.
 * 키는 옛 refresh 토큰의 해시 — 원문을 그대로 들고 있지 않는다.
 */
const REFRESH_GRACE_MS = 30_000;
const recentRefreshes = new Map<string, { at: number; result: Promise<LoginResult> }>();

function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** 유예가 지난 항목을 걷어 낸다 — 안 하면 갱신할 때마다 한 칸씩 늘어난다 */
function sweepRecentRefreshes(): void {
  const cutoff = Date.now() - REFRESH_GRACE_MS;
  for (const [key, entry] of recentRefreshes) {
    if (entry.at < cutoff) recentRefreshes.delete(key);
  }
}

export class AuthService extends BaseService {
  public async generateUserPayload(user: UserInstance): Promise<UserPayload> {
    const [eventPermission, boardPermissions, personalBoard] = await Promise.all([
      EventPermission.findOne({
        where: { roleId: user.roleId },
      }),
      BoardAccess.findAll({
        where: { roleId: user.roleId },
        include: [
          {
            model: Board,
            as: 'board',
            attributes: ['id'],
            where: { isActive: true, isPersonal: false },
            required: true,
          },
        ],
      }),
      Board.findOne({
        where: {
          isPersonal: true,
          ownerId: user.id,
          isActive: true,
        },
        attributes: ['id', 'name'],
      }),
    ]);

    return {
      id: user.id,
      name: user.name,
      role: user.roleId, // Consistent with payload structure
      mustChangePassword: user.mustChangePassword ?? false,
      permissions: {
        events: eventPermission
          ? {
              canCreate: eventPermission.canCreate,
              canRead: eventPermission.canRead,
              canUpdate: eventPermission.canUpdate,
              canDelete: eventPermission.canDelete,
            }
          : {
              canCreate: false,
              canRead: true,
              canUpdate: false,
              canDelete: false,
            },
        boards: boardPermissions.map(bp => ({
          boardId: bp.boardId,
          canRead: bp.canRead,
          canWrite: bp.canWrite,
          canDelete: bp.canDelete,
        })),
        personalBoard: personalBoard
          ? {
              boardId: personalBoard.id,
              boardName: personalBoard.name,
              canRead: true, // Personal board always full access for owner
              canWrite: true,
              canDelete: true,
            }
          : null,
      },
    };
  }

  async login(
    id: string,
    password: string,
    ipAddress: string,
    fingerprint?: string,
    userAgent?: string | null
  ): Promise<LoginResult> {
    const user = await User.findOne({
      where: { id },
      paranoid: false, // ✅ deletedAt 컬럼 마이그레이션 전에도 쿼리 가능 (isDeleted로 따로 체크)
      include: [
        {
          model: Role,
          as: 'roleInfo',
          attributes: ['id', 'name', 'description', 'isActive'],
        },
      ],
    });

    if (!user) {
      // 없는 계정으로의 시도도 남긴다.
      //
      // 남기기 전에는 여기서 곧장 throw 해서 security_logs·login_history 어디에도
      // 아무것도 남지 않았다(실측: 없는 계정으로 로그인 실패 → 두 테이블 모두 증가 0).
      // 로그인에는 시도 횟수 제한도 없으므로, 아이디 목록을 훑는 행위가 무제한으로
      // 가능하면서 흔적은 0 이었다 — 우연히 실재 계정을 맞힌 경우에만 기록됐다.
      //
      // 시도된 아이디를 남겨야 "무엇을 훑었는지" 가 보인다. 응답은 실재 계정일 때와
      // 한 글자도 다르지 않게 유지한다 — 다르면 그 자체로 계정 존재 여부를 알려 준다.
      securityLogService
        .createLog({
          userId: null,
          ipAddress,
          action: 'LOGIN_FAILED',
          method: 'POST',
          route: '/api/auth/login',
          status: 'FAILURE',
          details: { reason: 'Unknown account', attemptedId: id },
        })
        .catch(err => logError('없는 계정 로그인 보안 로그 실패', err));
      loginHistoryService
        .createLoginRecord({
          userId: id,
          userName: null,
          userRole: null,
          ipAddress,
          userAgent,
          status: 'failed',
          failureReason: '존재하지 않는 계정',
        })
        .catch(err => logError('없는 계정 로그인 이력 기록 실패', err));

      // 실재 계정 오답과 같은 시간이 걸리도록 한 번 비교한다(위 dummyHashCache 주석 참조).
      await compareAgainstDummy(password);
      throw new AppError(401, '아이디 및 비밀번호가 틀렸습니다.');
    }

    if (!user.isActive)
      throw new AppError(403, '관리자 승인 대기 중인 계정입니다. 승인 후 다시 시도해주세요.');
    if (user.isDeletedAccount()) throw new AppError(401, '삭제된 계정입니다.');
    if (!user.roleInfo) throw new AppError(401, '역할 정보가 없습니다.');
    if (!user.roleInfo.isActive) throw new AppError(403, '비활성화된 역할입니다.');
    if (user.isLocked()) {
      securityLogService
        .createLog({
          userId: user.id,
          ipAddress,
          action: 'LOGIN_BLOCKED',
          method: 'POST',
          route: '/api/auth/login',
          status: 'FAILURE',
          details: { reason: 'Account locked' },
        })
        .catch(err => logError('로그인 차단 보안 로그 실패', err));
      loginHistoryService
        .createLoginRecord({
          userId: user.id,
          userName: user.name,
          userRole: user.roleId,
          ipAddress,
          userAgent,
          status: 'locked',
          failureReason: '계정 잠금 상태',
        })
        .catch(err => logError('로그인 차단 이력 기록 실패', err));
      throw new AppError(403, '계정이 잠겨있습니다. 나중에 다시 시도해주세요.');
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      // DB 컬럼 누락(기존 DB 마이그레이션 중) 시 save() 실패해도 로그인 흐름 유지
      try {
        await user.incrementFailedAttempts();
      } catch (err) {
        logWarning('로그인 실패 카운터 증가 실패 (마이그레이션 중일 수 있음)', {
          userId: user.id,
          err,
        });
      }
      securityLogService
        .createLog({
          userId: user.id,
          ipAddress,
          action: 'LOGIN_FAILED',
          method: 'POST',
          route: '/api/auth/login',
          status: 'FAILURE',
          details: { reason: 'Invalid password' },
        })
        .catch(err => logError('로그인 실패 보안 로그 실패', err));
      loginHistoryService
        .createLoginRecord({
          userId: user.id,
          userName: user.name,
          userRole: user.roleId,
          ipAddress,
          userAgent,
          status: 'failed',
          failureReason: '비밀번호 불일치',
        })
        .catch(err => logError('로그인 실패 이력 기록 실패', err));
      // 계정이 잠긴 경우에만 알림 (매 실패마다 알림 스팸 방지)
      if (user.isLocked()) {
        notificationService
          .create({
            userId: user.id,
            type: 'SYSTEM',
            message: `🔒 비밀번호 오류 5회 초과로 계정이 30분 동안 잠겼습니다. 본인이 아닌 경우 비밀번호를 변경하세요.`,
            link: '/profile',
          })
          .catch(err => logError('계정 잠금 알림 실패', err));
      }
      throw new AppError(401, '아이디 및 비밀번호가 틀렸습니다.');
    }

    // 새 IP 감지를 위해 업데이트 전 이전 IP 보존
    const previousLoginIp = user.lastLoginIp ?? null;

    // 2FA 체크: 2FA가 활성화된 사용자는 추가 인증 필요
    //    실패 카운터/lastLoginIp 갱신은 2FA 검증 성공 후로 미룬다 (2FA brute force 시 잠금 보존)
    if (user.twoFactorEnabled) {
      // 임시 토큰 생성 (2FA 검증용, 짧은 만료시간) — tv 포함으로 비밀번호 변경 시 무효화
      const tempToken = jwt.sign(
        { id: user.id, type: '2fa_pending', tv: user.tokenVersion ?? 0 },
        process.env.JWT_SECRET!,
        { expiresIn: '5m', algorithm: 'HS256' }
      );

      return {
        user,
        accessToken: '',
        refreshToken: '',
        payload: null,
        requires2FA: true,
        tempToken,
      };
    }

    // DB 컬럼 누락 시 save() 실패해도 로그인은 계속 진행
    try {
      await user.resetFailedAttempts(ipAddress);
    } catch (err) {
      logWarning('로그인 성공 후 실패 카운터 리셋 실패 (마이그레이션 중일 수 있음)', {
        userId: user.id,
        err,
      });
    }

    const payload = await this.generateUserPayload(user);

    // Add simple role/id to payload root for middleware convenience
    const jwtPayload = {
      ...payload,
      roleId: user.roleId,
    };

    const { jwtAccessTokenHours, jwtRefreshTokenDays } = getSettings();

    const accessToken = jwt.sign(
      { ...jwtPayload, tv: user.tokenVersion ?? 0 },
      process.env.JWT_SECRET!,
      { expiresIn: `${jwtAccessTokenHours}h`, algorithm: 'HS256' }
    );

    const refreshToken = jwt.sign(
      // jti 로 매번 다른 토큰을 만든다. 없으면 payload 와 iat(초 단위)가 같아져
      // 같은 사람이 같은 초에 두 번 로그인하면 토큰이 글자까지 똑같아진다 —
      // 세션 표에서 한 줄로 덮여 기기 두 대가 한 자격증명을 나눠 쓰게 된다.
      { id: user.id, tokenType: 'refresh', tv: user.tokenVersion ?? 0, jti: crypto.randomUUID() },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: `${jwtRefreshTokenDays}d`, algorithm: 'HS256' }
    );

    // 새 IP 로그인 감지: 이전 로그인 IP(업데이트 전 보존)와 비교
    if (previousLoginIp !== null && previousLoginIp !== ipAddress) {
      notificationService
        .create({
          userId: user.id,
          type: 'SYSTEM',
          message: `🔔 새로운 IP(${ipAddress})에서 로그인이 감지되었습니다. 본인이 아닌 경우 즉시 비밀번호를 변경하세요.`,
          link: '/profile',
        })
        .catch(err => logError('새 IP 로그인 알림 실패', err));
    }

    securityLogService
      .createLog({
        userId: user.id,
        ipAddress,
        action: 'LOGIN_SUCCESS',
        method: 'POST',
        route: '/api/auth/login',
        status: 'SUCCESS',
        details: fingerprint ? { fingerprint } : undefined,
      })
      .catch(err => logError('로그인 성공 보안 로그 실패', err));

    loginHistoryService
      .createLoginRecord({
        userId: user.id,
        userName: user.name,
        userRole: user.roleId,
        ipAddress,
        userAgent,
        status: 'success',
      })
      .catch(err => logError('로그인 성공 이력 기록 실패', err));

    grantAttendanceIfDue(user.id);

    userSessionService
      .createSession({
        userId: user.id,
        rawToken: refreshToken,
        ipAddress,
        userAgent,
      })
      .catch(err => logError('세션 생성 실패', err));

    return { user, accessToken, refreshToken, payload };
  }

  /**
   * 토큰 갱신.
   *
   * 같은 refresh 토큰으로 들어온 요청은 한 번만 회전시키고 같은 결과를 함께 쓴다.
   *
   * 브라우저의 쿠키 저장소는 탭끼리 하나다. 액세스 토큰이 만료된 뒤 탭 두 개가 거의
   * 동시에 갱신을 부르면 둘 다 옛 토큰을 들고 오는데, 그대로 두 번 회전시키면
   * DB 세션은 나중 것만 남고 브라우저에는 응답이 늦게 온 쪽의 쿠키가 남는다.
   * 둘이 어긋나면 다음 갱신에서 401 — 멀쩡히 열어 둔 탭이 로그인 화면으로 튕긴다.
   *
   * 그래서 회전 결과를 짧게(GRACE) 들고 있다가 같은 옛 토큰에는 같은 새 토큰을 준다.
   * 유예 동안에도 세션이 살아 있는지는 매번 다시 확인하므로, 그사이 로그아웃·강제
   * 종료된 세션이 되살아나지는 않는다.
   *
   * 서버를 여러 대로 늘리면 이 기억은 대(臺)마다 따로다 — 그때는 같은 탭의 요청이
   * 같은 대로 가도록 묶거나 공유 저장소로 옮겨야 한다.
   */
  async refreshToken(token: string): Promise<LoginResult> {
    const key = hashRefreshToken(token);
    const pending = recentRefreshes.get(key);
    if (pending && Date.now() - pending.at < REFRESH_GRACE_MS) {
      const result = await pending.result;
      // 유예 중이라도 세션이 끊겼으면 돌려주지 않는다
      if (!(await userSessionService.validateSession(result.refreshToken))) {
        throw new AppError(401, '세션이 만료되었습니다. 다시 로그인해주세요.');
      }
      return result;
    }

    const running = this.rotateRefreshToken(token);
    sweepRecentRefreshes();
    recentRefreshes.set(key, { at: Date.now(), result: running });
    // 실패는 기억하지 않는다 — 한 번 삐끗한 갱신이 유예 동안 계속 같은 오류를 내면 안 된다
    running.catch(() => recentRefreshes.delete(key));
    return running;
  }

  private async rotateRefreshToken(token: string): Promise<LoginResult> {
    try {
      const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as {
        id: string;
        tokenType: string;
        tv?: number;
      };

      if (decoded.tokenType !== 'refresh') {
        throw new AppError(401, '잘못된 토큰 타입입니다.');
      }

      const user = await User.findOne({
        where: {
          id: decoded.id,
          isActive: true,
        },
        paranoid: false, // ✅ deletedAt 컬럼 마이그레이션 전에도 쿼리 가능
        include: [
          {
            model: Role,
            as: 'roleInfo',
            attributes: ['id', 'name', 'description', 'isActive'],
          },
        ],
      });

      if (!user) throw new AppError(401, '사용자를 찾을 수 없습니다.');
      if (user.isDeletedAccount()) throw new AppError(401, '삭제된 계정입니다.');
      if (!user.roleInfo?.isActive) throw new AppError(403, '비활성화된 역할입니다.');
      if (user.isLocked())
        throw new AppError(403, '계정이 잠겨있습니다. 나중에 다시 시도해주세요.');

      // tokenVersion 검증: 로그아웃 후 기존 토큰 무효화
      // decoded.tv가 없는 구형 토큰이면서 tokenVersion이 이미 증가된 경우도 거부
      const dbTv = user.tokenVersion ?? 0;
      const tvMismatch = decoded.tv === undefined ? dbTv > 0 : decoded.tv !== dbTv;
      if (tvMismatch) {
        throw new AppError(401, '만료된 토큰입니다. 다시 로그인해주세요.');
      }

      const payload = await this.generateUserPayload(user);
      const jwtPayload = { ...payload, roleId: user.roleId };

      const { jwtAccessTokenHours: accessHours, jwtRefreshTokenDays: refreshDays } = getSettings();

      const newAccessToken = jwt.sign(
        { ...jwtPayload, tv: user.tokenVersion ?? 0 },
        process.env.JWT_SECRET!,
        { expiresIn: `${accessHours}h`, algorithm: 'HS256' }
      );

      const newRefreshToken = jwt.sign(
        // 갱신 때도 마찬가지 — 두 기기가 같은 초에 갱신하면 같은 토큰이 나와
        // sessionToken 유니크 제약에 걸리고 한쪽 세션이 갱신되지 않는다.
        { id: user.id, tokenType: 'refresh', tv: user.tokenVersion ?? 0, jti: crypto.randomUUID() },
        process.env.JWT_REFRESH_SECRET!,
        { expiresIn: `${refreshDays}d`, algorithm: 'HS256' }
      );

      // DB 세션 활성 상태 확인 — forceLogout된 세션은 토큰 갱신 차단
      const sessionValid = await userSessionService.validateSession(token);
      if (!sessionValid) {
        throw new AppError(401, '세션이 만료되었습니다. 다시 로그인해주세요.');
      }

      // 세션 토큰 교체 + 활동 시각 갱신
      // 구 refresh token → 신 refresh token 으로 DB 세션을 교체해야 다음 갱신에서도 추적 가능
      // 실패 시 에러 로깅만 하고 토큰은 정상 반환 (세션 추적 실패가 로그인 실패는 아님)
      await userSessionService
        .rotateSession(token, newRefreshToken)
        .catch(err => logError('세션 토큰 교체 실패 (토큰 갱신은 정상 완료)', err));

      // 로그인과 같이 여기서도 출석을 준다.
      // 창을 열어 둔 채 리프레시 토큰으로 며칠을 이어 쓰는 경우가 있다. 로그인 때만 주면
      // "접속하면 하루 한 번 쌓인다" 는 안내와 달리 받지 못하는 사용자가 생긴다.
      // 하루 한 번인지는 pointService 가 잠금을 잡고 보장하므로 여러 번 불러도 안전하다.
      grantAttendanceIfDue(user.id);

      return {
        user,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        payload,
      };
    } catch (err) {
      if (err instanceof AppError) {
        throw err; // AppError는 그대로 재전파 (상태코드/메시지 유지)
      }
      if (err instanceof jwt.TokenExpiredError) {
        throw new AppError(401, '리프레시 토큰이 만료되었습니다.');
      }
      if (err instanceof jwt.JsonWebTokenError) {
        throw new AppError(401, '유효하지 않은 토큰입니다.');
      }
      throw new AppError(401, '토큰 갱신 실패');
    }
  }

  async register(data: RegisterDTO): Promise<UserInstance> {
    // Validate ID/Password complexity (Assuming Controller or specific method handles detailed validation messages,
    // but service should enforce core rules)
    // Keep simple rules consistent with controller

    let defaultRole = await Role.findOne({
      where: { id: 'guest', isActive: true },
    });

    if (!defaultRole) {
      defaultRole = await Role.create({
        id: 'guest',
        name: '방문자',
        description: '승인 대기 중인 신규 사용자',
        isActive: true,
      });
    }

    // TOCTOU 방지: 사전 findByPk 체크 없이 UniqueConstraintError에만 의존 (wiki/role과 일관)
    // afterCreate 훅이 Board.create를 실행하므로 트랜잭션으로 감싸야 Board 실패 시 User도 롤백됨
    try {
      return await sequelize.transaction(async t => {
        return User.create(
          {
            id: data.id,
            password: data.password, // Hook hashes
            name: data.name,
            email: data.email ? data.email.toLowerCase().trim() : null,
            roleId: 'guest',
            isActive: false,
          },
          { transaction: t }
        );
      });
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        const field = err.fields && 'email' in err.fields ? '이메일' : '아이디';
        throw new AppError(409, `이미 사용 중인 ${field}입니다.`);
      }
      throw err;
    }
  }

  // 토큰 검증 후 비밀번호 변경
  // (토큰 발급은 관리자 승인 흐름 passwordResetRequestService.approve에서 user.generatePasswordResetToken으로 수행)
  async resetPassword(token: string, newPassword: string): Promise<string | null> {
    // DB에는 SHA-256 해시가 저장되므로 입력 토큰을 해싱 후 비교
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpires: { [Op.gt]: new Date() },
        isActive: true,
        isDeleted: false,
      },
    });

    if (!user) return null;

    const hashedPassword = await bcrypt.hash(newPassword, getBcryptRounds());
    user.password = hashedPassword;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1; // 기존 세션 즉시 무효화
    // 이미 해싱된 값이므로 beforeUpdate 훅에서 재해싱 건너뜀 (hooks: false 대신 플래그 사용)
    user._skipPasswordHash = true;
    await user.save();
    return user.id; // 캐시 무효화를 위해 userId 반환
  }

  async getUserPermissions(
    userId: string,
    roleId: string
  ): Promise<{
    events: {
      canCreate: boolean;
      canRead: boolean;
      canUpdate: boolean;
      canDelete: boolean;
    };
    boards: {
      boardId: string;
      boardName: string;
      canRead: boolean;
      canWrite: boolean;
      canDelete: boolean;
    }[];
    personalBoard: {
      boardId: string;
      boardName: string;
      canRead: boolean;
      canWrite: boolean;
      canDelete: boolean;
    } | null;
  }> {
    const eventPermission = await EventPermission.findOne({ where: { roleId } });

    const boardPermissionsWithBoard = await BoardAccess.findAll({
      where: { roleId, canRead: true },
      include: [
        {
          model: Board,
          as: 'board',
          attributes: ['id', 'name'],
          where: { isActive: true, isPersonal: false },
        },
      ],
    });

    const personalBoard = await Board.findOne({
      where: { isPersonal: true, ownerId: userId, isActive: true },
      attributes: ['id', 'name'],
    });

    return {
      events: eventPermission
        ? {
            canCreate: eventPermission.canCreate,
            canRead: eventPermission.canRead,
            canUpdate: eventPermission.canUpdate,
            canDelete: eventPermission.canDelete,
          }
        : {
            canCreate: false,
            canRead: true,
            canUpdate: false,
            canDelete: false,
          },
      boards: boardPermissionsWithBoard.map(bp => ({
        boardId: bp.boardId,
        boardName: bp.board ? bp.board.name : 'Unknown',
        canRead: bp.canRead,
        canWrite: bp.canWrite,
        canDelete: bp.canDelete,
      })),
      personalBoard: personalBoard
        ? {
            boardId: personalBoard.id,
            boardName: personalBoard.name,
            canRead: true,
            canWrite: true,
            canDelete: true,
          }
        : null,
    };
  }
}

export const authService = new AuthService();
