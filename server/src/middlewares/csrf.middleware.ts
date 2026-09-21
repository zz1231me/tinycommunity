import { Request, Response, NextFunction } from 'express';
import { logWarning } from '../utils/logger';
import { sendError } from '../utils/response';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** SameSite=Lax 쿠키에 더해 X-Requested-With 헤더를 검증한다. */
export const csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
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
