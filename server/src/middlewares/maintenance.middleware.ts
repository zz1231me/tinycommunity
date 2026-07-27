// server/src/middlewares/maintenance.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { SiteSettings } from '../models';

// In-memory cache — refreshed on settings update or after TTL
let _mode: boolean | null = null;
let _message: string | null = null;
let _expiry = 0;
const CACHE_TTL = 30_000; // 30 seconds

/** Call after saving SiteSettings to immediately reflect the change */
export const refreshMaintenanceCache = () => {
  _mode = null;
  _expiry = 0;
};

/** Blocks non-admin users with 503 when maintenance mode is active */
export const maintenanceMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Rebuild cache when stale
    if (_mode === null || Date.now() > _expiry) {
      // findByPk(1)은 SiteSettings 행의 ID가 1이 아닐 때 null 반환 → maintenance 무시되는 버그
      // siteSettings.ts(#125)와 동일하게 findOne으로 변경
      const settings = await SiteSettings.findOne({
        attributes: ['maintenanceMode', 'maintenanceMessage'],
      });
      _mode = settings?.maintenanceMode ?? false;
      _message = settings?.maintenanceMessage ?? null;
      _expiry = Date.now() + CACHE_TTL;
    }

    if (!_mode) return next();

    // Always allow: auth, site-settings (so login + maintenance banner still work), 2FA
    // NOTE: middleware is mounted at /api, so req.path is relative (e.g. /auth/login, not /api/auth/login)
    // ⚠️ 세그먼트 경계를 검사해야 한다. 단순 startsWith('/auth')는 /auth-bypass 같은 경로도 통과시킴.
    const alwaysAllow = ['/auth', '/site-settings', '/2fa'];
    if (alwaysAllow.some(p => req.path === p || req.path.startsWith(p + '/'))) return next();

    // Decode token from cookie to check role — no DB query needed (role is in JWT payload)
    try {
      const token = req.cookies?.access_token;
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!, {
          algorithms: ['HS256'],
        }) as { role?: string };
        if (decoded.role === 'admin' || decoded.role === 'manager') return next();
      }
    } catch {
      // Invalid or missing token — fall through to block
    }

    res.status(503).json({
      success: false,
      message: _message || '현재 서비스 점검 중입니다. 잠시 후 다시 이용해 주세요.',
      maintenanceMode: true,
    });
  } catch {
    next(); // Never block on middleware error
  }
};
