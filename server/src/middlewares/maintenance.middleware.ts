import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { SiteSettings } from '../models';

// 설정 저장 시 또는 TTL 경과 후 갱신되는 인메모리 캐시
let _mode: boolean | null = null;
let _message: string | null = null;
let _expiry = 0;
const CACHE_TTL = 30_000;

/** SiteSettings 저장 후 호출해 변경을 즉시 반영한다. */
export const refreshMaintenanceCache = () => {
  _mode = null;
  _expiry = 0;
};

/** 점검 모드일 때 관리자가 아닌 요청을 503 으로 막는다. */
export const maintenanceMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (_mode === null || Date.now() > _expiry) {
      // SiteSettings 행의 id 가 1이 아닐 수 있어 findByPk 가 아니라 findOne 을 쓴다.
      const settings = await SiteSettings.findOne({
        attributes: ['maintenanceMode', 'maintenanceMessage'],
      });
      _mode = settings?.maintenanceMode ?? false;
      _message = settings?.maintenanceMessage ?? null;
      _expiry = Date.now() + CACHE_TTL;
    }

    if (!_mode) return next();

    // 점검 중에도 로그인·사이트설정·2FA 는 허용한다. 미들웨어가 /api 에 붙어 req.path 는 상대 경로다.
    // 세그먼트 경계를 검사한다. startsWith('/auth') 만으로는 /auth-bypass 도 통과한다.
    const alwaysAllow = ['/auth', '/site-settings', '/2fa'];
    if (alwaysAllow.some(p => req.path === p || req.path.startsWith(p + '/'))) return next();

    // 역할은 JWT 에 있으므로 DB 조회 없이 쿠키 토큰에서 읽는다.
    try {
      const token = req.cookies?.access_token;
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!, {
          algorithms: ['HS256'],
        }) as { role?: string };
        if (decoded.role === 'admin' || decoded.role === 'manager') return next();
      }
    } catch {
      // 토큰이 없거나 유효하지 않으면 차단으로 넘어간다.
    }

    res.status(503).json({
      success: false,
      message: _message || '현재 서비스 점검 중입니다. 잠시 후 다시 이용해주세요.',
      maintenanceMode: true,
    });
  } catch {
    next(); // 미들웨어 오류로 요청을 막지 않는다
  }
};
