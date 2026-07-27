// src/routes/siteSettings.ts
import { Router, RequestHandler } from 'express';
import { getSiteSettings, updateSiteSettings, uploadSiteAsset } from '../controllers/siteSettings';
import { authenticate } from '../middlewares/auth.middleware';
import { isAdmin } from '../middlewares/isAdmin';
import { uploadImages } from '../middlewares/upload/image';

const router = Router();

// 공개 API: 사이트 설정 조회
router.get('/', getSiteSettings);

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
