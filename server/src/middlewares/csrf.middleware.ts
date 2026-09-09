// server/src/middlewares/csrf.middleware.ts
// SameSite=Lax 쿠키와 함께 이중 CSRF 방어층 제공
// X-Requested-With 헤더 검증으로 cross-origin 폼 제출 차단

import { Request, Response, NextFunction } from 'express';
import { logWarning } from '../utils/logger';
import { sendError } from '../utils/response';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF 보호 미들웨어
 *
 * 쿠키는 sameSite: 'lax'로 설정되어 있어 cross-origin POST 폼 제출을 막지만,
 * XMLHttpRequest/fetch 요청에서는 X-Requested-With 헤더를 함께 검증하여
 * 추가 보호층을 제공한다.
 *
 * 클라이언트는 axios withCredentials: true 요청 시
 * 'X-Requested-With: XMLHttpRequest' 헤더를 포함해야 한다.
 */
export const csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
  // GET, HEAD, OPTIONS는 상태 변경 없음 — 통과
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const requestedWith = req.headers['x-requested-with'];

  if (!requestedWith || requestedWith !== 'XMLHttpRequest') {
    logWarning('CSRF 검증 실패: X-Requested-With 헤더 누락', {
      ip: req.ip,
      method: req.method,
      url: req.originalUrl,
      origin: req.headers.origin,
    });
    sendError(res, 403, 'CSRF 검증에 실패했습니다.');
    return;
  }

  next();
};
