import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import User from '../models/User';
import { UserPoint } from '../models/UserPoint';

// 가입 거절은 '승인 대기 중인 신청' 만 지운다.
//
// 예전에는 isActive 만 봐서, 비활성화해 둔 기존 계정(isApproved=true, isActive=false)도
// 대기 중으로 보여 거절 한 번에 영구 삭제됐다. 딸린 포인트·원장·대결이 함께 사라지고,
// 그 사람에게 걸려 있던 대결의 상대는 건 포인트를 돌려받지 못한다.

let adminCookie: string;

async function makeUser(id: string, over: { isActive: boolean; isApproved: boolean }) {
  await User.destroy({ where: { id }, force: true });
  await User.create({
    id,
    password: 'Test1234!',
    name: `${id}이름`,
    email: `${id}@test.com`,
    roleId: 'user',
    ...over,
  });
}

const reject = (id: string) =>
  request(app).delete(`/api/admin/users/${id}/reject`).set(CSRF_HEADER).set('Cookie', adminCookie);

beforeAll(async () => {
  await seedTestData();
  adminCookie = await loginAs('admin', 'TestAdmin123!');
});

describe('가입 거절', () => {
  it('비활성화해 둔 기존 계정은 거절로 지울 수 없다', async () => {
    await makeUser('rejectold', { isActive: false, isApproved: true });
    await UserPoint.create({ UserId: 'rejectold', balance: 1200 });

    expect((await reject('rejectold')).status).toBe(400);
    expect(await User.findByPk('rejectold', { paranoid: false })).not.toBeNull();
    expect((await UserPoint.findByPk('rejectold'))?.balance).toBe(1200);
  });

  it('승인 대기 중인 신청은 거절하면 지워진다 — 대조', async () => {
    await makeUser('rejectnew', { isActive: false, isApproved: false });

    expect((await reject('rejectnew')).status).toBe(200);
    expect(await User.findByPk('rejectnew', { paranoid: false })).toBeNull();
  });

  it('활성 계정도 거절할 수 없다', async () => {
    await makeUser('rejectlive', { isActive: true, isApproved: true });
    expect((await reject('rejectlive')).status).toBe(400);
  });
});
