import type { Response } from 'express';
import { addConnection, closeAllConnections, getConnectionStats } from '../services/sse.service';

// 한 사람이 열 수 있는 연결 수 상한에 닿았을 때.
//
// 그냥 끊으면 밀려난 탭의 EventSource 가 몇 초 뒤 스스로 다시 이으면서 그다음으로 오래된
// 연결을 밀어낸다 — 탭이 아홉 개 넘게 열려 있으면 끝없이 돌아가며 서로를 끊었고, 그때마다
// 안 읽은 수 질의도 함께 돌았다. 끊기 전에 'bye' 를 보내 그 탭이 스스로 물러나게 한다.

function fake() {
  const frames: string[] = [];
  let ended = false;
  const res = {
    write: (chunk: string) => {
      if (ended) throw new Error('already ended');
      frames.push(chunk);
      return true;
    },
    end: () => {
      ended = true;
    },
    on: () => {},
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
