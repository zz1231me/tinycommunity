import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import { getTags, createTag, updateTag, deleteTag } from '../controllers/tag.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { apiLimiter } from '../middlewares/rate-limit.middleware';
import { AuthRequest } from '../types/auth-request';

const router = Router();

// 생성/수정/삭제 인가는 컨트롤러에서 처리:
// 전역(공용) 태그는 admin, 게시판 태그는 admin/manager/해당 게시판 담당자(BoardManager)
router.get(
  '/',
  authenticate as RequestHandler,
  apiLimiter as RequestHandler,
  asyncHandler((req, res) => getTags(req as AuthRequest, res))
);
router.post(
  '/',
  authenticate as RequestHandler,
  apiLimiter as RequestHandler,
  asyncHandler((req, res) => createTag(req as AuthRequest, res))
);
router.put(
  '/:id',
  authenticate as RequestHandler,
  apiLimiter as RequestHandler,
  asyncHandler((req, res) => updateTag(req as AuthRequest, res))
);
router.delete(
  '/:id',
  authenticate as RequestHandler,
  apiLimiter as RequestHandler,
  asyncHandler((req, res) => deleteTag(req as AuthRequest, res))
);

export default router;
