// server/src/middlewares/bruteForceGuard.ts
// 비밀을 직접 맞혀 보는 요청만 막는다.
//
// 일반적인 요청 수 제한은 걷어냈지만, 여기 둘은 성격이 다르다 — 6자리 TOTP 와
// 비밀글 비밀번호는 시도 횟수를 막지 않으면 그냥 다 해 보면 뚫린다.
// 관리자가 조정하는 설정이 아니라 고정값이다.

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RATE_LIMIT } from '../config/constants';
import { logWarning } from '../utils/logger';

/**
 * 비밀글 비밀번호 확인 (사용자·글 단위).
 * 성공한 요청도 센다 — 정답을 섞어 카운터를 되돌리는 우회를 막는다.
 */
export const secretPostLimiter = rateLimit({
  windowMs: RATE_LIMIT.SECRET_POST_WINDOW_MS,
  max: RATE_LIMIT.SECRET_POST_MAX,
  keyGenerator: req => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req as any).user?.id;
    const postId = req.params?.id || 'unknown';
    return userId
      ? `secret-verify:user:${userId}:post:${postId}`
      : `secret-verify:ip:${ipKeyGenerator(req.ip ?? '')}:post:${postId}`;
  },
  handler: (req, res) => {
    logWarning('비밀글 비밀번호 brute-force 시도', { ip: req.ip, postId: req.params?.id });
    res.status(429).json({
      success: false,
      message: '비밀번호 시도 횟수를 초과했습니다. 5분 후 다시 시도해주세요.',
    });
  },
});

/**
 * 2FA 켜기·끄기 (사용자 단위).
 * 두 엔드포인트 모두 6자리 TOTP 를 검증한다. authenticate 뒤에 두어야
 * req.user 가 채워져 사용자별로 센다(인증 전이면 IP 로 센다).
 */
export const twoFactorLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: 'draft-6',
  legacyHeaders: false,
  keyGenerator: req => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req as any).user?.id;
    return userId ? `2fa:user:${userId}` : `2fa:ip:${ipKeyGenerator(req.ip ?? '')}`;
  },
  handler: (req, res) => {
    logWarning('2FA 설정 변경 Rate limit 초과', { ip: req.ip });
    res.status(429).json({
      success: false,
      message: '시도 횟수를 초과했습니다. 5분 후 다시 시도해주세요.',
    });
  },
});
