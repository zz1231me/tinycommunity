import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth-request';
import { SiteSettings } from '../models/SiteSettings';
import { sendForbidden } from '../utils/response';
import { logError } from '../utils/logger';
import { isAdminOrManager } from '../config/constants';

export const checkWikiWritePermission = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authReq = req as AuthRequest;
  const userRole = authReq.user?.role;

  if (!userRole) {
    sendForbidden(res, '위키 편집 권한이 없습니다.');
    return;
  }

  // admin/manager는 wikiEditRoles 설정 무관하게 항상 편집 허용
  if (isAdminOrManager(userRole)) {
    next();
    return;
  }

  try {
    const settings = await SiteSettings.findOne();
    let allowedRoles: string[] = ['admin', 'manager'];
    if (settings?.wikiEditRoles) {
      try {
        const parsed = JSON.parse(settings.wikiEditRoles);
        if (Array.isArray(parsed) && parsed.every(v => typeof v === 'string')) {
          allowedRoles = parsed;
        }
      } catch {
        // 파싱 실패 시 기본값 유지
      }
    }

    if (!allowedRoles.includes(userRole)) {
      sendForbidden(res, '위키 편집 권한이 없습니다.');
      return;
    }

    next();
  } catch (err) {
    logError('wikiEditRoles 설정 파싱 오류', err);
    sendForbidden(res, '권한 확인 중 오류가 발생했습니다.');
  }
};
