import { loginSchema } from '../validators/schemas';

// 스키마(z.object)는 모르는 키를 조용히 버리고, 검증 미들웨어는 req.body 를 그 결과로
// 바꾼다. 로그인 스키마에 fingerprint 가 없어서 컨트롤러는 늘 undefined 를 받았고,
// 로그인 기록에 기기가 한 번도 남지 않았다. (출근 시각 보정이 저장되지 않던 것과 같은 결함)

describe('로그인 입력 검증', () => {
  it('기기 식별값을 버리지 않는다', () => {
    const parsed = loginSchema.parse({ id: 'user1', password: 'pw', fingerprint: 'abc123' });
    expect(parsed.fingerprint).toBe('abc123');
  });

  it('기기 식별값이 없어도 로그인할 수 있다', () => {
    expect(() => loginSchema.parse({ id: 'user1', password: 'pw' })).not.toThrow();
  });

  it('지나치게 긴 식별값은 거절한다', () => {
    expect(() =>
      loginSchema.parse({ id: 'user1', password: 'pw', fingerprint: 'x'.repeat(201) })
    ).toThrow();
  });
});
