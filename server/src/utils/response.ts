// server/src/utils/response.ts - 표준화된 응답 유틸리티
import { Response } from 'express';
import { logError } from './logger';

interface ErrorDetails {
  code?: string;
  field?: string;
  details?: any;
}

interface SuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}

interface ErrorResponse {
  success: false;
  message: string;
  code?: string;
  details?: ErrorDetails;
}

const isDevelopment = process.env.NODE_ENV === 'development';

export const sendSuccess = <T>(
  res: Response,
  data: T,
  message?: string,
  statusCode = 200
): void => {
  const response: SuccessResponse<T> = {
    success: true,
    data,
    ...(message && { message }),
  };
  res.status(statusCode).json(response);
};

export const sendError = (
  res: Response,
  statusCode: number,
  message: string,
  details?: ErrorDetails
): void => {
  const response: ErrorResponse = {
    success: false,
    message,
    ...(details?.code && { code: details.code }),
    ...(isDevelopment && details && { details }),
  };
  res.status(statusCode).json(response);
};

export const sendValidationError = (res: Response, field: string, message: string): void => {
  sendError(res, 400, message, { code: 'VALIDATION_ERROR', field });
};

export const sendNotFound = (res: Response, resource: string): void => {
  sendError(res, 404, `${resource}을(를) 찾을 수 없습니다.`, { code: 'NOT_FOUND' });
};

export const sendForbidden = (res: Response, message: string): void => {
  sendError(res, 403, message, { code: 'FORBIDDEN' });
};

export const sendUnauthorized = (res: Response, message = '인증이 필요합니다.'): void => {
  sendError(res, 401, message, { code: 'UNAUTHORIZED' });
};

/**
 * 서비스에서 올라온 오류를 응답으로 옮긴다.
 *
 * AppError 는 statusCode 를 들고 오므로 그대로 쓰고, 그 밖의 오류만 500 으로
 * 기록한다. 이 분기를 컨트롤러마다 손으로 쓰면 한 곳만 빠뜨려도 400·404 가
 * 500 으로 뭉개져 "왜 실패했는지" 를 사용자도 로그도 알 수 없게 된다.
 */
export const sendServiceError = (
  res: Response,
  error: unknown,
  fallbackMessage: string,
  context?: Record<string, unknown>
): void => {
  if (error instanceof Error && 'statusCode' in error) {
    sendError(res, (error as { statusCode: number }).statusCode, error.message);
    return;
  }
  logError(fallbackMessage, error, context);
  sendError(res, 500, fallbackMessage);
};
