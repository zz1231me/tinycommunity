import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth-request';
import { errorLogService } from '../services/errorLog.service';

// 보안 에러 로깅 미들웨어. 응답 status 로 판단해 거부된 요청을 요청 패킷과 함께 에러 로그에 남긴다.
// 401/403/429는 'warning', 400/404는 'info'. 400·404는 정적 파일·SPA 라우팅이 섞이지 않도록 /api 로 한정한다.

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
 * 이름이 정확히 일치할 때만 가린다. 부분 일치 목록에 'code' 를 넣으면 zipcode·countryCode 까지 덮는다.
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

// (행위자, 상태코드) 단위로 1분에 THROTTLE_MAX 건까지만 적는다. 넘친 건수는 세어 두었다가 다음 기록의 메시지에 싣는다.
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
    // 창이 바뀌어도 억제해 둔 건수는 넘겨받는다. 비우면 넘친 건수가 사라진다.
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
 * 묶음 상태를 비운다(테스트 전용).
 * 모든 스위트가 한 프로세스에서 같은 IP 로 돌아, 비우지 않으면 앞 스위트가 쓴 몫 때문에 뒤가 억제된다.
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

    // 경로 판정은 req.path 가 아니라 req.originalUrl 로 한다. 디스패치 중에는 마운트 경로가 벗겨진다.
    const path = (req.originalUrl || '').split('?')[0];

    // 로그인 자격증명 실패(403·429)는 보안 로그 소관이라 에러 로그에서는 제외한다.
    if (path.endsWith('/login') || path.endsWith('/verify-login')) return;

    // /auth/me·/auth/refresh 의 401 은 첫 로드의 정상 절차라 제외한다. 같은 경로라도 403·429 는 남긴다.
    if (status === 401 && (path.endsWith('/auth/me') || path.endsWith('/auth/refresh'))) return;

    if (rule.apiOnly && !path.startsWith('/api/')) return;

    const authReq = req as AuthRequest;
    // 로그인한 사람은 사람 단위로, 아니면 IP 단위로 묶는다.
    const actor = authReq.user?.id ?? req.ip ?? 'unknown';
    const slot = takeSlot(`${status}:${actor}`, Date.now());
    if (!slot.allowed) return;

    // 응답 본문에서 거부 사유(message)를 뽑는다.
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
