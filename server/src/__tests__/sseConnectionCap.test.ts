import type { Response } from 'express';
import {
  addConnection,
  closeAllConnections,
  closeUserConnections,
  getConnectionStats,
  pushToUser,
} from '../services/sse.service';

// 한 사람이 열 수 있는 연결 수 상한에 닿았을 때.
//
// 그냥 끊으면 밀려난 탭의 EventSource 가 몇 초 뒤 스스로 다시 이으면서 그다음으로 오래된
// 연결을 밀어낸다 — 탭이 아홉 개 넘게 열려 있으면 끝없이 돌아가며 서로를 끊었고, 그때마다
// 안 읽은 수 질의도 함께 돌았다. 끊기 전에 'bye' 를 보내 그 탭이 스스로 물러나게 한다.

function fake() {
  const frames: string[] = [];
  let ended = false;
  const handlers: Record<string, () => void> = {};
  const res = {
    write: (chunk: string) => {
      if (ended) throw new Error('already ended');
      frames.push(chunk);
      return true;
    },
    end: () => {
      ended = true;
      // 실제 응답처럼 close 를 알려 준다 — 알리지 않으면 25초 하트비트 타이머가 그대로 남는다
      handlers.close?.();
    },
    on: (event: string, cb: () => void) => {
      handlers[event] = cb;
    },
  } as unknown as Response;
  return {
    res,
    frames,
    gotBye: () => frames.join('').includes('event: bye'),
    isEnded: () => ended,
  };
}

afterEach(() => closeAllConnections());

describe('연결 수 상한', () => {
  it('상한을 넘기면 가장 오래된 연결에 bye 를 보내고 닫는다', () => {
    const conns = Array.from({ length: 8 }, () => fake());
    for (const c of conns) addConnection('admin', c.res);
    expect(conns.some(c => c.gotBye())).toBe(false);

    const newcomer = fake();
    addConnection('admin', newcomer.res);

    expect(conns[0].gotBye()).toBe(true);
    expect(conns[0].isEnded()).toBe(true);
    // 나머지는 그대로다 — 하나만 밀려난다
    expect(conns.slice(1).some(c => c.gotBye())).toBe(false);
    expect(newcomer.gotBye()).toBe(false);
    expect(getConnectionStats().connections).toBe(8);
  });

  it('상한 아래에서는 아무도 밀려나지 않는다 — 대조', () => {
    const conns = Array.from({ length: 3 }, () => fake());
    for (const c of conns) addConnection('admin', c.res);

    expect(conns.some(c => c.gotBye() || c.isEnded())).toBe(false);
    expect(getConnectionStats().connections).toBe(3);
  });

  it('다른 사람의 연결은 자리를 다투지 않는다', () => {
    const mine = Array.from({ length: 8 }, () => fake());
    for (const c of mine) addConnection('admin', c.res);
    const other = fake();

    addConnection('testuser', other.res);

    expect(mine.some(c => c.gotBye())).toBe(false);
    expect(other.isEnded()).toBe(false);
  });
});

describe('세션이 끝나면 스트림도 끊는다', () => {
  // 스트림은 붙을 때 한 번만 인증을 본다. 끊지 않으면 로그아웃·강제 종료 뒤에도 그 탭으로
  // 알림이 계속 갔다(쪽지 내용·대결·퇴근 공격까지). 토큰이 만료돼도 며칠이고 살아남는다.
  it("'bye' 를 보내고 닫는다 — 받는 쪽은 스스로 물러난다", () => {
    const a = fake();
    const b = fake();
    addConnection('admin', a.res);
    addConnection('admin', b.res);

    const closed = closeUserConnections('admin');

    expect(closed).toBe(2);
    expect(a.gotBye()).toBe(true);
    expect(b.gotBye()).toBe(true);
    expect(a.isEnded() && b.isEnded()).toBe(true);
    expect(getConnectionStats().connections).toBe(0);
  });

  it('끊은 뒤에는 알림이 그 사람에게 가지 않는다', () => {
    const a = fake();
    addConnection('admin', a.res);
    closeUserConnections('admin');
    const before = a.frames.length;

    pushToUser('admin', 'notification', { id: 1, message: '지나간 알림' });

    expect(a.frames.length).toBe(before);
  });

  it('다른 사람의 스트림은 건드리지 않는다', () => {
    const mine = fake();
    const other = fake();
    addConnection('admin', mine.res);
    addConnection('testuser', other.res);

    closeUserConnections('admin');

    expect(other.isEnded()).toBe(false);
    expect(getConnectionStats().connections).toBe(1);
  });

  it('연결이 없으면 아무 일도 하지 않는다', () => {
    expect(closeUserConnections('nobody')).toBe(0);
  });
});
