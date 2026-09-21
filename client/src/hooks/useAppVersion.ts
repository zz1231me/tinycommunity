// client/src/hooks/useAppVersion.ts
// 켜 둔 채로 새 배포가 일어났는지 지켜본다.
//
// 열어 둔 탭은 스스로 다시 받아 오지 않는다. 배포를 해도 그 사람 화면은 예전 코드
// 그대로이고, 그 상태에서 새 API 를 부르면 조용히 어긋난다. 서버가 지금 서빙 중인
// 빌드의 표식(app-version)을 알려 주므로, 페이지가 열릴 때 심어 둔 값과 비교한다.

import { useCallback, useEffect, useRef, useState } from 'react';

/** 이 페이지가 열릴 때 서버가 심어 둔 빌드 표식 */
function loadedVersion(): string | null {
  return document.querySelector<HTMLMetaElement>('meta[name="app-version"]')?.content || null;
}

async function fetchVersion(signal: AbortSignal): Promise<string | null> {
  try {
    // 이 요청만은 절대 캐시에서 읽으면 안 된다 — 낡은 값을 보고 '최신' 이라 판단한다
    const res = await fetch('/api/app-version', { cache: 'no-store', signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { version?: string } };
    return body?.data?.version ?? null;
  } catch {
    // 잠깐 끊긴 것과 새 배포는 구분할 수 없다 — 조용히 넘어가고 다음에 다시 본다
    return null;
  }
}

const CHECK_MS = 3 * 60_000;

/**
 * @returns 새 배포가 떠 있으면 true
 */
export function useNewBuildAvailable(): boolean {
  const [stale, setStale] = useState(false);
  const mine = useRef(loadedVersion());

  const check = useCallback(async (signal: AbortSignal) => {
    // 서버가 심어 주지 않는 환경(개발 서버)에서는 비교할 것이 없다
    if (!mine.current) return;
    const latest = await fetchVersion(signal);
    if (latest && latest !== mine.current) setStale(true);
  }, []);

  useEffect(() => {
    if (stale) return; // 한 번 알았으면 더 물어볼 필요가 없다
    const ac = new AbortController();
    void check(ac.signal);

    const id = window.setInterval(() => {
      if (!document.hidden) void check(ac.signal);
    }, CHECK_MS);
    // 다른 일을 보다 돌아온 순간이 가장 알맞다 — 그 사이 배포가 있었을 수 있다
    const onVisible = () => {
      if (!document.hidden) void check(ac.signal);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      ac.abort();
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check, stale]);

  return stale;
}
