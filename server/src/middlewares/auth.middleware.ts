// ============================================================================
// server/src/middlewares/auth.middleware.ts
// JWT 쿠키 기반 인증 미들웨어
// ============================================================================

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

// ✅ 인증 미들웨어 캐시 (DB 조회 부하 감소)
// TTL: 30초 — 로그아웃 무효화는 최대 30초 내에 반영됨
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

// 역할 변경/삭제처럼 다수 사용자에게 영향을 주는 작업용 — 전체 사용자 캐시 무효화.
// (역할 비활성화/삭제 시 캐시된 roleInfo.isActive / tokenVersion 이 최대 TTL 동안 stale 하게 남아
//  취소된 세션이 통과하던 문제를 즉시 해소)
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
      logWarning('인증 실패: access_token 쿠키 없음');
      sendUnauthorized(res, '인증 토큰이 없습니다.');
      return;
    }

    const decoded = jwt.verify(access_token, env.JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as { id: string; tv?: number; type?: string };

    // ✅ 2fa_pending 임시 토큰은 액세스 토큰으로 사용 불가
    if (decoded.type === '2fa_pending') {
      logWarning('인증 실패: 2FA 임시 토큰은 액세스 토큰으로 사용할 수 없음');
      sendUnauthorized(res, '유효하지 않은 토큰 형식입니다.');
      return;
    }

    if (env.NODE_ENV === 'development') {
      logInfo(`디코딩된 사용자 ID: ${decoded.id}`);
    }

    // ✅ 캐시 우선 조회 (DB 부하 감소)
    let cachedUser = getCachedUser(decoded.id);

    if (!cachedUser) {
      const dbUser = await User.findByPk(decoded.id, {
        paranoid: false, // ✅ deletedAt 컬럼 마이그레이션 전에도 쿼리 가능 (isDeleted로 체크)
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

      // DB 조회 결과를 캐시에 저장
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
      userCache.set(decoded.id, cachedUser);
    }

    if (cachedUser.isDeleted) {
      logWarning(`인증 실패: 삭제된 계정 (userId: ${cachedUser.id})`);
      sendForbidden(res, '삭제된 계정입니다.');
      return;
    }

    // tokenVersion 검증: 로그아웃 후 기존 토큰 무효화
    // decoded.tv가 없는 구형 토큰이면서 tokenVersion이 이미 증가된 경우(로그아웃 이력)도 거부
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

    // 세션 단위 무효화: 이 요청의 refresh_token이 가리키는 DB 세션이 종료(isActive=false)됐으면
    // 액세스 토큰이 아직 유효해도 거부한다. tokenVersion(전체 무효화)과 달리 특정 세션만 끊는
    // '다른 기기 세션 종료/강제 로그아웃'이 액세스 토큰에도 즉시 반영되게 한다.
    // (refresh_token이 없으면 검사 생략 → 액세스 토큰 자체 검증에 위임. 로그인 직후 세션 생성 전
    //  race나 미추적 세션에서 정상 요청이 오인 차단되는 것을 방지)
    const refreshToken = req.cookies?.refresh_token;
    if (refreshToken && (await userSessionService.isSessionRevoked(refreshToken))) {
      logWarning(`인증 실패: 종료된 세션 (userId: ${cachedUser.id})`);
      sendUnauthorized(res, '세션이 종료되었습니다. 다시 로그인해주세요.');
      return;
    }

    // 강제 비밀번호 변경(관리자 초기화 후): 임시 비번으로 로그인한 사용자는 비밀번호 변경/세션
    // 관련 엔드포인트(/api/auth/*) 외 모든 요청을 차단한다. 클라이언트 강제 이동의 서버측 방어선.
    // ⚠️ 반드시 쿼리스트링을 제거한 '경로'로 검사한다. originalUrl 전체에 includes()를 쓰면
    //    `/api/notifications?x=/api/auth/` 같이 쿼리에 문자열을 심어 게이트를 우회할 수 있다.
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
