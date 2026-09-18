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
 * 비밀번호 재설정 요청 (아이디 단위).
 *
 * 위아래 둘과 달리 '비밀을 맞혀 보는' 요청이 아니다. 그런데도 막아야 하는 이유는
 * 로그인하지 않은 사람의 요청 한 번이 남에게 피해를 주기 때문이다:
 *
 *  · 요청할 때마다 그 계정의 대기 중인 인증번호가 새로 발급된다. 아이디만 알면
 *    남의 재설정을 계속 무효로 만들 수 있다 — 관리자가 막 불러 준 번호가 그때마다
 *    바뀌어, 정작 본인은 영영 비밀번호를 바꾸지 못한다.
 *  · 요청마다 관리자 수만큼 알림이 쌓인다. 상한이 없다.
 *
 * 그래서 아이디 단위로 센다. IP 로 세면 IP 를 바꿔 가며 한 사람을 계속 괴롭힐 수 있다.
 * (남은 구멍: 아이디를 여럿 알면 각각 5번씩은 보낼 수 있다. 특정인을 겨냥한 괴롭힘은
 *  막히지만, 알림 총량까지 막지는 못한다.)
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
 *
 * 계정 잠금(5회 실패 → 30분, models/User)은 이미 있다. 그런데 그것은 '한 계정을 계속
 * 두드리는' 것만 막는다. 흔한 비밀번호 하나를 아이디 수천 개에 한 번씩 시도하면(password
 * spraying) 어느 계정의 카운터도 올라가지 않아 그대로 통과한다. 아이디가 있는지 훑어보는
 * 것도 마찬가지로 무제한이었다.
 *
 * 그래서 계정이 아니라 '어디서 오는가' 로 센다. 둘은 서로를 대신하지 못하고 함께 있어야
 * 한다 — 계정 잠금은 한 계정을 지키고, 이것은 한 출처가 여러 계정을 훑는 것을 막는다.
 *
 * 성공한 로그인은 세지 않는다(skipSuccessfulRequests). 사무실처럼 여러 사람이 같은 IP 를
 * 쓰는 곳에서 아침마다 서로의 몫을 깎아먹게 두면, 막는 것은 공격이 아니라 출근이다.
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

/**
 * 가입 요청 (IP 단위).
 *
 * 가입은 관리자 승인 대기 상태로 들어가므로 바로 들어올 수는 없다. 다만 상한이 없으면
 * 승인 대기 목록을 쓰레기로 채워 관리자가 진짜 신청을 찾지 못하게 만들 수 있다.
 */
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
