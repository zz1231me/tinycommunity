import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { authenticate } from '../middlewares/auth.middleware';
import {
  generate2FASecret,
  enable2FA,
  disable2FA,
  verify2FALogin,
  get2FAStatus,
} from '../controllers/twoFactor.controller';
import { sendError } from '../utils/response';
import { twoFactorLimiter } from '../middlewares/bruteForceGuard';

const router = Router();

// 2FA 로그인 검증 전용 Rate Limiter. 성공도 카운트해야 코드 섞기 우회를 막는다.
// export는 테스트에서 카운터를 초기화하기 위한 것.
export const twoFaVerifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  handler: (_req, res) => {
    sendError(res, 429, '2FA 인증 시도 횟수를 초과했습니다. 5분 후 다시 시도해주세요.');
  },
});

router.get('/status', authenticate, get2FAStatus as any);

router.post('/generate', authenticate, generate2FASecret as any);

// 사용자별 limiter는 authenticate 뒤에 둔다.
router.post('/enable', authenticate, twoFactorLimiter, enable2FA as any);

// 사용자별 limiter는 authenticate 뒤에 둔다.
router.post('/disable', authenticate, twoFactorLimiter, disable2FA as any);

router.post('/verify-login', twoFaVerifyLimiter, verify2FALogin as any);

export default router;
