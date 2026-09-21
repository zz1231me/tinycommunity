import { Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';
import { ValidationError, UniqueConstraintError } from 'sequelize';
import { errorLogService } from '../services/errorLog.service';
import { logError } from '../utils/logger';
import { env } from '../config/env';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    name: string;
    role: string;
  };
}

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(statusCode: number, message: string, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // 프로토타입 체인 복구 (TypeScript inheritance 패턴)
    Object.setPrototypeOf(this, AppError.prototype);

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error,
  req: AuthenticatedRequest,
  res: Response,
  _next: NextFunction
): void => {
  const userId = req.user?.id;
  const userName = req.user?.name;
  const userRole = req.user?.role;

  // 개발 환경 여부: NODE_ENV가 명시적으로 'development'인 경우에만 상세 정보 노출
  const isDev = env.NODE_ENV === 'development';

  // MulterError 에는 status 가 없어 두면 500 으로 새므로 4xx 로 명시 매핑한다.
  if (err instanceof MulterError) {
    const messages: Record<string, [number, string]> = {
      LIMIT_FILE_SIZE: [413, '파일 크기가 허용 한도를 초과했습니다.'],
      LIMIT_FILE_COUNT: [400, '허용된 파일 개수를 초과했습니다.'],
      LIMIT_UNEXPECTED_FILE: [400, '허용된 파일 개수를 초과했습니다.'],
      LIMIT_PART_COUNT: [400, '요청에 포함된 항목이 너무 많습니다.'],
      LIMIT_FIELD_KEY: [400, '요청 필드 이름이 너무 깁니다.'],
      LIMIT_FIELD_VALUE: [400, '요청 필드 값이 너무 깁니다.'],
      LIMIT_FIELD_COUNT: [400, '요청 필드가 너무 많습니다.'],
    };
    const [status, message] = messages[err.code] ?? [400, '파일 업로드 요청이 올바르지 않습니다.'];
    res.status(status).json({ success: false, message });
    return;
  }

  if (err instanceof AppError) {
    // Only log 5xx errors to DB (not client errors)
    if (err.statusCode >= 500) {
      void errorLogService.createLog({
        userId,
        userName,
        userRole,
        route: req.originalUrl,
        method: req.method,
        errorCode: `HTTP_${err.statusCode}`,
        errorMessage: err.message,
        errorStack: isDev ? err.stack : undefined,
        severity: 'error',
      });
    }
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      // 스택은 개발 환경 + 5xx 에서만 노출한다.
      ...(isDev && err.statusCode >= 500 && { stack: err.stack }),
    });
    return;
  }

  // Sequelize 검증 오류는 status 가 없어 그대로 두면 500 + critical 로그가 되므로 4xx 로 매핑한다.
  // 순서 주의: UniqueConstraintError 가 ValidationError 를 상속하므로 먼저 판정해야 409 가 400 으로 뭉개지지 않는다.
  // 메시지는 필드 이름까지만 알린다. errors[].message 는 내부 문구다.
  if (err instanceof UniqueConstraintError) {
    const fields = [...new Set(err.errors.map(e => e.path).filter(Boolean))].join(', ');
    res.status(409).json({
      success: false,
      message: fields ? `이미 사용 중인 값입니다: ${fields}` : '이미 사용 중인 값입니다.',
    });
    return;
  }

  if (err instanceof ValidationError) {
    const fields = [...new Set(err.errors.map(e => e.path).filter(Boolean))].join(', ');
    res.status(400).json({
      success: false,
      message: fields ? `입력값이 올바르지 않습니다: ${fields}` : '입력값이 올바르지 않습니다.',
    });
    return;
  }

  // AppError 가 아니어도 4xx status 를 가진 오류(잘못된 JSON 400, 과대 페이로드 413)는 클라이언트 오류로 본다.
  const clientStatus =
    (err as { status?: number; statusCode?: number }).status ??
    (err as { statusCode?: number }).statusCode;
  if (typeof clientStatus === 'number' && clientStatus >= 400 && clientStatus < 500) {
    res.status(clientStatus).json({
      success: false,
      message:
        (err as { type?: string }).type === 'entity.parse.failed'
          ? '요청 본문(JSON) 형식이 올바르지 않습니다.'
          : err.message || '잘못된 요청입니다.',
    });
    return;
  }

  void errorLogService.createLog({
    userId,
    userName,
    userRole,
    route: req.originalUrl,
    method: req.method,
    errorCode: 'INTERNAL_SERVER_ERROR',
    errorMessage: err.message || '알 수 없는 오류',
    errorStack: isDev ? err.stack : undefined,
    severity: 'critical',
  });

  logError('Unexpected error', err);
  res.status(500).json({
    success: false,
    message: '서버 내부 오류가 발생했습니다.',
    ...(isDev && {
      error: err.message,
      stack: err.stack,
    }),
  });
};

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  const error = new AppError(404, `경로를 찾을 수 없습니다: ${req.originalUrl}`);
  next(error);
};
