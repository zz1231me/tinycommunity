// 한 사람이 포인트 요청을 몰아칠 때.
//
// 하루 횟수는 트랜잭션이 지켜 주었지만, 수십 건이 동시에 들어오면 같은 잔액 행을 두고
// 트랜잭션끼리 서로를 기다리다 연결 풀이 바닥났다. 그러면 포인트와 무관한 화면까지 열리지
// 않는다 — 실제로 동시 12건에 사이트 전체가 응답하지 못했다.
//
// 그래서 여기서 보는 것은 '몇 번 성공했나' 가 아니라 '전부 제때 답했나' 다.

import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import User from '../models/User';
import { UserPoint } from '../models/UserPoint';
import { PointAttack } from '../models/PointAttack';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';
import { runSerialPerUser } from '../services/point.service';
import { ATTACK_DEFAULTS } from '../config/attendanceAttack';

const ATK = 'burstatk';
const TGT = 'bursttgt';
let atkCookie: string;

async function makeUser(id: string) {
  if (!(await User.findByPk(id))) {
    await User.create({
      id,
      password: 'Test1234!',
      name: `${id}이름`,
      email: `${id}@test.com`,
      roleId: 'user',
      isActive: true,
    });
  }
  return loginAs(id, 'Test1234!');
}

beforeAll(async () => {
  await seedTestData();
  atkCookie = await makeUser(ATK);
  await makeUser(TGT);
  for (const key of ['tools.lottery', 'tools.pointAttack']) {
    await FeatureFlag.destroy({ where: { key } });
    await FeatureFlag.create({ key, enabled: true });
  }
  featureFlagService.invalidate();
});

beforeEach(async () => {
  await PointAttack.destroy({ where: {} });
  await UserPoint.destroy({ where: { UserId: [ATK, TGT] } });
  await UserPoint.create({ UserId: ATK, balance: 100_000 });
  await UserPoint.create({ UserId: TGT, balance: 10_000 });
});

describe('한 사람이 몰아칠 때', () => {
  it('모두 답하고, 통과한 수는 하루 횟수를 넘지 않는다', async () => {
    const shots = Array.from({ length: 20 }, () =>
      request(app)
        .post('/api/points/attack/halve')
        .set(CSRF_HEADER)
        .set('Cookie', atkCookie)
        .send({ targetId: TGT })
    );

    const results = await Promise.all(shots);

    // 답하지 않고 멎은 것이 없어야 한다 — 200(통과) 이거나 429(제한) 둘 중 하나다.
    for (const res of results) {
      expect([200, 429]).toContain(res.status);
    }
    const ok = results.filter(r => r.status === 200).length;
    expect(ok).toBeLessThanOrEqual(ATTACK_DEFAULTS.dailyLimitPerAttacker);
    expect(await PointAttack.count({ where: { attackerId: ATK } })).toBe(ok);
  }, 30_000);

  it('몰아친 뒤에도 평범한 조회가 바로 된다', async () => {
    await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app)
          .post('/api/points/attack/halve')
          .set(CSRF_HEADER)
          .set('Cookie', atkCookie)
          .send({ targetId: TGT })
      )
    );

    const res = await request(app).get('/api/points/me').set('Cookie', atkCookie);
    expect(res.status).toBe(200);
  }, 30_000);
});

describe('사람별 줄 세우기', () => {
  it('같은 사람 것은 겹치지 않는다', async () => {
    let running = 0;
    let overlapped = false;
    const task = async () => {
      running += 1;
      if (running > 1) overlapped = true;
      await new Promise(r => setTimeout(r, 10));
      running -= 1;
    };

    await Promise.all(Array.from({ length: 5 }, () => runSerialPerUser('someone', task)));
    expect(overlapped).toBe(false);
  });

  it('다른 사람 것은 기다리지 않는다', async () => {
    const order: string[] = [];
    const slow = runSerialPerUser('느린사람', async () => {
      await new Promise(r => setTimeout(r, 80));
      order.push('느린사람');
    });
    const fast = runSerialPerUser('빠른사람', async () => {
      order.push('빠른사람');
    });

    await Promise.all([slow, fast]);
    expect(order).toEqual(['빠른사람', '느린사람']);
  });

  it('앞 요청이 실패해도 다음 요청은 돈다', async () => {
    const failed = runSerialPerUser('아무개', async () => {
      throw new Error('실패');
    });
    await expect(failed).rejects.toThrow('실패');
    await expect(runSerialPerUser('아무개', async () => '다음')).resolves.toBe('다음');
  });
});
