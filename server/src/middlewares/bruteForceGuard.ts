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
