// server/src/utils/cache.ts
import NodeCache from 'node-cache';
import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth-request';
import { logInfo } from './logger';
import { CACHE_TTL, CACHE_CHECK_PERIOD } from '../config/constants';

// 캐시 인스턴스 생성
const cache = new NodeCache({
  stdTTL: CACHE_TTL.DEFAULT,
  checkperiod: CACHE_CHECK_PERIOD,
  useClones: false, // 성능 향상을 위해 복제 비활성화
});

// 캐시 미들웨어 팩토리 - ✅ 사용자별 캐시 지원
export const cacheMiddleware = (keyPrefix: string, ttl?: number) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // GET 요청만 캐싱
    if (req.method !== 'GET') {
      next();
      return;
    }

    const authReq = req as AuthRequest;
    const userId = authReq.user?.id;

    // ✅ 사용자별 캐시 키 생성 (인증된 요청에 대해서만)
    let cacheKey: string;
    if (userId) {
      cacheKey = `${keyPrefix}:${userId}:${req.originalUrl}`;
    } else {
      cacheKey = `${keyPrefix}:${req.originalUrl}`;
    }

    const cached = cache.get(cacheKey);

    if (cached) {
      logInfo(`Cache hit: ${keyPrefix}:${req.originalUrl}${userId ? ` (user: ${userId})` : ''}`);
      res.setHeader('X-Cache', 'HIT');
      res.json(cached);
      return;
    }

    logInfo(`Cache miss: ${keyPrefix}:${req.originalUrl}${userId ? ` (user: ${userId})` : ''}`);
    res.setHeader('X-Cache', 'MISS');

    // 원본 res.json 메서드 저장
    const originalJson = res.json.bind(res);

    // res.json 오버라이드 — 2xx 응답만 캐시 (에러 응답 캐시 오염 방지)
    res.json = function (data: any) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const cacheTTL = ttl ?? 300;
        cache.set(cacheKey, data, cacheTTL);
        logInfo(
          `Cached: ${keyPrefix}:${req.originalUrl}${userId ? ` (user: ${userId})` : ''} (TTL: ${cacheTTL}s)`
        );
      }
      return originalJson(data);
    };

    next();
  };
};

// 특정 키 패턴의 캐시 삭제 - ✅ 사용자별 삭제 지원
export const invalidateCache = (keyPattern: string, userId?: string): void => {
  const keys = cache.keys();
  let matchedKeys: string[];

  if (userId) {
    // 특정 사용자의 캐시만 삭제
    matchedKeys = keys.filter(key => key.includes(keyPattern) && key.includes(`:${userId}:`));
  } else {
    // 패턴에 일치하는 모든 캐시 삭제
    matchedKeys = keys.filter(key => key.includes(keyPattern));
  }

  matchedKeys.forEach(key => cache.del(key));

  if (matchedKeys.length > 0) {
    logInfo(
      `Invalidated ${matchedKeys.length} cache entries for pattern: ${keyPattern}${userId ? ` (user: ${userId})` : ''}`
    );
  }
};

// 특정 사용자의 모든 캐시 삭제
export const invalidateUserCache = (userId: string): void => {
  const keys = cache.keys();
  const matchedKeys = keys.filter(key => key.includes(`:${userId}:`));

  matchedKeys.forEach(key => cache.del(key));

  if (matchedKeys.length > 0) {
    logInfo(`Invalidated ${matchedKeys.length} cache entries for user: ${userId}`);
  }
};

// 캐시 통계
export const getCacheStats = () => {
  return {
    keys: cache.keys().length,
    hits: cache.getStats().hits,
    misses: cache.getStats().misses,
    ksize: cache.getStats().ksize,
    vsize: cache.getStats().vsize,
  };
};
