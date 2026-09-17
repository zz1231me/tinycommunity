import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import User from '../models/User';
import { UserPoint } from '../models/UserPoint';
import { PointLedger } from '../models/PointLedger';
import { PointDuel } from '../models/PointDuel';
import { AttendanceAttack } from '../models/AttendanceAttack';
import { AttendanceRecord } from '../models/AttendanceRecord';
import { SiteSettings } from '../models/SiteSettings';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';
import { refreshSettingsCache } from '../utils/settingsCache';
import { today } from '../services/point.service';
import { DUEL_DEFAULTS } from '../config/duel';
import { ATTACK_DEFAULTS } from '../config/attendanceAttack';

// 대결·퇴근 공격의 값과 한도가 '관리자 설정' 에서 온다는 것을 고정한다.
//
// 이 스위트가 없으면 설정을 읽어 놓고 쓰지 않아도 아무도 모른다. 나머지 테스트는
// 전부 기본값으로 돌기 때문에, 설정을 무시하는 구현에서도 똑같이 통과한다.
// 그래서 여기서는 일부러 기본값과 다른 숫자를 넣고 그 숫자대로 움직이는지 본다.

let aCookie: string;
let bCookie: string;
const A = 'rulesalpha';
const B = 'rulesbravo';

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

async function setFlags() {
  for (const key of [
    'tools.lottery',
    'tools.pointDuel',
    'tools.attendance',
    'tools.attendanceAttack',
  ]) {
    await FeatureFlag.destroy({ where: { key } });
    await FeatureFlag.create({ key, enabled: true });
  }
  featureFlagService.invalidate();
}

/** 설정을 바꾸고 캐시를 다시 읽는다 — 관리자 화면이 저장할 때 하는 일과 같다 */
async function setRules(patch: Record<string, number>) {
  await SiteSettings.update(patch, { where: {} });
  await refreshSettingsCache();
}

/** 다른 스위트가 기본값을 전제로 돌므로 끝나면 반드시 되돌린다 */
async function restoreDefaults() {
  await setRules({
    duelMinStake: DUEL_DEFAULTS.minStake,
    duelMaxStake: DUEL_DEFAULTS.maxStake,
    duelExpireMinutes: DUEL_DEFAULTS.expireMinutes,
    duelMaxOpenPerUser: DUEL_DEFAULTS.maxOpenPerUser,
    attackCost: ATTACK_DEFAULTS.cost,
    attackHideCost: ATTACK_DEFAULTS.hideCost,
    attackHideSeconds: ATTACK_DEFAULTS.hideSeconds,
    attackDefendCost: ATTACK_DEFAULTS.defendCost,
    attackBlockSeconds: ATTACK_DEFAULTS.blockSeconds,
    attackDailyLimit: ATTACK_DEFAULTS.dailyLimitPerAttacker,
  });
}

async function grant(userId: string, amount: number) {
  await UserPoint.destroy({ where: { UserId: userId } });
  await UserPoint.create({ UserId: userId, balance: amount });
  await PointLedger.create({
    UserId: userId,
    amount,
    reason: 'admin',
    balanceAfter: amount,
    memo: '테스트 지급',
  });
}

async function balanceOf(userId: string): Promise<number> {
  return (await UserPoint.findByPk(userId))?.balance ?? 0;
}

async function startWorking(userId: string) {
  const checkInAt = new Date(Date.now() - 60 * 60_000);
  checkInAt.setSeconds(0, 0);
  await AttendanceRecord.create({ UserId: userId, workDate: today(), checkInAt });
}

const duel = (body: Record<string, unknown>) =>
  request(app).post('/api/points/duels').set(CSRF_HEADER).set('Cookie', aCookie).send(body);

const duelBoard = () => request(app).get('/api/points/duels').set('Cookie', aCookie);

const attack = (body: Record<string, unknown>) =>
  request(app).post('/api/attendance/attack').set(CSRF_HEADER).set('Cookie', aCookie).send(body);

const defend = (id: number) =>
  request(app).post(`/api/attendance/attack/${id}/defend`).set(CSRF_HEADER).set('Cookie', bCookie);

beforeAll(async () => {
  await seedTestData();
  aCookie = await makeUser(A);
  bCookie = await makeUser(B);
});

beforeEach(async () => {
  await PointDuel.destroy({ where: {}, truncate: true });
  await AttendanceAttack.destroy({ where: {}, truncate: true });
  await AttendanceRecord.destroy({ where: {}, truncate: true });
  await PointLedger.destroy({ where: {}, truncate: true });
  await UserPoint.destroy({ where: {}, truncate: true });
  await setFlags();
  await restoreDefaults();
});

afterAll(restoreDefaults);

