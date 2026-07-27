import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth-request';
import { securityLogService } from '../services/securityLog.service';
import { logError } from '../utils/logger';

/**
 * 보안 로깅 미들웨어
 * 주요 쓰기 작업(POST, PUT, DELETE)에 대한 로그를 생성합니다.
 * GET 요청은 성능 및 DB 용량 관리를 위해 제외합니다 (단, 민감한 조회는 별도 처리 가능)
 */
export const activityLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  // 원본 end 함수 캡처
  const originalEnd = res.end;

  // 응답이 끝날 때 로그 저장
  res.end = function (chunk?: any, encoding?: any, cb?: any) {
    res.end = originalEnd;
    res.end(chunk, encoding, cb);

    // [사용자 요청 사항 반영]
    // 에러(4xx, 5xx) 뿐만 아니라 리다이렉션/캐싱(3xx)도 모두 기록되도록 수정함.
    // 즉, 성공(2xx)인 경우에만 GET/Auth 필터링을 적용하여 로그 양을 조절함.
    const isImportant = res.statusCode >= 300;
    const isGetOrOptions = req.method === 'GET' || req.method === 'OPTIONS';
    const isAuth = req.originalUrl.startsWith('/api/auth');

    if (!isImportant) {
      // 2xx 성공 응답이면서 GET/OPTIONS 요청은 로깅 제외
      if (isGetOrOptions) {
        return;
      }

      // 2xx 성공 응답이면서 Auth 요청은 중복 방지를 위해 제외
      if (isAuth) {
        return;
      }
    }

    const authReq = req as AuthRequest;
    const userId = authReq.user?.id || null;

    let status = 'SUCCESS';
    if (res.statusCode >= 400) status = 'FAILURE';
    else if (res.statusCode >= 300) status = 'WARNING'; // 3xx -> WARNING (Yellow)

    // 민감한 필드 마스킹 및 길이 제한 헬퍼 함수
    const sanitize = (obj: any): any => {
      if (!obj) return obj;
      if (typeof obj !== 'object') return obj;

      const sanitized: any = Array.isArray(obj) ? [] : {};
      const sensitiveKeys = ['password', 'token', 'secret', 'credential', 'auth'];
      // 용량이 클 수 있는 필드 (이미지 데이터 등)
      const largeKeys = ['image', 'photo', 'file', 'buffer', 'data', 'content'];

      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          // 1. 민감한 키 마스킹
          if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
            sanitized[key] = '[REDACTED]';
          }
          // 2. 잠재적 대용량 필드 요약 (Base64 등)
          else if (
            largeKeys.some(l => key.toLowerCase().includes(l)) &&
            typeof obj[key] === 'string' &&
            obj[key].length > 50
          ) {
            sanitized[key] = `[Data: ${obj[key].length} chars]`;
          }
          // 3. 긴 문자열 자르기 (100자 제한 - Base64 보호 역할도 함)
          else if (typeof obj[key] === 'string' && obj[key].length > 100) {
            sanitized[key] = obj[key].substring(0, 100) + '...';
          }
          // 4. 중첩 객체 처리
          else if (typeof obj[key] === 'object' && obj[key] !== null) {
            sanitized[key] = '[Object]';
          } else {
            sanitized[key] = obj[key];
          }
        }
      }
      return sanitized;
    };

    // 파일 업로드 정보 추출 (Multer 사용 시)
    const getFileDetails = (req: any) => {
      if (req.file) {
        return {
          filename: req.file.filename || req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
        };
      }
      if (req.files) {
        if (Array.isArray(req.files)) {
          return req.files.map((f: any) => ({
            filename: f.filename || f.originalname,
            size: f.size,
            mimetype: f.mimetype,
          }));
        } else {
          // Object format (fields)
          const filesInfo: any = {};
          for (const key in req.files) {
            filesInfo[key] = req.files[key].map((f: any) => ({
              filename: f.filename || f.originalname,
              size: f.size,
              mimetype: f.mimetype,
            }));
          }
          return filesInfo;
        }
      }
      return undefined;
    };

    securityLogService
      .createLog({
        userId,
        ipAddress: req.ip || 'unknown',
        action: `${req.method} ${req.originalUrl}`,
        method: req.method,
        route: req.originalUrl,
        userAgent: req.get('user-agent'),
        status,
        details: {
          statusCode: res.statusCode,
          duration: Date.now() - start,
          query: sanitize(req.query),
          body: sanitize(req.body),
          files: getFileDetails(req), // 파일 정보 추가
        },
      })
      .catch((err: unknown) => {
        logError('보안 로그 저장 실패 (activityLogger)', err);
      });
  } as any;

  next();
};
