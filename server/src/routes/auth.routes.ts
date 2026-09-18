// server/src/routes/auth.routes.ts
import { Router } from 'express';
import {
  login,
  register,
  changePassword,
  refreshToken,
  logout,
  getCurrentUser,
  getUserPermissions,
  updateTheme,
  uploadAvatar as uploadAvatarController,
  deleteAvatar,
  requestPasswordReset,
  verifyPasswordReset,
  updateProfile,
} from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth.middleware';
import {
  loginLimiter,
  passwordResetRequestLimiter,
  registerLimiter,
} from '../middlewares/bruteForceGuard';
import { uploadAvatar } from '../middlewares/upload/avatar'; // ✅ 직접 import
import { getOwnSessions, terminateOwnSession } from '../controllers/userSession.controller';

import { validateBody, validateUuidParam } from '../middlewares/validate.middleware';
import {
  loginSchema,
  registerSchema,
  changePasswordSchema,
  passwordResetRequestSchema,
  passwordResetVerifySchema,
} from '../validators/schemas';

const router = Router();

// 🔐 인증 관련 (엄격한 Rate Limiting + 입력값 검증 적용)
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: 로그인
 *     description: 성공 시 access_token·refresh_token 을 HttpOnly 쿠키로 설정한다. 2FA 가 켜진 계정은 2fa_pending 임시 토큰을 발급하고 /api/2fa 로 이어진다.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, password]
 *             properties:
 *               id: { type: string, example: admin }
 *               password: { type: string, format: password }
 *     responses:
 *       200: { description: 로그인 성공(또는 2FA 필요) }
 *       401: { description: 아이디 또는 비밀번호 불일치 }
 *       429: { description: 로그인 시도 제한 초과 }
 */
router.post('/login', loginLimiter, validateBody(loginSchema), login);
/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: 회원가입
 *     description: 가입 후 관리자 승인 전까지는 로그인할 수 없다.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, password, name]
 *             properties:
 *               id: { type: string, description: '영문·숫자·언더스코어 4~20자' }
 *               password: { type: string, format: password }
 *               name: { type: string }
 *               email: { type: string, format: email }
 *     responses:
 *       201: { description: 가입 요청 완료(관리자 승인 대기) }
 *       400: { description: 입력값 오류 }
 *       409: { description: 이미 존재하는 아이디 }
 */
router.post('/register', registerLimiter, validateBody(registerSchema), register);
router.post('/refresh', refreshToken);
// 로그인 없이 부를 수 있는데 요청 한 번이 남에게 피해를 준다 — 대기 중인 인증번호가
// 새로 발급되고(= 남의 재설정을 계속 무효로 만들 수 있다), 관리자마다 알림이 쌓인다.
// 리미터가 아이디로 세므로 validateBody 앞에 둔다(본문은 이미 파싱되어 있다).
router.post(
  '/password-reset-request',
  passwordResetRequestLimiter,
  validateBody(passwordResetRequestSchema),
  requestPasswordReset
);
router.post('/password-reset-verify', validateBody(passwordResetVerifySchema), verifyPasswordReset);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getCurrentUser);
router.post('/change-password', authenticate, validateBody(changePasswordSchema), changePassword);
router.get('/permissions', authenticate, getUserPermissions);

// 🧑 프로필(이름) 변경
router.patch('/me/profile', authenticate, updateProfile);

// 🎨 사용자 설정
router.patch('/theme', authenticate, updateTheme);

// 📸 아바타 관리
router.post(
  '/avatar',
  authenticate,
  uploadAvatar.single('avatar'), // ✅ 직접 사용
  uploadAvatarController
);
router.delete('/avatar', authenticate, deleteAvatar);

// 🖥️ 세션 조회/종료 (본인)
router.get('/sessions', authenticate, getOwnSessions);
router.delete(
  '/sessions/:sessionId',
  authenticate,
  validateUuidParam('sessionId'),
  terminateOwnSession
);

export default router;
