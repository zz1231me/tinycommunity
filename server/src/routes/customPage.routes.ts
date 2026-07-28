// server/src/routes/customPage.routes.ts
import { Router, RequestHandler } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { isAdmin } from '../middlewares/isAdmin';
import {
  listPublishedPages,
  getPageBySlug,
  adminListPages,
  createPage,
  updatePage,
  deletePage,
} from '../controllers/customPage.controller';

const router = Router();

// 모든 라우트 인증 필요
router.use(authenticate as RequestHandler);

// 사용자 — 게시된 페이지 목록(사이드바)
router.get('/', listPublishedPages);

// 관리자 — 전체/생성/수정/삭제 (★'/:slug'보다 먼저 선언해 라우트 충돌 방지)
router.get('/admin', isAdmin as RequestHandler, adminListPages);
router.post('/', isAdmin as RequestHandler, createPage);
router.put('/:id', isAdmin as RequestHandler, updatePage);
router.delete('/:id', isAdmin as RequestHandler, deletePage);

// 사용자 — slug로 페이지 원문 조회
router.get('/:slug', getPageBySlug);

export default router;
