// server/src/middlewares/rate-limit.middleware.ts
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { logWarning } from '../utils/logger';
import { env } from '../config/env';
import { RATE_LIMIT } from '../config/constants';
import { getRateLimitSettings } from '../utils/settingsCache';

// 일반 API 요청 제한
export const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: () => getRateLimitSettings().apiMax,
  message: {
    success: false,
    message: '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.',
  },
  standardHeaders: 'draft-6',
  legacyHeaders: false,
  keyGenerator: req => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req as any).user?.id;
    return userId ? `user:${userId}` : ipKeyGenerator(req.ip ?? '');
  },
  handler: (req, res) => {
    logWarning('Rate limit 초과', { ip: req.ip });
    res.status(429).json({
      success: false,
      message: '요청 한도를 초과했습니다. 15분 후 다시 시도해주세요.',
    });
  },
});

// 토큰 갱신 전용 제한 (authLimiter와 분리)
// - skipSuccessfulRequests 없음: 성공/실패 모두 카운트 (갱신 남용 방지)
// - 15분에 30회: 정상 사용에서는 절대 초과 안 됨
export const refreshLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: 30,
  standardHeaders: 'draft-6',
  legacyHeaders: false,
  keyGenerator: req => `refresh:${ipKeyGenerator(req.ip ?? '')}`,
  handler: (req, res) => {
    logWarning('토큰 갱신 Rate limit 초과', { ip: req.ip });
    res.status(429).json({
      success: false,
      message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
    });
  },
});

// 로그인 API 특별 제한
export const authLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: () =>
    env.NODE_ENV === 'development' ? RATE_LIMIT.AUTH_MAX_DEV : getRateLimitSettings().authMax,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: '로그인 시도 횟수를 초과했습니다. 15분 후 다시 시도해주세요.',
  },
  handler: (req, res) => {
    logWarning('로그인 Rate limit 초과', { ip: req.ip });
    res.status(429).json({
      success: false,
      message: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.',
    });
  },
});

// 관리자 API 제한
export const adminLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: RATE_LIMIT.ADMIN_MAX,
  message: {
    success: false,
    message: '관리자 API 요청 한도를 초과했습니다.',
  },
});

// 파일 업로드 제한
export const uploadLimiter = rateLimit({
  windowMs: RATE_LIMIT.UPLOAD_WINDOW_MS,
  max: () => getRateLimitSettings().uploadMax,
  message: {
    success: false,
    message: '파일 업로드 한도를 초과했습니다. 1시간 후 다시 시도해주세요.',
  },
});

// 비밀글 비밀번호 인증 제한 (IP + userId 기준)
// skipSuccessfulRequests 미사용: 정답을 섞어 카운터를 리셋하는 brute-force 우회를 방지
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

// 비밀번호 초기화 요청 전용 제한 (skipSuccessfulRequests 없음 — 항상 200 응답이라 카운터가 증가해야 함)
export const passwordResetLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: 5,
  standardHeaders: 'draft-6',
  legacyHeaders: false,
  keyGenerator: req => `pwreset:${ipKeyGenerator(req.ip ?? '')}`,
  handler: (req, res) => {
    logWarning('비밀번호 초기화 요청 Rate limit 초과', { ip: req.ip });
    res.status(429).json({
      success: false,
      message: '요청 횟수를 초과했습니다. 15분 후 다시 시도해주세요.',
    });
  },
});

// 2FA 활성화/비활성화 전용 제한 (TOTP brute-force 방지)
// - 두 엔드포인트 모두 6자리 TOTP를 검증하므로 일반 apiLimiter보다 좁은 한도를 둔다.
// - authenticate 이후에 배치해야 req.user가 채워져 사용자별 키가 동작한다(인증 전엔 IP fallback).
// - skipSuccessfulRequests 없음: 성공/실패 모두 카운트(코드 섞기 우회 방지)
export const twoFactorLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5분
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

// 파일 다운로드 제한
export const downloadLimiter = rateLimit({
  windowMs: RATE_LIMIT.DOWNLOAD_WINDOW_MS,
  max: () => getRateLimitSettings().downloadMax,
  keyGenerator: req => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req as any).user?.id;
    return userId ? `download:user:${userId}` : `download:ip:${ipKeyGenerator(req.ip ?? '')}`;
  },
  message: {
    success: false,
    message: '파일 다운로드 한도를 초과했습니다. 1시간 후 다시 시도해주세요.',
  },
  handler: (req, res) => {
    logWarning('다운로드 Rate limit 초과', { ip: req.ip });
    res.status(429).json({
      success: false,
      message: '파일 다운로드 한도를 초과했습니다. 1시간 후 다시 시도해주세요.',
    });
  },
});
