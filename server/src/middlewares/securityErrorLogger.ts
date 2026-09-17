import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth-request';
import { errorLogService } from '../services/errorLog.service';

// 보안 에러 로깅 미들웨어.
// 거부당한 요청과 이상 징후를 요청 패킷과 함께 에러 로그에 남긴다.
// 응답 status 를 검사하므로 throw(AppError)·직접 응답(res.status) 양쪽을 모두 잡는다.
//
//   401 / 403 / 429 → severity 'warning' (거부당한 시도)
//   400 / 404       → severity 'info'    (이상 징후. 평범한 실수도 섞이므로 등급을 낮춘다)
//
// 등급을 나누는 이유: 400·404 까지 'warning' 으로 두면 사용자의 오타 한 번이 위조 토큰
// 시도와 같은 줄에 서서, 화면에서 진짜 신호를 찾을 수 없게 된다. 관리자 화면의 심각도
// 필터로 갈라 볼 수 있도록 등급을 달리한다.
//
// 400·404 를 /api 로 한정하는 이유: 이 미들웨어는 앱 최상위에 붙어 정적 파일 요청과
// SPA 라우팅까지 본다. 없는 이미지 하나, 새로고침 한 번이 전부 기록되면 쓸모가 없다.
//
// 401 을 넣은 이유: 넣기 전에는 토큰 없이·위조 토큰으로 관리자 API 전체를 긁어도
// 아무 데도 기록이 남지 않았다(실측: 무인증 요청 6건 → error/security/audit 모두 0건).
// 정상 흐름과 섞이지 않는다 — 서버가 상태코드로 이미 갈라 두었기 때문이다:
//   액세스 토큰이 만료·부재라도 refresh 토큰이 남아 있으면 → 419 (여기서 기록 안 함)
//   정말 끝난 세션(둘 다 없음·무효화·위조)                → 401

const SENSITIVE = [
  'password',
  'token',
  'secret',
  'credential',
  'authorization',
  'currentpassword',
  'newpassword',
];

/**
 * 이름이 '정확히' 이것일 때만 가린다.
 *
 * 위 목록은 부분 일치라 'code' 를 넣으면 zipcode·qrcode·countryCode 까지 덮는다.
 * 그런데 비밀번호 재설정 확인이 틀리면(400) 그 요청 바디가 그대로 기록에 남고,
 * 거기 담긴 code 는 계정을 넘겨받는 데 쓰는 값이다. 그 한 칸만 정확히 집어 가린다.
 */
const SENSITIVE_EXACT = ['code'];

/** 민감 필드 마스킹 + 긴 문자열 절단 (최대 2단계 중첩) */
function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > 200 ? value.slice(0, 200) + '…' : value;
  if (typeof value !== 'object' || depth > 2) return typeof value === 'object' ? '[Object]' : value;

  const out: Record<string, unknown> = Array.isArray(value) ? ([] as any) : {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const key = k.toLowerCase();
    if (SENSITIVE.some(s => key.includes(s)) || SENSITIVE_EXACT.includes(key))
      out[k] = '[REDACTED]';
    else out[k] = sanitize(v, depth + 1);
  }
  return out;
}

type Rule = { label: string; severity: 'info' | 'warning'; apiOnly: boolean };

const RULES: Record<number, Rule> = {
  400: { label: '잘못된 요청 (값 조작 가능성)', severity: 'info', apiOnly: true },
  401: { label: '인증 없는 접근 시도', severity: 'warning', apiOnly: false },
  403: { label: '권한 없는 접근 시도', severity: 'warning', apiOnly: false },
  404: { label: '없는 자원 조회 (탐색 가능성)', severity: 'info', apiOnly: true },
  429: { label: '요청 한도 초과 (비정상 트래픽)', severity: 'warning', apiOnly: false },
};

// ── 같은 행위자 묶기 ────────────────────────────────────────────────
//
// 훑는 쪽은 한 번에 수백 건을 쏟는다. 그걸 그대로 다 적으면 기록이 기록을 덮어
// 감사 자체가 무력해진다 — 오래된 것부터 30일 보관 기간 밖으로 밀려나기도 한다.
//
// (행위자, 상태코드) 단위로 1분에 THROTTLE_MAX 건까지만 적는다. 넘친 건수는 버리지
// 않고 세어 두었다가 다음에 적는 기록의 메시지에 실어 보낸다 — "몇 건이었는지" 는
// 남아야 훑기와 실수를 구분할 수 있다.
const THROTTLE_WINDOW_MS = 60_000;
const THROTTLE_MAX = 5;
const THROTTLE_MAX_KEYS = 5_000;

type Bucket = { windowStart: number; logged: number; suppressed: number };
const buckets = new Map<string, Bucket>();

/** 지난 창의 찌꺼기를 걷어낸다. 행위자 수만큼 키가 늘어나므로 상한을 넘을 때만 돈다. */
function sweepBuckets(now: number): void {
  if (buckets.size <= THROTTLE_MAX_KEYS) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= THROTTLE_WINDOW_MS) buckets.delete(key);
  }
}

