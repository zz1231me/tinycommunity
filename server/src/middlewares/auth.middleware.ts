// JWT 쿠키 기반 인증 미들웨어.

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest } from '../types/auth-request';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { logInfo, logWarning, logError } from '../utils/logger';
import { sendUnauthorized, sendForbidden, sendError } from '../utils/response';
import { env } from '../config/env';
import { JWT_ALGORITHM } from '../config/constants';
import { userSessionService } from '../services/userSession.service';

// 사용자 캐시 TTL. 로그아웃 무효화는 최대 이 시간 안에 반영된다.
const USER_CACHE_TTL_MS = 30_000;
interface CachedUser {
  id: string;
  name: string;
  roleId: string;
  isActive: boolean;
  isDeleted: boolean;
  tokenVersion: number;
  mustChangePassword: boolean;
  roleInfo: { id: string; name: string; description: string | null; isActive: boolean } | null;
  cachedAt: number;
}
const userCache = new Map<string, CachedUser>();

// 캐시가 이 크기를 넘을 때만 만료분을 훑는다. 타이머는 종료 시 프로세스를 붙잡아 쓰지 않는다.
const USER_CACHE_SWEEP_THRESHOLD = 500;

function sweepExpiredUsers(now: number): void {
  for (const [id, entry] of userCache) {
    if (now - entry.cachedAt > USER_CACHE_TTL_MS) userCache.delete(id);
  }
}

function getCachedUser(userId: string): CachedUser | null {
  const entry = userCache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > USER_CACHE_TTL_MS) {
    userCache.delete(userId);
    return null;
  }
  return entry;
}

export function invalidateUserCache(userId: string): void {
  userCache.delete(userId);
}

