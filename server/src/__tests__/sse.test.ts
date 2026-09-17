// server/src/__tests__/sse.test.ts
// SSE 연결 레지스트리 단위 테스트.
// 실제 스트림은 로그인 세션이 필요해 통합 테스트가 무겁지만, 레지스트리의
// 등록·전달·정리·상한은 순수 로직이라 여기서 고정한다.

import { EventEmitter } from 'events';
import type { Response } from 'express';
import {
  addConnection,
  closeAllConnections,
  getConnectionStats,
  pushToUser,
} from '../services/sse.service';

// Express Response 중 SSE 가 실제로 쓰는 부분(write/end/on)만 흉내 낸다.
class FakeResponse extends EventEmitter {
  written: string[] = [];
  ended = false;

  write(chunk: string): boolean {
    if (this.ended) throw new Error('write after end');
    this.written.push(chunk);
    return true;
  }

  end(): void {
    this.ended = true;
    this.emit('close');
  }

  /** 이 응답이 받은 SSE 이벤트를 {event, data} 목록으로 파싱 */
  events(): Array<{ event: string; data: unknown }> {
    const out: Array<{ event: string; data: unknown }> = [];
    for (let i = 0; i < this.written.length; i++) {
      const line = this.written[i];
      if (!line.startsWith('event: ')) continue;
      const event = line.slice('event: '.length).trim();
      const dataLine = this.written[i + 1] ?? '';
      const json = dataLine.slice('data: '.length).trim();
      out.push({ event, data: JSON.parse(json) });
    }
    return out;
  }
}

const asResponse = (r: FakeResponse) => r as unknown as Response;

beforeEach(() => {
  closeAllConnections();
});

afterAll(() => {
  closeAllConnections();
});

describe('SSE 연결 레지스트리', () => {
  it('심장박동이 끊긴 연결에 부딪혀도 프로세스를 세우지 않는다', () => {
    // 심장박동은 타이머 콜백이라 예외를 받아 줄 요청 처리 흐름이 없다.
    // 감싸지 않으면 연결 하나가 죽을 때 프로세스가 함께 내려간다.
    jest.useFakeTimers();
    try {
      const res = new FakeResponse();
      addConnection('zoe', asResponse(res));
      // close 이벤트가 아직 오지 않은 채 소켓만 죽은 상태 — write 가 예외를 던진다.
      res.ended = true;
      expect(() => jest.advanceTimersByTime(30_000)).not.toThrow();
    } finally {
      jest.useRealTimers();
    }
  });

  it('등록한 사용자에게 이벤트를 전달한다', () => {
    const res = new FakeResponse();
    addConnection('alice', asResponse(res));

    pushToUser('alice', 'notification', { id: 1, message: '안녕' });

    expect(res.events()).toEqual([{ event: 'notification', data: { id: 1, message: '안녕' } }]);
  });

  it('다른 사용자에게는 전달하지 않는다', () => {
    const alice = new FakeResponse();
    const bob = new FakeResponse();
    addConnection('alice', asResponse(alice));
    addConnection('bob', asResponse(bob));

    pushToUser('alice', 'notification', { id: 1 });

    expect(alice.events()).toHaveLength(1);
    expect(bob.events()).toHaveLength(0);
  });

  it('같은 사용자의 여러 탭 모두에 전달한다', () => {
    const tab1 = new FakeResponse();
    const tab2 = new FakeResponse();
    addConnection('alice', asResponse(tab1));
    addConnection('alice', asResponse(tab2));

    pushToUser('alice', 'notification', { id: 7 });

    expect(tab1.events()).toHaveLength(1);
    expect(tab2.events()).toHaveLength(1);
  });

  it('연결이 없는 사용자에게 push 해도 예외가 나지 않는다', () => {
    expect(() => pushToUser('nobody', 'notification', { id: 1 })).not.toThrow();
  });

  it('연결이 닫히면 레지스트리에서 제거한다', () => {
    const res = new FakeResponse();
    addConnection('alice', asResponse(res));
    expect(getConnectionStats()).toEqual({ users: 1, connections: 1 });

    res.emit('close');

    expect(getConnectionStats()).toEqual({ users: 0, connections: 0 });
  });

  it('닫힌 연결에 쓰다 예외가 나도 다른 연결 전달을 막지 않는다', () => {
    const broken = new FakeResponse();
    const healthy = new FakeResponse();
    addConnection('alice', asResponse(broken));
    addConnection('alice', asResponse(healthy));
    // close 이벤트 없이 소켓만 죽은 상황을 흉내 낸다(정리가 아직 안 된 상태)
    broken.ended = true;

    expect(() => pushToUser('alice', 'notification', { id: 1 })).not.toThrow();
    expect(healthy.events()).toHaveLength(1);
  });

  it('사용자당 연결 수 상한을 넘으면 가장 오래된 연결을 닫는다', () => {
    const responses = Array.from({ length: 9 }, () => new FakeResponse());
    responses.forEach(r => addConnection('alice', asResponse(r)));

    // 상한은 8 — 9번째를 열면 첫 번째가 닫힌다
    expect(responses[0].ended).toBe(true);
    expect(getConnectionStats().connections).toBe(8);
  });

  it('closeAllConnections 는 모든 연결을 닫고 레지스트리를 비운다', () => {
    const a = new FakeResponse();
    const b = new FakeResponse();
    addConnection('alice', asResponse(a));
    addConnection('bob', asResponse(b));

    closeAllConnections();

    expect(a.ended).toBe(true);
    expect(b.ended).toBe(true);
    expect(getConnectionStats()).toEqual({ users: 0, connections: 0 });
  });
});
