// server/src/routes/rateLimitAdmin.routes.ts - Rate Limiting 관리 라우트
import { Router, RequestHandler } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/roleCheck.middleware';
import {
  getRateLimitSettings,
  createRateLimitSettings,
  updateRateLimitSettings,
  deleteRateLimitSettings,
  toggleRateLimitSettings,
  refreshRateLimitCache,
  applyRateLimitPreset,
} from '../controllers/rateLimitAdmin.controller';

const router = Router();

/**
 * ✅ 모든 라우트에 관리자 권한 필요
 */
router.use(authenticate as RequestHandler);
router.use(requireRole('admin') as RequestHandler);

/**
 * ✅ Rate Limiting 설정 목록 조회
 * GET /api/admin/rate-limits
 */
router.get('/', getRateLimitSettings as RequestHandler);

/**
 * ✅ Rate Limiting 설정 생성
 * POST /api/admin/rate-limits
 */
router.post('/', createRateLimitSettings as RequestHandler);

/**
 * ✅ Rate Limiting 설정 수정
 * PUT /api/admin/rate-limits/:id
 */
router.put('/:id', updateRateLimitSettings as RequestHandler);

/**
 * ✅ Rate Limiting 설정 삭제
 * DELETE /api/admin/rate-limits/:id
 */
router.delete('/:id', deleteRateLimitSettings as RequestHandler);

/**
 * ✅ Rate Limiting 설정 활성화/비활성화 토글
 * PATCH /api/admin/rate-limits/:id/toggle
 */
router.patch('/:id/toggle', toggleRateLimitSettings as RequestHandler);

/**
 * ✅ Rate Limiting 캐시 새로고침
 * POST /api/admin/rate-limits/refresh-cache
 */
router.post('/refresh-cache', refreshRateLimitCache as RequestHandler);

/**
 * ✅ Rate Limiting 프리셋 적용
 * POST /api/admin/rate-limits/presets/:preset
 */
router.post('/presets/:preset', applyRateLimitPreset as RequestHandler);

export default router;
