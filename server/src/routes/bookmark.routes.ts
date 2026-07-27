// server/src/routes/bookmark.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import asyncHandler from 'express-async-handler';
import { authenticate } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/roleCheck.middleware';
import { apiLimiter } from '../middlewares/rate-limit.middleware';
import {
  getBookmarks,
  getAllBookmarks,
  createBookmark,
  updateBookmark,
  deleteBookmark,
  reorderBookmarks,
} from '../controllers/bookmark.controller';
import { AuthRequest } from '../types/auth-request';

const router = Router();

// 타입 안전한 래퍼 함수
const wrapAuthHandler = (
  handler: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    return handler(req as AuthRequest, res, next);
  };
};

/**
 * 일반 사용자용 - 활성 북마크만 조회
 */
router.get('/', authenticate, apiLimiter, asyncHandler(wrapAuthHandler(getBookmarks)));

/**
 * 관리자용 - 모든 북마크 조회 (비활성 포함)
 */
router.get(
  '/all',
  authenticate,
  requireRole('admin'),
  asyncHandler(wrapAuthHandler(getAllBookmarks))
);

/**
 * 관리자용 - 북마크 생성
 */
router.post('/', authenticate, requireRole('admin'), asyncHandler(wrapAuthHandler(createBookmark)));

/**
 * 관리자용 - 북마크 순서 변경 (/:id 보다 먼저 등록해야 라우트 충돌 방지)
 */
router.put(
  '/reorder/batch',
  authenticate,
  requireRole('admin'),
  asyncHandler(wrapAuthHandler(reorderBookmarks))
);

/**
 * 관리자용 - 북마크 수정
 */
router.put(
  '/:id',
  authenticate,
  requireRole('admin'),
  asyncHandler(wrapAuthHandler(updateBookmark))
);

/**
 * 관리자용 - 북마크 삭제
 */
router.delete(
  '/:id',
  authenticate,
  requireRole('admin'),
  asyncHandler(wrapAuthHandler(deleteBookmark))
);

export default router;
