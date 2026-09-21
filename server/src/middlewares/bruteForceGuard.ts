// 비밀을 직접 맞혀 보는 요청만 막는다. 관리자 설정이 아니라 고정값이다.

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RATE_LIMIT } from '../config/constants';
import { logWarning } from '../utils/logger';

/** 비밀글 비밀번호 확인 (사용자·글 단위). 성공한 요청도 세야 우회를 막는다. */
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
 * 비밀번호 재설정 요청 (아이디 단위).
 * 요청마다 대기 중인 인증번호가 새로 발급되고 관리자 알림이 쌓인다.
 * IP 가 아니라 아이디로 세야 IP 를 바꿔 가며 한 사람을 겨냥하는 것을 막는다.
 */
export const passwordResetRequestLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: 'draft-6',
  legacyHeaders: false,
  keyGenerator: req => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loginId = (req as any).body?.loginId;
    return typeof loginId === 'string' && loginId.length > 0
      ? `pwreset:id:${loginId.toLowerCase()}`
      : `pwreset:ip:${ipKeyGenerator(req.ip ?? '')}`;
  },
  handler: (req, res) => {
    logWarning('비밀번호 재설정 요청 과다', { ip: req.ip });
    res.status(429).json({
      success: false,
      message: '재설정 요청이 너무 잦습니다. 10분 후 다시 시도해주세요.',
    });
  },
});

/**
 * 로그인 실패 (IP 단위).
 * 계정 잠금(models/User)과 함께 있어야 한다. 계정 잠금은 password spraying 을 못 막는다.
 * 같은 IP 를 공유하는 사무실을 위해 성공한 로그인은 세지 않는다.
 */
export const loginLimiter = rateLimit({
  windowMs: RATE_LIMIT.LOGIN_WINDOW_MS,
  max: RATE_LIMIT.LOGIN_FAIL_MAX,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-6',
  legacyHeaders: false,
  keyGenerator: req => `login:ip:${ipKeyGenerator(req.ip ?? '')}`,
  handler: (req, res) => {
    logWarning('로그인 실패 과다', { ip: req.ip });
    res.status(429).json({
      success: false,
      message: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.',
    });
  },
});

/** 가입 요청 (IP 단위). 승인 대기 목록이 쓰레기로 채워지는 것을 막는다. */
export const registerLimiter = rateLimit({
  windowMs: RATE_LIMIT.REGISTER_WINDOW_MS,
  max: RATE_LIMIT.REGISTER_MAX,
  standardHeaders: 'draft-6',
  legacyHeaders: false,
  keyGenerator: req => `register:ip:${ipKeyGenerator(req.ip ?? '')}`,
  handler: (req, res) => {
    logWarning('가입 요청 과다', { ip: req.ip });
    res.status(429).json({
      success: false,
      message: '가입 요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.',
    });
  },
});

/**
 * 2FA 켜기·끄기 (사용자 단위).
 * authenticate 뒤에 두어야 req.user 가 채워져 사용자별로 센다.
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
