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

// 없는 계정도 실재 계정과 같은 응답 시간이 걸리게 하는 더미 해시. rounds 가 같아야 시간이 맞으므로 값과 함께 캐시한다.
let dummyHashCache: { rounds: number; hash: string } | null = null;

async function compareAgainstDummy(password: string): Promise<void> {
  const rounds = getBcryptRounds();
  if (!dummyHashCache || dummyHashCache.rounds !== rounds) {
    const filler = crypto.randomBytes(16).toString('hex');
    dummyHashCache = { rounds, hash: await bcrypt.hash(filler, rounds) };
  }
  await bcrypt.compare(password, dummyHashCache.hash);
}

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

/** 오늘 몫의 출석 포인트를 지급한다. 지급 실패가 로그인을 막지 않도록 기다리지 않는다. */
function grantAttendanceIfDue(userId: string): void {
  void featureFlagService
    .isEnabled('tools.lottery')
    .then(on => (on ? pointService.claimAttendance(userId) : null))
    .catch(err => logError('출석 포인트 지급 실패', err, { userId }));
}

/** 진행 중이거나 방금 끝난 토큰 회전을 잠깐 기억한다. 키는 옛 refresh 토큰의 해시다. */
const REFRESH_GRACE_MS = 30_000;
const recentRefreshes = new Map<string, { at: number; result: Promise<LoginResult> }>();

function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** 유예가 지난 항목을 정리한다. */
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
      role: user.roleId,
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
              canRead: true,
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
      paranoid: false, // deletedAt 마이그레이션 전에도 조회되도록. 삭제 여부는 isDeleted 로 본다.
      include: [
        {
          model: Role,
          as: 'roleInfo',
          attributes: ['id', 'name', 'description', 'isActive'],
        },
      ],
    });

    if (!user) {
      // 없는 계정으로의 시도도 기록한다. 응답은 실재 계정일 때와 동일해야 한다.
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

      // 실재 계정 오답과 같은 시간이 걸리도록 한 번 비교한다.
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

    // 2FA 사용자는 추가 인증이 필요하다. 실패 카운터·lastLoginIp 갱신은 2FA 성공 후로 미룬다.
    if (user.twoFactorEnabled) {
      // 2FA 검증용 임시 토큰. tv 를 넣어 비밀번호 변경 시 무효화된다.
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
      // jti 로 매번 다른 토큰을 만든다. 없으면 같은 초의 두 로그인이 같은 토큰이 되어 세션이 덮인다.
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
   * 토큰 갱신. 같은 refresh 토큰으로 들어온 동시 요청은 한 번만 회전시키고 결과를 공유한다.
   * 이 기억은 프로세스마다 따로이므로 서버를 여러 대로 늘리면 공유 저장소가 필요하다.
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
    // 실패는 기억하지 않는다. 유예 동안 같은 오류가 반복되지 않게 한다.
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
        paranoid: false, // deletedAt 마이그레이션 전에도 조회되도록
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

      // tokenVersion 검증. tv 가 없는 구형 토큰도 tokenVersion 이 올라갔으면 거부한다.
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
        // 갱신에도 jti 가 필요하다. 같은 초에 갱신하면 sessionToken 유니크 제약에 걸린다.
        { id: user.id, tokenType: 'refresh', tv: user.tokenVersion ?? 0, jti: crypto.randomUUID() },
        process.env.JWT_REFRESH_SECRET!,
        { expiresIn: `${refreshDays}d`, algorithm: 'HS256' }
      );

      // DB 세션 활성 상태 확인 — forceLogout된 세션은 토큰 갱신 차단
      const sessionValid = await userSessionService.validateSession(token);
      if (!sessionValid) {
        throw new AppError(401, '세션이 만료되었습니다. 다시 로그인해주세요.');
      }

      // 다음 갱신에서도 추적되도록 DB 세션의 토큰을 교체한다. 실패해도 토큰은 정상 반환한다.
      await userSessionService
        .rotateSession(token, newRefreshToken)
        .catch(err => logError('세션 토큰 교체 실패 (토큰 갱신은 정상 완료)', err));

      // 리프레시만으로 이어 쓰는 사용자도 받도록 여기서도 지급한다. 하루 한 번은 pointService 가 보장한다.
      grantAttendanceIfDue(user.id);

      return {
        user,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        payload,
      };
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
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

    // 사전 조회 없이 UniqueConstraintError 로만 중복을 판단한다(TOCTOU 방지).
    // afterCreate 훅의 Board.create 가 실패하면 User 도 롤백되도록 트랜잭션으로 감싼다.
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

  // 토큰 검증 후 비밀번호 변경. 토큰 발급은 passwordResetRequestService.approve 에서 한다.
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
    // 이미 해싱된 값이라 beforeUpdate 훅의 재해싱을 건너뛴다.
    user._skipPasswordHash = true;
    await user.save();
    return user.id;
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
