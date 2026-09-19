import type { Response } from 'express';
import request from 'supertest';
import { app, seedTestData, loginAs, CSRF_HEADER } from './helpers';
import { Notification } from '../models/Notification';
import { notificationService } from '../services/notification.service';
import { addConnection, closeAllConnections } from '../services/sse.service';

// 읽음·삭제한 뒤 '안 읽은 수' 를 열려 있는 다른 화면들에 알리는가.
//
// 알리지 않던 때: 한 탭에서 '모두 읽음' 을 눌러도 다른 탭·다른 기기의 종 숫자는 그대로였다.
// 스트림이 붙어 있는 동안 화면이 스스로 묻는 주기는 5분이라 그만큼 오래 어긋났고, 그 사이
// 새 알림이 오면 틀린 숫자 위에 1 을 더해 틀린 채로 굴러갔다.

/** 프레임을 받아 두는 가짜 연결 */
function fakeConnection() {
  const frames: string[] = [];
  const handlers: Record<string, () => void> = {};
  const res = {
    write: (chunk: string) => {
      frames.push(chunk);
      return true;
    },
    end: () => handlers.close?.(),
    on: (event: string, cb: () => void) => {
      handlers[event] = cb;
    },
  } as unknown as Response;
  /** 마지막으로 알려 준 안 읽은 수 (없으면 null) */
  const lastCount = () => {
    const joined = frames.join('');
    const all = [...joined.matchAll(/event: unread-count\ndata: (\{[^\n]*\})/g)];
    return all.length === 0
      ? null
      : (JSON.parse(all[all.length - 1][1]) as { count: number }).count;
  };
  return { res, lastCount, frames };
}

const make = (message: string, isRead = false) =>
  Notification.create({ userId: 'admin', type: 'SYSTEM', message, isRead });

beforeAll(async () => {
  await seedTestData();
});

beforeEach(async () => {
  await Notification.destroy({ where: {}, truncate: true });
  closeAllConnections();
});

afterAll(() => closeAllConnections());

describe('응답에도 안 읽은 수를 실어 준다', () => {
  // 화면이 스스로 하나 깎으면, 같은 순간 스트림으로 밀어 준 수에 또 깎여 뱃지가 실제보다 적어진다.
  // 그래서 누른 화면은 서버가 센 값을 그대로 쓴다 — 응답에 그 값이 있어야 한다.
  it('읽음 응답에 남은 안 읽은 수가 들어 있다', async () => {
    const a = await make('하나');
    await make('둘');
    const cookie = await loginAs('admin', 'TestAdmin123!');

    const res = await request(app)
      .put(`/api/notifications/${a.id}/read`)
      .set('Cookie', cookie)
      .set(CSRF_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ unreadCount: 1 });
  });

  it('삭제 응답에도 들어 있다', async () => {
    const a = await make('하나');
    await make('둘');
    const cookie = await loginAs('admin', 'TestAdmin123!');

    const res = await request(app)
      .delete(`/api/notifications/${a.id}`)
      .set('Cookie', cookie)
      .set(CSRF_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ unreadCount: 1 });
  });

  it('모두 읽음 응답은 0 이다', async () => {
    await make('하나');
    const cookie = await loginAs('admin', 'TestAdmin123!');

    const res = await request(app)
      .put('/api/notifications/read-all')
      .set('Cookie', cookie)
      .set(CSRF_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ unreadCount: 0 });
  });
});

describe('안 읽은 수를 열린 화면에 알린다', () => {
  it('하나를 읽으면 남은 수를 알린다', async () => {
    const a = await make('하나');
    await make('둘');
    const conn = fakeConnection();
    addConnection('admin', conn.res);

    await notificationService.markAsRead(a.id, 'admin');

    expect(conn.lastCount()).toBe(1);
  });

  it('모두 읽으면 0 을 알린다', async () => {
    await make('하나');
    await make('둘');
    const conn = fakeConnection();
    addConnection('admin', conn.res);

    await notificationService.markAllAsRead('admin');

    expect(conn.lastCount()).toBe(0);
  });

  it('안 읽은 것을 지우면 줄어든 수를 알린다', async () => {
    const a = await make('하나');
    await make('둘');
    const conn = fakeConnection();
    addConnection('admin', conn.res);

    await notificationService.deleteNotification(a.id, 'admin');

    expect(conn.lastCount()).toBe(1);
  });

  it('전체 삭제는 0 을 알린다', async () => {
    await make('하나');
    await make('둘');
    const conn = fakeConnection();
    addConnection('admin', conn.res);

    await notificationService.deleteAllNotifications('admin');

    expect(conn.lastCount()).toBe(0);
  });

  it('이미 읽은 것을 지워도 남은 안 읽은 수는 그대로다 — 대조', async () => {
    const read = await make('읽은 것', true);
    await make('안 읽은 것');
    const conn = fakeConnection();
    addConnection('admin', conn.res);

    await notificationService.deleteNotification(read.id, 'admin');

    expect(conn.lastCount()).toBe(1);
  });

  it('응답에도 서버가 센 수를 실어 준다 — 화면이 스스로 깎지 않게', async () => {
    // 밀어 준 수를 받은 뒤 화면이 또 하나를 깎으면 뱃지가 실제보다 적어진다.
    const a = await make('하나');
    await make('둘');

    const left = await notificationService.markAsRead(a.id, 'admin');

    expect(left).toBe(1);
    expect(await notificationService.markAllAsRead('admin')).toBe(0);
  });

  it('다른 사람의 화면에는 알리지 않는다', async () => {
    const a = await make('하나');
    const mine = fakeConnection();
    const other = fakeConnection();
    addConnection('admin', mine.res);
    addConnection('testuser', other.res);

    await notificationService.markAsRead(a.id, 'admin');

    expect(mine.lastCount()).toBe(0);
    expect(other.lastCount()).toBeNull();
  });
});
