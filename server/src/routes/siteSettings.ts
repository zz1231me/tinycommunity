// src/routes/siteSettings.ts
import { Router, RequestHandler } from 'express';
import {
  getSiteSettings,
  getAdminSiteSettings,
  updateSiteSettings,
  uploadSiteAsset,
} from '../controllers/siteSettings';
import { authenticate } from '../middlewares/auth.middleware';
import { isAdmin } from '../middlewares/isAdmin';
import { uploadImages } from '../middlewares/upload/image';

const router = Router();

// 공개 API: 사이트 설정 조회 (보안 설정 제외 — controllers/siteSettings.ts toPayload 주석 참고)
router.get('/', getSiteSettings);

// 관리자 전용: 보안 설정까지 포함한 전체 조회 (설정 폼용)
router.get(
  '/admin',
  authenticate as RequestHandler,
  isAdmin as RequestHandler,
  getAdminSiteSettings as RequestHandler
);

// 관리자 전용: 사이트 설정 업데이트
router.put('/', authenticate as RequestHandler, isAdmin as RequestHandler, updateSiteSettings);

// 관리자 전용: 로고/파비콘 파일 업로드
// POST /api/site-settings/upload-asset  (field name: "file")
router.post(
  '/upload-asset',
  authenticate as RequestHandler,
  isAdmin as RequestHandler,
  uploadImages.single('file'),
  uploadSiteAsset as RequestHandler
);

export default router;
