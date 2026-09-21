// 열어 둔 탭에서 새 배포가 떴는지 확인한다. 페이지에 심어 둔 app-version 과 서버 값을 비교한다.

import { useCallback, useEffect, useRef, useState } from 'react';

/** 이 페이지가 열릴 때 서버가 심어 둔 빌드 표식 */
function loadedVersion(): string | null {
  return document.querySelector<HTMLMetaElement>('meta[name="app-version"]')?.content || null;
}

async function fetchVersion(signal: AbortSignal): Promise<string | null> {
  try {
    // 캐시에서 읽으면 낡은 값을 최신으로 오판한다.
    const res = await fetch('/api/app-version', { cache: 'no-store', signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { version?: string } };
    return body?.data?.version ?? null;
  } catch {
    // 일시적 실패와 새 배포를 구분할 수 없으므로 다음 주기에 다시 확인한다.
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
    if (stale) return;
    const ac = new AbortController();
    void check(ac.signal);

    const id = window.setInterval(() => {
      if (!document.hidden) void check(ac.signal);
    }, CHECK_MS);
    // 탭으로 돌아온 순간에도 다시 확인한다.
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
