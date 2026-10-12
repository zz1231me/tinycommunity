// 보기 설정을 계정에 저장한다. 기기를 바꿔도 업무 보기·정렬이 따라온다.
//
// 두 곳에 함께 둔다.
//  - localStorage: 화면을 열자마자 쓴다. 서버 응답을 기다리면 목록 보기로 한 번 그려졌다가
//    칸반으로 튀어, 바뀌는 것이 눈에 보인다.
//  - 서버: 기기 사이를 잇는 쪽. 응답이 오면 그 값으로 맞춘다.
// 저장은 양쪽에 함께 쓰고, 서버 저장이 실패해도 화면 조작은 막지 않는다(그 기기에서는 남는다).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchUiPrefs, saveUiPrefs, type UiPrefs } from '../api/uiPrefs';
import { safeStorage } from '../utils/safeStorage';
import { useAuth } from '../store/auth';

const CACHE_KEY = 'myhome-ui-prefs';

function readCache(): UiPrefs {
  try {
    const raw = safeStorage.get(CACHE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as UiPrefs)
      : {};
  } catch {
    return {};
  }
}

export function useUiPrefs(): {
  prefs: UiPrefs;
  setPref: <K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) => void;
} {
  const loggedIn = useAuth(s => s.isAuthenticated);
  const [prefs, setPrefs] = useState<UiPrefs>(readCache);

  const { data } = useQuery({
    queryKey: ['ui-prefs'],
    queryFn: ({ signal }) => fetchUiPrefs(signal),
    enabled: loggedIn,
    staleTime: 5 * 60_000,
  });

  /**
   * 이 화면에서 내가 바꾼 키. 서버 값이 와도 이 키들은 내 값을 지킨다.
   *
   * '저장 중인지' 로 가리면 안 된다 — 저장이 먼저 끝나고 조회 응답이 나중에 닿으면
   * 방금 바꾼 값이 옛 값으로 되돌아간다(실제로 그렇게 됐다).
   */
  const touched = useRef(new Set<keyof UiPrefs>());

  // 서버 값이 오면 맞추되, 내가 바꾼 키는 내 값을 남긴다.
  useEffect(() => {
    if (!data) return;
    setPrefs(prev => {
      const mine: UiPrefs = {};
      for (const key of touched.current) {
        if (prev[key] !== undefined) (mine as Record<string, unknown>)[key] = prev[key];
      }
      const next = { ...data, ...mine };
      safeStorage.set(CACHE_KEY, JSON.stringify(next));
      return next;
    });
  }, [data]);

  const setPref = useCallback(<K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) => {
    touched.current.add(key);
    setPrefs(prev => {
      const next = { ...prev, [key]: value };
      safeStorage.set(CACHE_KEY, JSON.stringify(next));
      return next;
    });
    void saveUiPrefs({ [key]: value } as UiPrefs).catch(() => {
      // 이 기기에는 남아 있다. 다음에 성공할 때 서버가 맞춰진다.
    });
  }, []);

  return { prefs, setPref };
}
