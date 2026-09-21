// server/src/__tests__/statsBucketTimezone.test.ts
// 관리자 그래프의 칸을 어느 달력으로 나누는가.
//
// SQLite 는 시각을 UTC 로 저장한다. 앞에서 열 글자를 그냥 잘라 쓰면 한국 시간 09시
// 이전에 일어난 일이 모두 전날 칸에 들어갔다 — 1일 아침이면 지난달 막대에 들어간다.
// 프로세스 타임존을 맞춰 두어도 그대로였다(잘라 쓰는 값 자체가 UTC 라서).

import request from 'supertest';
import { app, seedTestData, loginAs } from './helpers';
import { LoginHistory } from '../models/LoginHistory';
import { User } from '../models/User';

let adminCookie: string;

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
});

/** 오늘 아침(그 지역 시각으로) 한 시간짜리 기록을 만든다 */
async function loginAtLocalMorning(): Promise<string> {
  const admin = await User.findOne({ where: { id: 'admin' } });
  const now = new Date();
  // 그 지역 달력으로 '오늘' 새벽 1시 — UTC 로 옮기면 어제가 되는 지역이 있다
  const localEarly = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 1, 0, 0);
  await LoginHistory.create(
    {
      userId: admin!.id,
      userName: 'admin',
      status: 'success',
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      createdAt: localEarly,
    } as never,
    { silent: true }
  );
  // Sequelize 는 createdAt 을 제 값으로 덮어쓴다 — 넣고 나서 직접 고쳐 둔다
  const row = await LoginHistory.findOne({ order: [['createdAt', 'DESC']] });
  await LoginHistory.update(
    { createdAt: localEarly } as never,
    { where: { id: row!.id }, silent: true, fields: ['createdAt'] }
  );
  const check = await LoginHistory.findByPk(row!.id);
  // 이 값이 새벽이 아니면 아래 검사는 아무것도 가려내지 못한다
  expect(new Date(check!.createdAt).getHours()).toBe(1);

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${localEarly.getFullYear()}-${pad(localEarly.getMonth() + 1)}-${pad(localEarly.getDate())}`;
}

describe('그래프의 날짜 칸', () => {
  it('새벽에 일어난 일도 그날 칸에 들어간다', async () => {
    const expectedDay = await loginAtLocalMorning();

    const res = await request(app).get('/api/admin/stats').set('Cookie', adminCookie);
    expect(res.status).toBe(200);

    const byDay = res.body.data.loginsByDay as { key: string; count: number }[];
    const keys = byDay.map(b => b.key);
    // UTC 로 자르던 때는 한국에서 이 값이 전날로 들어갔다
    expect(keys).toContain(expectedDay);
  });
});
