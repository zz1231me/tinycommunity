import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import { getMemos, createMemo, updateMemo, deleteMemo } from '../controllers/memo.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { AuthRequest } from '../types/auth-request';
import { apiLimiter } from '../middlewares/rate-limit.middleware';

const router = Router();
router.use(authenticate as RequestHandler);
router.use(apiLimiter);

router.get(
  '/',
  asyncHandler((req, res) => getMemos(req as AuthRequest, res))
);
router.post(
  '/',
  asyncHandler((req, res) => createMemo(req as AuthRequest, res))
);
router.put(
  '/:id',
  asyncHandler((req, res) => updateMemo(req as AuthRequest, res))
);
router.delete(
  '/:id',
  asyncHandler((req, res) => deleteMemo(req as AuthRequest, res))
);

export default router;