describe('대결 규칙은 관리자 설정에서 온다', () => {
  it('판돈 범위를 바꾸면 그 범위로 막힌다', async () => {
    await setRules({ duelMinStake: 100, duelMaxStake: 200 });
    await grant(A, 10_000);

    // 기본값(10~10,000)이었다면 통과했을 금액이다
    expect((await duel({ opponentId: B, stake: 50, hand: 'rock' })).status).toBe(400);
    expect((await duel({ opponentId: B, stake: 500, hand: 'rock' })).status).toBe(400);
    expect((await duel({ opponentId: B, stake: 150, hand: 'rock' })).status).toBe(200);
    expect(await balanceOf(A)).toBe(10_000 - 150);
  });

  it('화면에 내려가는 규칙도 바뀐 값이다', async () => {
    await setRules({ duelMinStake: 77, duelMaxStake: 888, duelExpireMinutes: 3 });
    await grant(A, 1000);

    const res = await duelBoard();
    expect(res.body.data.rules.minStake).toBe(77);
    expect(res.body.data.rules.maxStake).toBe(888);
    expect(res.body.data.rules.expireMinutes).toBe(3);
  });

  it('동시에 걸어 둘 수 있는 판 수를 바꾸면 그대로 막힌다', async () => {
    await setRules({ duelMaxOpenPerUser: 1 });
    await grant(A, 10_000);

    expect((await duel({ opponentId: B, stake: 100, hand: 'rock' })).status).toBe(200);
    // 상대가 달라도 '내가 걸어 둔 판 수' 로 센다
    const second = await duel({ opponentId: 'testuser', stake: 100, hand: 'rock' });
    expect(second.status).toBe(429);
  });
});

describe('퇴근 공격 값도 관리자 설정에서 온다', () => {
  it('방해 값을 바꾸면 그만큼 빠진다', async () => {
    await setRules({ attackCost: 777 });
    await grant(A, 5000);
    await startWorking(B);

    expect((await attack({ targetId: B, kind: 'chaos' })).status).toBe(200);
    expect(await balanceOf(A)).toBe(5000 - 777);
  });

  it('숨기기 값을 바꾸면 그만큼 빠진다', async () => {
    await setRules({ attackHideCost: 55 });
    await grant(A, 5000);
    await startWorking(B);

    expect((await attack({ targetId: B, kind: 'hide' })).status).toBe(200);
    expect(await balanceOf(A)).toBe(5000 - 55);
  });

  it('방어권 값을 바꾸면 그만큼 빠진다', async () => {
    await setRules({ attackCost: 100, attackDefendCost: 33 });
    await grant(A, 5000);
    await grant(B, 5000);
    await startWorking(B);

    const made = await attack({ targetId: B, kind: 'chaos' });
    expect((await defend(made.body.data.id)).status).toBe(200);
    expect(await balanceOf(B)).toBe(5000 - 33);
  });

  it('하루 횟수를 바꾸면 그 횟수에서 막힌다', async () => {
    await setRules({ attackDailyLimit: 1, attackCost: 10, attackHideCost: 10 });
    await grant(A, 5000);
    await startWorking(B);

    expect((await attack({ targetId: B, kind: 'hide' })).status).toBe(200);
    // 같은 사람에게 두 번이라 겹침(409)에도 걸리지만, 트랜잭션 안에서 하루 횟수를
    // 먼저 보므로 429 가 나온다. 순서가 뒤집히면 '횟수 초과' 가 '이미 방해 중' 으로
    // 둔갑해, 내일 다시 하라는 안내 대신 엉뚱한 말을 듣게 된다.
    const second = await attack({ targetId: B, kind: 'hide' });
    expect(second.status).toBe(429);
  });

  it('숨기는 시간을 바꾸면 그 시간만큼 걸린다', async () => {
    // 방해 시간을 일부러 멀리 떨어뜨려 둔다. 두 값이 가까우면 숨기기가 방해 시간을
    // 잘못 따라가도 단언이 통과해, 어느 쪽을 읽는지 가려내지 못하는 검사가 된다.
    await setRules({ attackHideSeconds: 45, attackBlockSeconds: 300 });
    await grant(A, 5000);
    await startWorking(B);

    const made = await attack({ targetId: B, kind: 'hide' });
    const row = await AttendanceAttack.findByPk(made.body.data.id);
    const seconds = Math.round((row!.expiresAt.getTime() - Date.now()) / 1000);
    // 기본값(10초)도, 방해 시간(300초)도 아닌 45초여야 한다
    expect(seconds).toBeGreaterThan(40);
    expect(seconds).toBeLessThan(60);
  });

  it('방해 시간을 바꾸면 그 시간만큼 걸린다', async () => {
    await setRules({ attackBlockSeconds: 300 });
    await grant(A, 5000);
    await startWorking(B);

    const made = await attack({ targetId: B, kind: 'chaos' });
    const row = await AttendanceAttack.findByPk(made.body.data.id);
    const seconds = Math.round((row!.expiresAt.getTime() - Date.now()) / 1000);
    // 기본값(60초)이었다면 한참 못 미쳤을 값이다
    expect(seconds).toBeGreaterThan(250);
    expect(seconds).toBeLessThanOrEqual(300);
  });
});
