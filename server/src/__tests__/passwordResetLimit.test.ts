import request from 'supertest';
import { app, seedTestData, CSRF_HEADER } from './helpers';

// 비밀번호 재설정 요청의 횟수 제한.
//
// 이 엔드포인트는 로그인하지 않아도 부를 수 있는데, 요청 한 번이 남에게 피해를 준다:
// 부를 때마다 그 계정의 대기 중인 인증번호가 새로 발급되고(= 남의 재설정을 계속 무효로
// 만들 수 있다), 관리자 수만큼 알림이 쌓인다. 맞혀 보는 공격이 아니라서 3회 실패
// 잠금 같은 기존 장치에는 걸리지 않는다.
//
// 세는 단위는 '아이디' 다. IP 로 세면 IP 를 바꿔 가며 한 사람을 계속 괴롭힐 수 있다.

const ask = (loginId: string) =>
  request(app).post('/api/auth/password-reset-request').set(CSRF_HEADER).send({ loginId });

beforeAll(async () => {
  await seedTestData();
});

describe('비밀번호 재설정 요청 횟수 제한', () => {
  it('같은 아이디로 거듭 부르면 결국 막힌다', async () => {
    // 제한은 5회/10분. 여섯 번째가 막혀야 한다.
    const id = `flood-${Date.now()}`;
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await ask(id)).status);

    expect(codes.filter(c => c === 429)).not.toHaveLength(0);
    expect(codes[codes.length - 1]).toBe(429);
  });

  it('막힌 뒤에도 다른 사람은 멀쩡히 요청할 수 있다', async () => {
    // IP 로 셌다면 한 사람이 막히는 순간 같은 망을 쓰는 모두가 함께 막힌다.
    const victim = `victim-${Date.now()}`;
    for (let i = 0; i < 6; i++) await ask(victim);
    expect((await ask(victim)).status).toBe(429);

    const bystander = `bystander-${Date.now()}`;
    expect((await ask(bystander)).status).not.toBe(429);
  });

  it('제한에 걸려도 왜 막혔는지 알려 준다', async () => {
    const id = `msg-${Date.now()}`;
    let last = await ask(id);
    for (let i = 0; i < 6 && last.status !== 429; i++) last = await ask(id);

    expect(last.status).toBe(429);
    expect(last.body.success).toBe(false);
    expect(last.body.message).toMatch(/다시 시도/);
  });
});
