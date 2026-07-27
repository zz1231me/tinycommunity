// server/src/utils/response.ts - 표준화된 응답 유틸리티
import { Response } from 'express';

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
