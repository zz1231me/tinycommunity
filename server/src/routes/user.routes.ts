import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import { authenticate } from '../middlewares/auth.middleware';
import { apiLimiter } from '../middlewares/rate-limit.middleware';
import { AuthRequest } from '../types/auth-request';
import {
  getMyPosts,
  getMyComments,
  getMySecurityLogs,
  getMyActivity,
  searchUsers,
} from '../controllers/userProfile.controller';

const router = Router();

router.use(authenticate as RequestHandler);

router.get(
  '/me/posts',
  asyncHandler((req, res) => getMyPosts(req as AuthRequest, res))
);
router.get(
  '/me/comments',
  asyncHandler((req, res) => getMyComments(req as AuthRequest, res))
);
router.get(
  '/me/security-logs',
  asyncHandler((req, res) => getMySecurityLogs(req as AuthRequest, res))
);
router.get(
  '/me/activity',
  asyncHandler((req, res) => getMyActivity(req as AuthRequest, res))
);
router.get(
  '/search',
  apiLimiter as RequestHandler,
  asyncHandler((req, res) => searchUsers(req as AuthRequest, res))
);

export default router;
