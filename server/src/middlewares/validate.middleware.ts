// zod 스키마 기반 요청 바디·파라미터 검증 미들웨어

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { sendError } from '../utils/response';

/**
 * 요청 바디를 zod 스키마로 검증하는 미들웨어 팩토리
 *
 * @example
 * router.post('/login', validateBody(loginSchema), login);
 */
export const validateBody =
  <T>(schema: ZodSchema<T>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = formatZodError(result.error);
      sendError(res, 400, message);
      return;
    }
    req.body = result.data;
    next();
  };

// UUID v1~v5 형식 (Sequelize UUIDV4 PK 검증용)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * UUID 형식의 라우트 파라미터를 검증하는 미들웨어 팩토리.
 * 형식이 어긋난 값이 findByPk 로 가면 Postgres 는 cast 오류로 500 을 낸다.
 *
 * @example
 * router.delete('/sessions/:sessionId', validateUuidParam('sessionId'), terminateOwnSession);
 */
export const validateUuidParam =
  (paramName: string) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const raw = req.params[paramName];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value || !UUID_REGEX.test(value)) {
      sendError(res, 400, '잘못된 식별자 형식입니다.');
      return;
    }
    next();
  };

/** ZodError 를 사람이 읽기 쉬운 메시지로 변환 */
function formatZodError(error: ZodError): string {
  const issues = error.issues.map(issue => {
    const field = issue.path.join('.');
    return field ? `${field}: ${issue.message}` : issue.message;
  });
  return issues.join(', ');
}
