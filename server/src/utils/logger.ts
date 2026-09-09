// server/src/utils/logger.ts - 환경별 로깅 유틸리티
import { Request, Response, NextFunction } from 'express';

const isDevelopment = process.env.NODE_ENV === 'development';

interface LogContext {
  userId?: string;
  userName?: string;
  userRole?: string;
  boardId?: string;
  action?: string;
  [key: string]: unknown;
}

export const logInfo = (message: string, context?: LogContext): void => {
  if (isDevelopment) {
    const contextStr = context ? ` | ${JSON.stringify(context)}` : '';
    // eslint-disable-next-line no-console
    console.log(`ℹ️ [INFO] ${message}${contextStr}`);
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const logError = (message: string, error?: any, context?: LogContext): void => {
  const contextStr = context ? ` | ${JSON.stringify(context)}` : '';
  // 의도적으로 프로덕션에서도 출력 — 서버 에러는 항상 기록되어야 함
  console.error(`❌ [ERROR] ${message}${contextStr}`);

  if (isDevelopment && error) {
    console.error('Error details:', error);
  }
};

export const logWarning = (message: string, context?: LogContext): void => {
  if (isDevelopment) {
    const contextStr = context ? ` | ${JSON.stringify(context)}` : '';
    console.warn(`⚠️ [WARNING] ${message}${contextStr}`);
  }
};

export const logSuccess = (message: string, context?: LogContext): void => {
  if (isDevelopment) {
    const contextStr = context ? ` | ${JSON.stringify(context)}` : '';
    // eslint-disable-next-line no-console
    console.log(`✅ [SUCCESS] ${message}${contextStr}`);
  }
};

export const logPermission = (action: string, allowed: boolean, context: LogContext): void => {
  const emoji = allowed ? '✅' : '❌';
  const status = allowed ? 'ALLOWED' : 'DENIED';

  logInfo(`${emoji} [PERMISSION] ${action} ${status}`, context);
};

// logger 객체 export
export const logger = {
  info: logInfo,
  error: logError,
  warning: logWarning,
  warn: logWarning,
  success: logSuccess,
  permission: logPermission,
};

// requestLogger 미들웨어 export
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  if (isDevelopment) {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const statusColor = res.statusCode >= 400 ? '❌' : res.statusCode >= 300 ? '⚠️' : '✅';
      logInfo(`${statusColor} ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    });
  }

  next();
};
