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
  resetPassword,
  updateProfile,
} from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { uploadAvatar } from '../middlewares/upload/avatar'; // ✅ 직접 import
import { getOwnSessions, terminateOwnSession } from '../controllers/userSession.controller';

import {
  authLimiter,
  refreshLimiter,
  passwordResetLimiter,
} from '../middlewares/rate-limit.middleware';
import { validateBody, validateUuidParam } from '../middlewares/validate.middleware';
import {
  loginSchema,
  registerSchema,
  changePasswordSchema,
  passwordResetRequestSchema,
  resetPasswordSchema,
} from '../validators/schemas';

const router = Router();

// 🔐 인증 관련 (엄격한 Rate Limiting + 입력값 검증 적용)
router.post('/login', authLimiter, validateBody(loginSchema), login);
router.post('/register', authLimiter, validateBody(registerSchema), register);
router.post('/refresh', refreshLimiter, refreshToken);
router.post(
  '/password-reset-request',
  passwordResetLimiter,
  validateBody(passwordResetRequestSchema),
  requestPasswordReset
);
router.post('/reset-password', authLimiter, validateBody(resetPasswordSchema), resetPassword);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getCurrentUser);
router.post(
  '/change-password',
  authenticate,
  authLimiter,
  validateBody(changePasswordSchema),
  changePassword
);
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
