import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER, relaxRateLimits } from './helpers';
import { sequelize } from '../config/sequelize';
import User from '../models/User';
import { Notification } from '../models/Notification';
import { Subscription } from '../models/Subscription';

// 구독 알림이 구독자 수에 비례해 질의를 늘리지 않는지 고정한다.
//
// 구독자마다 역할 권한·담당자·알림 설정을 각각 조회하면 구독자 20명에 91번,
// 200명에 800번 가까이 왕복한다. 글 하나를 저장하는 비용이 구독자 수에 비례한다.
//
// 지금은 권한·설정을 한 번씩 모아 읽고 알림도 한 번에 넣는다.
// 이 테스트는 속도가 아니라 질의 수가 사람 수에 비례하지 않는 것을 지킨다.

let adminCookie: string;

/** 이 블록이 실행하는 동안의 SQL 개수를 센다 */
async function countQueries(run: () => Promise<void>): Promise<number> {
  const options = sequelize.options as { logging?: unknown };
  const original = options.logging;
  let count = 0;
  options.logging = () => {
    count++;
  };
  try {
    await run();
  } finally {
    options.logging = original;
  }
  return count;
}

async function addSubscribers(prefix: string, howMany: number) {
  for (let i = 0; i < howMany; i++) {
    const id = `${prefix}${i}`;
    await User.findOrCreate({
      where: { id },
      defaults: {
        id,
        password: 'TestFan123!',
        name: `구독자${prefix}${i}`,
        email: `${id}@test.com`,
        roleId: 'user',
        isActive: true,
      },
    });
    await Subscription.findOrCreate({
      where: { userId: id, targetType: 'board', targetId: 'notice' },
      defaults: { userId: id, targetType: 'board', targetId: 'notice' },
    });
  }
}

/** 글을 쓰고, fire-and-forget 알림이 끝날 때까지 기다린다 */
async function createPostAndSettle(title: string) {
  const res = await request(app)
    .post('/api/posts/notice')
    .set(CSRF_HEADER)
    .set('Cookie', adminCookie)
    .send({ title, content: `<p>${title}</p>` });
  expect(res.status).toBe(201);
  await new Promise(r => setTimeout(r, 1200));
}

beforeAll(async () => {
  await seedTestData();
  // 테스트가 순서 때문에 429 로 깨지지 않게 한도를 올린다
  await relaxRateLimits();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
});

describe('구독 알림 발송 비용', () => {
  it('구독자가 3배로 늘어도 질의 수는 거의 그대로다', async () => {
    await addSubscribers('fanA', 10);
    const small = await countQueries(() => createPostAndSettle(`소규모 ${Date.now()}`));

    await addSubscribers('fanB', 20);
    const large = await countQueries(() => createPostAndSettle(`대규모 ${Date.now()}`));

    // 사람 수에 비례하면 10명→30명에서 질의가 두 배 넘게 뛴다.
    // 모아 읽는 지금은 알림 INSERT 가 한 번뿐이라 사실상 늘지 않는다.
    expect(large).toBeLessThan(small * 1.5);
  });

  it('구독자 30명에게 알림이 실제로 모두 간다', async () => {
    // 질의를 줄이려고 대상을 빠뜨리면 안 된다
    await Notification.destroy({ where: { type: 'SUBSCRIPTION' } });
    await createPostAndSettle(`전원발송 ${Date.now()}`);

    const sent = await Notification.count({ where: { type: 'SUBSCRIPTION' } });
    expect(sent).toBe(30);
  });

  it('알림을 끈 사람은 빼고 나머지에게 간다', async () => {
    await request(app)
      .put('/api/social/notification-settings')
      .set(CSRF_HEADER)
      .set('Cookie', await loginAs('fanA0', 'TestFan123!'))
      .send({ SUBSCRIPTION: false });

    await Notification.destroy({ where: { type: 'SUBSCRIPTION' } });
    await createPostAndSettle(`일부제외 ${Date.now()}`);

    expect(await Notification.count({ where: { type: 'SUBSCRIPTION' } })).toBe(29);
    expect(await Notification.count({ where: { type: 'SUBSCRIPTION', userId: 'fanA0' } })).toBe(0);
  });
});
