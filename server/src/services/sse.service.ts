// server/src/services/sse.service.ts
// 알림 실시간 전달용 SSE(Server-Sent Events) 연결 레지스트리.
//
// 알림은 서버→클라이언트 단방향이고, SSE 는 일반 HTTP 응답이라 업그레이드 핸드셰이크
// 없이 기존 쿠키 인증·리버스 프록시·rate limit 설정을 그대로 쓴다.
//
// 연결은 이 프로세스의 메모리에만 존재한다. 여러 프로세스로 띄우면 다른 프로세스가
// 만든 알림은 이쪽 연결로 오지 않고, 클라이언트의 폴링 폴백이 받는다(지연만 발생).

import { Response } from 'express';
import { logInfo } from '../utils/logger';

/** 한 사용자가 여러 탭·기기를 열 수 있으므로 userId 당 연결은 집합으로 관리한다. */
const connections = new Map<string, Set<Response>>();

/** 프록시·로드밸런서가 유휴 연결을 끊지 않도록 보내는 주석 프레임 주기 */
const HEARTBEAT_MS = 25_000;

/** 한 사용자가 열 수 있는 동시 연결 수 상한 — 탭을 대량으로 열어 자원을 소모하는 것 방지 */
const MAX_CONNECTIONS_PER_USER = 8;

export type SsePayload = Record<string, unknown>;

function write(res: Response, event: string, data: SsePayload): void {
  // SSE 프레임 형식: 이벤트 이름 + JSON 한 줄 + 빈 줄
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * SSE 연결을 등록한다. 라우트 핸들러에서 응답 헤더를 세운 뒤 호출한다.
 * 반환값은 정리 함수이며, 연결 종료 시 자동으로도 호출된다.
 */
export function addConnection(userId: string, res: Response): void {
  let userConnections = connections.get(userId);
  if (!userConnections) {
    userConnections = new Set();
    connections.set(userId, userConnections);
  }

  // 상한 초과 시 가장 오래된 연결을 닫는다(Set 은 삽입 순서를 유지한다).
  while (userConnections.size >= MAX_CONNECTIONS_PER_USER) {
    const oldest = userConnections.values().next().value;
    if (!oldest) break;
    userConnections.delete(oldest);
    oldest.end();
  }

  userConnections.add(res);

  const heartbeat = setInterval(() => {
    try {
      // ':' 로 시작하는 줄은 SSE 주석 — 클라이언트는 무시하지만 연결은 살아 있게 한다.
      res.write(': ping\n\n');
    } catch {
      // pushToUser 와 같은 이유로 삼킨다(끊긴 연결에 쓰면 예외가 날 수 있다).
      // 다만 이쪽이 더 위험하다 — 타이머 콜백이라 예외를 받아 줄 요청 처리 흐름이
      // 없어서, 그대로 두면 연결 하나가 죽을 때 프로세스가 함께 내려간다.
      // 정리는 close 핸들러가 맡는다.
    }
  }, HEARTBEAT_MS);

  const cleanup = () => {
    clearInterval(heartbeat);
    const set = connections.get(userId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) connections.delete(userId);
  };

  res.on('close', cleanup);
  res.on('error', cleanup);
}

/** 특정 사용자의 모든 연결로 이벤트를 보낸다. 연결이 없으면 아무 일도 하지 않는다. */
export function pushToUser(userId: string, event: string, data: SsePayload): void {
  const userConnections = connections.get(userId);
  if (!userConnections || userConnections.size === 0) return;

  for (const res of userConnections) {
    try {
      write(res, event, data);
    } catch {
      // 끊긴 연결에 쓰면 예외가 날 수 있다. close 핸들러가 정리하므로 여기선 무시한다.
    }
  }
}

/** 운영 지표용 — 현재 열린 연결 수 */
export function getConnectionStats(): { users: number; connections: number } {
  let total = 0;
  for (const set of connections.values()) total += set.size;
  return { users: connections.size, connections: total };
}

/** 서버 종료 시 모든 연결을 닫는다. */
export function closeAllConnections(): void {
  const { connections: count } = getConnectionStats();
  for (const set of connections.values()) {
    for (const res of set) res.end();
  }
  connections.clear();
  if (count > 0) logInfo('SSE 연결 정리 완료', { closed: count });
}
