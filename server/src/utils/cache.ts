import NodeCache from 'node-cache';
import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth-request';
import { logInfo } from './logger';
import { CACHE_TTL, CACHE_CHECK_PERIOD } from '../config/constants';

const cache = new NodeCache({
  stdTTL: CACHE_TTL.DEFAULT,
  checkperiod: CACHE_CHECK_PERIOD,
  useClones: false,
});

// 같은 사용자가 30분 안에 같은 글을 다시 열면 조회수를 올리지 않는다.
const viewCountCache = new NodeCache({ stdTTL: 60 * 30, checkperiod: 120, useClones: false });
/** 조회수를 올려도 되는지. 쿨다운(30분) 안에 이미 봤으면 false 이고, 아니면 쿨다운을 새로 건다. */
export const shouldCountView = (userId: string, postId: string): boolean => {
  const key = `${userId}:${postId}`;
  if (viewCountCache.get(key)) return false;
  viewCountCache.set(key, 1);
  return true;
};

export const cacheMiddleware = (keyPrefix: string, ttl?: number) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method !== 'GET') {
      next();
      return;
    }

    const authReq = req as AuthRequest;
    const userId = authReq.user?.id;

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

    const originalJson = res.json.bind(res);

    // 2xx 응답만 캐시한다. 에러 응답이 캐시되면 오염된다.
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

export const invalidateCache = (keyPattern: string, userId?: string): void => {
  const keys = cache.keys();
  let matchedKeys: string[];

  if (userId) {
    matchedKeys = keys.filter(key => key.includes(keyPattern) && key.includes(`:${userId}:`));
  } else {
    matchedKeys = keys.filter(key => key.includes(keyPattern));
  }

  matchedKeys.forEach(key => cache.del(key));

  if (matchedKeys.length > 0) {
    logInfo(
      `Invalidated ${matchedKeys.length} cache entries for pattern: ${keyPattern}${userId ? ` (user: ${userId})` : ''}`
    );
  }
};

export const invalidateUserCache = (userId: string): void => {
  const keys = cache.keys();
  const matchedKeys = keys.filter(key => key.includes(`:${userId}:`));

  matchedKeys.forEach(key => cache.del(key));

  if (matchedKeys.length > 0) {
    logInfo(`Invalidated ${matchedKeys.length} cache entries for user: ${userId}`);
  }
};

export const getCacheStats = () => {
  return {
    keys: cache.keys().length,
    hits: cache.getStats().hits,
    misses: cache.getStats().misses,
    ksize: cache.getStats().ksize,
    vsize: cache.getStats().vsize,
  };
};
