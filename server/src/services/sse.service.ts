// 알림 전달용 SSE 연결 레지스트리. 연결은 이 프로세스 메모리에만 있어, 다중 프로세스에서는 폴링 폴백이 받는다.

import { Response } from 'express';
import { logInfo } from '../utils/logger';

/** 한 사용자가 여러 탭·기기를 열 수 있으므로 userId 당 연결은 집합으로 관리한다. */
const connections = new Map<string, Set<Response>>();

/** 프록시·로드밸런서가 유휴 연결을 끊지 않도록 보내는 주석 프레임 주기 */
const HEARTBEAT_MS = 25_000;

/** 한 사용자가 열 수 있는 동시 연결 수 상한 */
const MAX_CONNECTIONS_PER_USER = 8;

export type SsePayload = Record<string, unknown>;

function write(res: Response, event: string, data: SsePayload): void {
  // SSE 프레임 형식: 이벤트 이름 + JSON 한 줄 + 빈 줄
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/** SSE 연결을 등록한다. 라우트 핸들러에서 응답 헤더를 세운 뒤 호출한다. */
export function addConnection(userId: string, res: Response): void {
  let userConnections = connections.get(userId);
  if (!userConnections) {
    userConnections = new Set();
    connections.set(userId, userConnections);
  }

  // 상한을 넘으면 가장 오래된 연결부터 닫는다. 'bye' 를 먼저 보내야 그 탭이 다시 이어 붙으며 서로를 밀어내지 않는다.
  while (userConnections.size >= MAX_CONNECTIONS_PER_USER) {
    const oldest = userConnections.values().next().value;
    if (!oldest) break;
    userConnections.delete(oldest);
    try {
      write(oldest, 'bye', { reason: 'too-many-connections' });
    } catch {
      // 이미 끊긴 연결이라 무시한다.
    }
    oldest.end();
  }

  userConnections.add(res);

  const heartbeat = setInterval(() => {
    try {
      // ':' 로 시작하는 줄은 SSE 주석이라 연결만 살려 둔다.
      res.write(': ping\n\n');
    } catch {
      // 타이머 콜백이라 예외가 새면 프로세스가 내려간다. 정리는 close 핸들러가 맡는다.
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

/** 한 사람의 열린 스트림을 모두 끊는다. 스트림은 붙을 때 한 번만 인증하므로 세션을 끊을 때 직접 닫아야 한다. */
export function closeUserConnections(userId: string): number {
  const set = connections.get(userId);
  if (!set) return 0;
  const closed = set.size;
  for (const res of set) {
    try {
      write(res, 'bye', { reason: 'session-ended' });
    } catch {
      // 이미 끊긴 연결이라 무시한다.
    }
    res.end();
  }
  connections.delete(userId);
  return closed;
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

/** 현재 열린 연결 수 */
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
