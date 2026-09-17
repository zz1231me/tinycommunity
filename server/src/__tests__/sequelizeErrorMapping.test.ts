// server/src/__tests__/sequelizeErrorMapping.test.ts
// Sequelize 오류가 사용자에게 몇 번으로 나가는지.
//
// 이 오류들에는 status/statusCode 가 없어 예전에는 4xx 판정을 빠져나가 generic 500 +
// critical 에러로그가 됐다. 실제로 회원가입에 긴 이메일을 보내면 모델 검증기(isEmail)에
// 걸려 500 이 나갔다 — 누구나 부를 수 있는 공개 경로라 로그까지 함께 더럽혀졌다.

import { ValidationError, ValidationErrorItem, UniqueConstraintError } from 'sequelize';
import { errorHandler } from '../middlewares/error.middleware';
import type { Response } from 'express';

function mockRes() {
  const captured = { status: 0, body: null as unknown };
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: unknown) {
      captured.body = body;
      return this;
    },
  };
  return { res: res as unknown as Response, captured };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const req = { originalUrl: '/api/x', method: 'POST' } as any;

function handle(err: Error) {
  const { res, captured } = mockRes();
  errorHandler(err, req, res, () => {});
  return captured;
}

// 미들웨어가 읽는 것은 instanceof 와 errors[].path 뿐이다. 생성자의 위치 인자를
// 추측해 채우는 대신 필요한 모양만 만든다. message·type 도 담아 둬야
// '내부 문구를 내보내지 않는다' 단언이 검사할 대상이 실제로 존재한다.
const item = (path: string) =>
  ({
    path,
    message: `Validation isEmail on ${path} failed`,
    type: 'validation error',
  }) as unknown as ValidationErrorItem;

describe('Sequelize 오류 → HTTP 상태', () => {
  it('검증 오류는 400 이다 — 500 이 아니다', () => {
    const c = handle(new ValidationError('agg', [item('email')]));
    expect(c.status).toBe(400);
  });

  it('어느 칸이 문제인지 알려준다', () => {
    const c = handle(new ValidationError('agg', [item('email')]));
    expect(JSON.stringify(c.body)).toContain('email');
  });

  it('내부 검증기 문구는 내보내지 않는다', () => {
    const c = handle(new ValidationError('agg', [item('email')]));
    expect(JSON.stringify(c.body)).not.toContain('isEmail');
    expect(JSON.stringify(c.body)).not.toContain('validation error');
  });

  it('중복은 409 다 — UniqueConstraintError 가 ValidationError 를 상속하므로 먼저 봐야 한다', () => {
    const err = new UniqueConstraintError({ errors: [item('id')] });
    expect(err instanceof ValidationError).toBe(true); // 상속 관계를 근거로 남긴다
    const c = handle(err);
    expect(c.status).toBe(409);
    expect(JSON.stringify(c.body)).toContain('이미 사용 중');
  });

  it('필드 정보가 없어도 500 으로 떨어지지 않는다', () => {
    expect(handle(new ValidationError('agg', [])).status).toBe(400);
    expect(handle(new UniqueConstraintError({ errors: [] })).status).toBe(409);
  });
});
