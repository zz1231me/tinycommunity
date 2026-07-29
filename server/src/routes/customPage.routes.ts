// server/src/routes/customPage.routes.ts
import { Router, RequestHandler } from 'express';
import multer from 'multer';
import { authenticate } from '../middlewares/auth.middleware';
import { isAdmin } from '../middlewares/isAdmin';
import {
  listPublishedPages,
  getPageBySlug,
  adminListPages,
  createPage,
  updatePage,
  deletePage,
  uploadBundle,
  serveBundle,
  listBundleFiles,
  BUNDLE_MAX_ZIP,
} from '../controllers/customPage.controller';

const router = Router();

// 번들 ZIP 업로드 — 메모리에서 받아 컨트롤러가 안전 검증 후 디스크에 해제
const bundleUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: BUNDLE_MAX_ZIP, files: 1 },
});

// 모든 라우트 인증 필요
router.use(authenticate as RequestHandler);

// 사용자 — 게시된 페이지 목록(사이드바)
router.get('/', listPublishedPages);

// 관리자 — 전체/생성/수정/삭제 (★'/:slug'보다 먼저 선언해 라우트 충돌 방지)
router.get('/admin', isAdmin as RequestHandler, adminListPages);
router.post('/', isAdmin as RequestHandler, createPage);
router.put('/:id', isAdmin as RequestHandler, updatePage);
router.delete('/:id', isAdmin as RequestHandler, deletePage);

// 관리자 — 번들(ZIP) 업로드 + 번들 내 HTML 파일 목록(진입 파일 선택용)
router.post(
  '/:id/bundle',
  isAdmin as RequestHandler,
  bundleUpload.single('bundle') as RequestHandler,
  uploadBundle
);
router.get('/:id/bundle-files', isAdmin as RequestHandler, listBundleFiles);

// 번들 정적 파일 서빙 (진입 파일 + 하위 자산). '/:slug'보다 먼저 선언.
router.get('/:slug/bundle', serveBundle);
router.get('/:slug/bundle/*splat', serveBundle);

// 사용자 — slug로 페이지 원문 조회
router.get('/:slug', getPageBySlug);

export default router;