// 역할 변경·삭제처럼 다수에게 영향을 주는 작업 후 캐시 전체를 비운다.
export function clearAllUserCaches(): void {
  userCache.clear();
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { access_token } = req.cookies;

    if (!access_token) {
      // 갱신 토큰이 남아 있으면 401 이 아니라 419 를 준다. 화면이 /auth/refresh 로 이어 간다.
      if (req.cookies?.refresh_token) {
        logWarning('access_token 없음 — refresh_token 있으므로 갱신 유도(419)');
        sendError(res, 419, '토큰이 만료되었습니다.');
        return;
      }
      logWarning('인증 실패: access_token 쿠키 없음');
      sendUnauthorized(res, '인증 토큰이 없습니다.');
      return;
    }

    const decoded = jwt.verify(access_token, env.JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as { id: string; tv?: number; type?: string };

    // 2fa_pending 임시 토큰은 액세스 토큰으로 쓸 수 없다
    if (decoded.type === '2fa_pending') {
      logWarning('인증 실패: 2FA 임시 토큰은 액세스 토큰으로 사용할 수 없음');
      sendUnauthorized(res, '유효하지 않은 토큰 형식입니다.');
      return;
    }

    if (env.NODE_ENV === 'development') {
      logInfo(`디코딩된 사용자 ID: ${decoded.id}`);
    }

    let cachedUser = getCachedUser(decoded.id);

    if (!cachedUser) {
      const dbUser = await User.findByPk(decoded.id, {
        paranoid: false, // deletedAt 컬럼이 없어도 조회 가능, 삭제는 isDeleted 로 판단
        include: [
          {
            model: Role,
            as: 'roleInfo',
            attributes: ['id', 'name', 'description', 'isActive'],
          },
        ],
        attributes: [
          'id',
          'name',
          'roleId',
          'email',
          'isActive',
          'isDeleted',
          'tokenVersion',
          'mustChangePassword',
        ],
      });

      if (!dbUser) {
        logWarning('인증 실패: 존재하지 않는 사용자');
        sendUnauthorized(res, '존재하지 않는 사용자입니다.');
        return;
      }

      cachedUser = {
        id: dbUser.id,
        name: dbUser.name,
        roleId: dbUser.roleId,
        isActive: dbUser.isActive,
        isDeleted: dbUser.isDeleted,
        tokenVersion: dbUser.tokenVersion ?? 0,
        mustChangePassword: dbUser.mustChangePassword ?? false,
        roleInfo: dbUser.roleInfo
          ? {
              id: dbUser.roleInfo.id,
              name: dbUser.roleInfo.name,
              description: dbUser.roleInfo.description,
              isActive: dbUser.roleInfo.isActive,
            }
          : null,
        cachedAt: Date.now(),
      };
      if (userCache.size >= USER_CACHE_SWEEP_THRESHOLD) sweepExpiredUsers(Date.now());
      userCache.set(decoded.id, cachedUser);
    }

    if (cachedUser.isDeleted) {
      logWarning(`인증 실패: 삭제된 계정 (userId: ${cachedUser.id})`);
      sendForbidden(res, '삭제된 계정입니다.');
      return;
    }

    // tokenVersion 검증. tv 가 없는 구형 토큰도 tokenVersion 이 올라가 있으면 거부한다.
    const tvMismatch =
      decoded.tv === undefined
        ? cachedUser.tokenVersion > 0
        : decoded.tv !== cachedUser.tokenVersion;
    if (tvMismatch) {
      logWarning(`인증 실패: 무효화된 토큰 (userId: ${cachedUser.id})`);
      sendUnauthorized(res, '만료된 토큰입니다. 다시 로그인해주세요.');
      return;
    }

    if (!cachedUser.isActive) {
      logWarning(`인증 실패: 비활성화된 계정 (userId: ${cachedUser.id})`);
      sendForbidden(res, '비활성화된 계정입니다.');
      return;
    }

    if (!cachedUser.roleInfo) {
      logError(`역할 정보 없음 - userId: ${cachedUser.id}, roleId: ${cachedUser.roleId}`);
      sendForbidden(res, '역할 정보가 없습니다. 관리자에게 문의하세요.');
      return;
    }

    if (!cachedUser.roleInfo.isActive) {
      logWarning(`인증 실패: 비활성화된 역할 (role: ${cachedUser.roleInfo.name})`);
      sendForbidden(res, '비활성화된 역할입니다.');
      return;
    }

    // 세션 단위 무효화. refresh_token 이 가리키는 세션이 종료됐으면 액세스 토큰이 살아 있어도 거부한다.
    // refresh_token 이 없으면 검사를 생략한다(로그인 직후 세션 생성 전 race 방지).
    const refreshToken = req.cookies?.refresh_token;
    if (refreshToken && (await userSessionService.isSessionRevoked(refreshToken))) {
      logWarning(`인증 실패: 종료된 세션 (userId: ${cachedUser.id})`);
      sendUnauthorized(res, '세션이 종료되었습니다. 다시 로그인해주세요.');
      return;
    }

    // 강제 비밀번호 변경 중에는 /api/auth/* 외 모든 요청을 막는다.
    // 반드시 쿼리스트링을 뗀 경로로 검사한다. originalUrl 에 includes 를 쓰면 우회된다.
    if (cachedUser.mustChangePassword) {
      const pathOnly = req.originalUrl.split('?')[0];
      if (!pathOnly.startsWith('/api/auth/')) {
        sendForbidden(res, '비밀번호를 먼저 변경해야 합니다.');
        return;
      }
    }

    (req as AuthRequest).user = {
      id: cachedUser.id,
      name: cachedUser.name,
      role: cachedUser.roleInfo.id,
    };

    if (env.NODE_ENV === 'development') {
      logInfo(`인증 성공 - userId: ${cachedUser.id}, role: ${cachedUser.roleInfo.name}`);
    }

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      sendError(res, 419, '토큰이 만료되었습니다.');
      return;
    }

    if (err instanceof jwt.JsonWebTokenError) {
      logWarning('JWT 검증 실패: 유효하지 않은 토큰');
      sendUnauthorized(res, '유효하지 않은 토큰입니다.');
      return;
    }

    logError('JWT 인증 처리 중 예기치 못한 오류', err);
    sendError(res, 500, '인증 처리 중 오류가 발생했습니다.');
  }
};
