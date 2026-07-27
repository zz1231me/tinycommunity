import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import {
  getPageTree,
  getPageBySlug,
  getPageHistory,
  getWikiEditPermissions,
  createPage,
  updatePage,
  deletePage,
} from '../controllers/wiki.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { checkWikiWritePermission } from '../middlewares/wikiPermission';
import { apiLimiter } from '../middlewares/rate-limit.middleware';
import { AuthRequest } from '../types/auth-request';

const router = Router();
router.use(authenticate as RequestHandler);
router.use(apiLimiter as RequestHandler);

router.get(
  '/permissions',
  asyncHandler((req, res) => getWikiEditPermissions(req as AuthRequest, res))
);
router.get(
  '/',
  asyncHandler((req, res) => getPageTree(req as AuthRequest, res))
);
router.get(
  '/:slug',
  asyncHandler((req, res) => getPageBySlug(req as AuthRequest, res))
);
// 이력 조회는 읽기 권한으로 충분 — checkWikiWritePermission 불필요
router.get(
  '/:slug/history',
  asyncHandler((req, res) => getPageHistory(req as AuthRequest, res))
);
router.post(
  '/',
  checkWikiWritePermission as RequestHandler,
  asyncHandler((req, res) => createPage(req as AuthRequest, res))
);
router.put(
  '/:slug',
  checkWikiWritePermission as RequestHandler,
  asyncHandler((req, res) => updatePage(req as AuthRequest, res))
);
router.delete(
  '/:slug',
  checkWikiWritePermission as RequestHandler,
  asyncHandler((req, res) => deletePage(req as AuthRequest, res))
);

export default router;
