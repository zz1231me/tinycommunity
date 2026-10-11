// /api/features. 화면 숨김용이며 실제 차단은 각 라우트의 requireFeature 가 한다.

import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import {
  getEnabledFeatures,
  getHiddenMenus,
  updateHiddenMenus,
} from '../controllers/featureFlag.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/features:
 *   get:
 *     summary: 이 사람에게 켜져 있는 기능 목록
 *     description: '{ "post.like": true, ... } 형태. 사이트 전체 값에 역할·개인 예외를 얹은 결과다. 화면 숨김 판단용이며 차단은 각 API가 한다.'
 *     tags: [Features]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 기능 키 → 사용 여부 }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get(
  '/',
  authenticate as RequestHandler,
  asyncHandler((req, res) => getEnabledFeatures(req, res))
);

/**
 * @swagger
 * /api/features/hidden-menus:
 *   get:
 *     summary: 본인이 사이드바에서 숨긴 메뉴(기능 키 배열)
 *     tags: [Features]
 *     security: [{ cookieAuth: [] }]
 *   put:
 *     summary: 숨길 메뉴 목록 저장
 *     description: 권한이 아니라 보기 설정이다. 주소로 들어가면 그대로 열린다.
 *     tags: [Features]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               hiddenMenus: { type: array, items: { type: string } }
 */
router.get(
  '/hidden-menus',
  authenticate as RequestHandler,
  asyncHandler((req, res) => getHiddenMenus(req, res))
);
router.put(
  '/hidden-menus',
  authenticate as RequestHandler,
  asyncHandler((req, res) => updateHiddenMenus(req, res))
);

export default router;
