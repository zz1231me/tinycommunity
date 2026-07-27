import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth-request';
import { ROLES } from '../config/constants';
import { sendForbidden } from '../utils/response';

export const isAdmin = (req: Request, res: Response, next: NextFunction): void => {
  const authReq = req as AuthRequest;
  if (authReq.user?.role !== ROLES.ADMIN) {
    sendForbidden(res, '관리자만 접근할 수 있습니다.');
    return;
  }
  next();
};
