// 알림 스트림을 진짜 소켓으로 열어 본다.
//
// sse.test.ts·sseConnectionCap.test.ts 는 레지스트리를 직접 불러 확인한다
// (addConnection·closeUserConnections). 그래서 '레지스트리가 맞게 동작하는가' 는
// 덮여 있지만 '로그아웃이 그 레지스트리까지 닿는가' 는 비어 있었다 —
// logout → expireAllUserSessions → closeUserConnections 중 한 군데만 끊겨도
// 기존 테스트는 모두 초록인 채로 끊긴 세션이 알림을 계속 받는다.
//
// 스트림은 붙을 때 한 번만 인증을 본다. 그래서 '끊기는가' 가 곧 보안 성질이다.

import http from 'http';
import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { User } from '../models/User';
import { FeatureFlag } from '../models/FeatureFlag';
import { featureFlagService } from '../services/featureFlag.service';

jest.setTimeout(30000);

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface Stream {
  text: () => string;
  ended: () => boolean;
  close: () => void;
}

/** 실제 소켓으로 SSE 를 연다. supertest 는 끝나지 않는 응답을 다루지 못한다. */
function openStream(cookie: string): Stream {
  const port = (app.address() as { port: number }).port;
  const chunks: string[] = [];
  let ended = false;

  const req = http.request(
    { host: '127.0.0.1', port, path: '/api/notifications/stream', headers: { Cookie: cookie } },
    res => {
      res.setEncoding('utf8');
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => (ended = true));
      res.on('close', () => (ended = true));
    }
  );
  req.end();

  return { text: () => chunks.join(''), ended: () => ended, close: () => req.destroy() };
}

/** 이벤트가 올 때까지 잠깐 기다린다. 고정 대기는 느린 기계에서 흔들린다. */
async function until(check: () => boolean, ms = 5000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (check()) return true;
    await wait(100);
  }
  return false;
}

const USER = 'ssestream';
let userCookie: string;
let adminCookie: string;
const open: Stream[] = [];

beforeAll(async () => {
  await seedTestData();
  await FeatureFlag.destroy({ where: { key: 'social.dm' } });
  await FeatureFlag.create({ key: 'social.dm', enabled: true });
  featureFlagService.invalidate();

  if (!(await User.findByPk(USER))) {
    await User.create({
      id: USER,
      password: 'SseStream123!',
      name: '스트림',
      email: `${USER}@test.local`,
      roleId: 'user',
      isActive: true,
    });
  }
  adminCookie = await loginAs('admin', 'TestAdmin123!');
});

beforeEach(async () => {
  userCookie = await loginAs(USER, 'SseStream123!');
});

afterEach(() => {
  for (const s of open.splice(0)) s.close();
});

describe('알림 스트림', () => {
  it('붙으면 미읽음 수를 먼저 내려 준다', async () => {
    const stream = openStream(userCookie);
    open.push(stream);

    expect(await until(() => /event: unread-count/.test(stream.text()))).toBe(true);
  });

  it('알림은 그 사람의 스트림에만 간다', async () => {
    const mine = openStream(userCookie);
    const other = openStream(adminCookie);
    open.push(mine, other);
    await until(() => mine.text().length > 0 && other.text().length > 0);

    const sent = await request(app)
      .post('/api/messages')
      .set(CSRF_HEADER)
      .set('Cookie', adminCookie)
      .send({ recipientId: USER, content: '스트림 시험' });
    expect(sent.status).toBe(201);

    expect(await until(() => /event: notification/.test(mine.text()))).toBe(true);
    // 보낸 사람 쪽에는 그 알림이 가지 않는다
    expect(/event: notification/.test(other.text())).toBe(false);
  });

  it('로그아웃하면 열려 있던 스트림이 끊긴다', async () => {
    const stream = openStream(userCookie);
    open.push(stream);
    await until(() => stream.text().length > 0);
    expect(stream.ended()).toBe(false);

    await request(app).post('/api/auth/logout').set(CSRF_HEADER).set('Cookie', userCookie);

    expect(await until(() => stream.ended())).toBe(true);
  });

  it('끊긴 쿠키로는 다시 붙지 못한다', async () => {
    await request(app).post('/api/auth/logout').set(CSRF_HEADER).set('Cookie', userCookie);

    const res = await request(app).get('/api/notifications').set('Cookie', userCookie);
    expect(res.status).toBe(401);
  });
});