/**
 * 지금 적어도 되는가. 적어도 되면 그동안 억제된 건수를 함께 돌려준다.
 */
function takeSlot(key: string, now: number): { allowed: boolean; suppressed: number } {
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= THROTTLE_WINDOW_MS) {
    // 창이 바뀌어도 억제해 둔 건수는 넘겨받는다.
    // 여기서 0 으로 비우면 앞 창에서 넘친 건수가 통째로 사라져, 묶음이 "양은 잃지
    // 않는다" 는 약속이 깨진다 — 정작 쏟아부은 쪽일수록 흔적이 적게 남게 된다.
    bucket = { windowStart: now, logged: 0, suppressed: bucket?.suppressed ?? 0 };
    buckets.set(key, bucket);
  }

  if (bucket.logged >= THROTTLE_MAX) {
    bucket.suppressed++;
    return { allowed: false, suppressed: 0 };
  }

  bucket.logged++;
  const carried = bucket.suppressed;
  bucket.suppressed = 0;
  sweepBuckets(now);
  return { allowed: true, suppressed: carried };
}

/**
 * 묶음 상태를 비운다 — 테스트 전용.
 * 모든 스위트가 한 프로세스에서 같은 IP 로 돌기 때문에, 비우지 않으면 앞 스위트가
 * 써 버린 몫 때문에 뒤 스위트의 기록이 조용히 억제된다.
 */
export function resetSecurityLogThrottle(): void {
  buckets.clear();
}

export const securityErrorLogger = (req: Request, res: Response, next: NextFunction) => {
  const originalEnd = res.end;

  res.end = function (chunk?: any, encoding?: any, cb?: any) {
    res.end = originalEnd;
    res.end(chunk, encoding, cb);

    const status = res.statusCode;
    const rule = RULES[status];
    if (!rule) return;

    // 경로 판정은 req.path 가 아니라 req.originalUrl 로 한다.
    //
    // 이 훅은 내부 라우터가 디스패치하는 도중에 돌고, 그동안 req.url 에서는 마운트
    // 경로가 벗겨져 있다 — /api/auth/me 를 받아도 req.path 는 '/me' 다.
    // (아래 /login 검사가 여태 맞아떨어진 것은 벗겨진 경로가 마침 '/login' 이어서지,
    //  전체 경로를 보고 있어서가 아니었다.)
    const path = (req.originalUrl || '').split('?')[0];

    // 로그인 자격증명 실패(승인대기·비활성역할·계정잠금 등 403, 로그인 과다시도 429)는
    // 계정 보안 이벤트(보안 로그) 소관 — 에러 로그(권한거부·이상행동)에서는 제외한다.
    if (path.endsWith('/login') || path.endsWith('/verify-login')) return;

    // 앱을 열면 항상 부르는 두 곳은 401 을 정상 절차로 쓴다. 로그인한 적 없는 방문자의
    // 첫 로드가 /auth/me(401) → /auth/refresh(401) 로 두 번 낸다 — 이것까지 남기면
    // 평범한 방문 한 번이 로그 두 줄이 되어 진짜 신호를 덮는다.
    // 401 에만 적용한다. 같은 경로라도 403·429 는 그대로 남긴다.
    if (status === 401 && (path.endsWith('/auth/me') || path.endsWith('/auth/refresh'))) return;

    if (rule.apiOnly && !path.startsWith('/api/')) return;

    const authReq = req as AuthRequest;
    // 로그인한 사람은 사람으로 묶고, 아니면 주소로 묶는다. 한 사람이 여러 주소에서
    // 훑어도 사람 단위로 상한에 걸리게 하려는 것이다.
    const actor = authReq.user?.id ?? req.ip ?? 'unknown';
    const slot = takeSlot(`${status}:${actor}`, Date.now());
    if (!slot.allowed) return;

    // 응답 본문에서 실제 거부 사유(message)를 추출 — "무엇을 왜 거부당했는지"를 남긴다.
    let reason: string | undefined;
    try {
      if (chunk !== null && chunk !== undefined) {
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed.message === 'string') reason = parsed.message.slice(0, 300);
      }
    } catch {
      /* 본문이 JSON이 아니면 사유 없이 진행 */
    }

    const base = reason ? `${rule.label}: ${reason}` : rule.label;
    const carried =
      slot.suppressed > 0 ? ` (직전 1분간 같은 유형 ${slot.suppressed}건이 더 있었다)` : '';

    void errorLogService.createLog({
      userId: authReq.user?.id ?? null,
      userName: authReq.user?.name ?? null,
      userRole: authReq.user?.role ?? null,
      route: req.originalUrl,
      method: req.method,
      errorCode: `HTTP_${status}`,
      errorMessage: base + carried,
      severity: rule.severity,
      requestBody: {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        query: sanitize(req.query),
        body: sanitize(req.body),
        ...(slot.suppressed > 0 && { suppressed: slot.suppressed }),
      },
    });
  } as any;

  next();
};
