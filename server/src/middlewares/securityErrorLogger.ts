import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth-request';
import { errorLogService } from '../services/errorLog.service';

// ============================================================================
// 보안 에러 로깅 미들웨어
// 권한 거부·비정상 요청만 선별해 에러 로그에 요청 패킷과 함께 기록한다.
//  - 403 (Forbidden): 권한 없는데 접근을 시도한 경우
//  - 429 (Too Many Requests): 요청 한도 초과(비정상 트래픽)
// 로그인 실패(계정 보안 이벤트 → 보안 로그)나 401(만료 토큰 등 노이즈)·일반 4xx는 제외한다.
// 응답 status를 검사하므로 throw(AppError)·직접응답(res.status) 양쪽을 모두 포착한다.
// ============================================================================

const SENSITIVE = [
  'password',
  'token',
  'secret',
  'credential',
  'authorization',
  'currentpassword',
  'newpassword',
];

/** 민감 필드 마스킹 + 긴 문자열 절단 (최대 2단계 중첩) */
function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > 200 ? value.slice(0, 200) + '…' : value;
  if (typeof value !== 'object' || depth > 2) return typeof value === 'object' ? '[Object]' : value;

  const out: Record<string, unknown> = Array.isArray(value) ? ([] as any) : {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE.some(s => k.toLowerCase().includes(s))) out[k] = '[REDACTED]';
    else out[k] = sanitize(v, depth + 1);
  }
  return out;
}

const MESSAGES: Record<number, string> = {
  403: '권한 없는 접근 시도',
  429: '요청 한도 초과 (비정상 트래픽)',
};

export const securityErrorLogger = (req: Request, res: Response, next: NextFunction) => {
  const originalEnd = res.end;

  res.end = function (chunk?: any, encoding?: any, cb?: any) {
    res.end = originalEnd;
    res.end(chunk, encoding, cb);

    const status = res.statusCode;
    if (status !== 403 && status !== 429) return;

    // 로그인 자격증명 실패(승인대기·비활성역할·계정잠금 등 403, 로그인 과다시도 429)는
    // 계정 보안 이벤트(보안 로그) 소관 — 에러 로그(권한거부·이상행동)에서는 제외한다.
    const path = req.path;
    if (path.endsWith('/login') || path.endsWith('/verify-login')) return;

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

    const label = MESSAGES[status] ?? `HTTP ${status}`;
    const authReq = req as AuthRequest;
    void errorLogService.createLog({
      userId: authReq.user?.id ?? null,
      userName: authReq.user?.name ?? null,
      userRole: authReq.user?.role ?? null,
      route: req.originalUrl,
      method: req.method,
      errorCode: `HTTP_${status}`,
      errorMessage: reason ? `${label}: ${reason}` : label,
      severity: 'warning',
      requestBody: {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        query: sanitize(req.query),
        body: sanitize(req.body),
      },
    });
  } as any;

  next();
};
