// client/src/hooks/useSearchHistory.ts
import { useState, useCallback } from 'react';

const MAX_HISTORY = 10;
const MAX_VIEWED = 8;

/** 검색을 통해 본(클릭한) 게시물 기록 항목 */
export interface ViewedResult {
  id: string;
  type: string;
  title: string;
  boardType?: string;
  url: string;
  query: string;
  viewedAt: number;
}

function getStorageKey(userId: string): string {
  return `search_history_${userId}`;
}

function getViewedKey(userId: string): string {
  return `search_viewed_${userId}`;
}

function loadHistory(userId: string): string[] {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(userId: string, history: string[]): void {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(history));
  } catch {
    // storage full or unavailable — silently ignore
  }
}

function loadViewed(userId: string): ViewedResult[] {
  try {
    const raw = localStorage.getItem(getViewedKey(userId));
    const parsed = raw ? (JSON.parse(raw) as ViewedResult[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveViewed(userId: string, viewed: ViewedResult[]): void {
  try {
    localStorage.setItem(getViewedKey(userId), JSON.stringify(viewed));
  } catch {
    // storage full or unavailable — silently ignore
  }
}

export function useSearchHistory(userId: string | undefined) {
  const [history, setHistory] = useState<string[]>(() => (userId ? loadHistory(userId) : []));
  const [viewedResults, setViewedResults] = useState<ViewedResult[]>(() =>
    userId ? loadViewed(userId) : []
  );

  const addSearch = useCallback(
    (query: string) => {
      if (!userId) return;
      const trimmed = query.trim();
      if (trimmed.length < 2) return;
      setHistory(prev => {
        const filtered = prev.filter(q => q !== trimmed);
        const next = [trimmed, ...filtered].slice(0, MAX_HISTORY);
        saveHistory(userId, next);
        return next;
      });
    },
    [userId]
  );

  const removeSearch = useCallback(
    (query: string) => {
      if (!userId) return;
      setHistory(prev => {
        const next = prev.filter(q => q !== query);
        saveHistory(userId, next);
        return next;
      });
    },
    [userId]
  );

  const clearAll = useCallback(() => {
    if (!userId) return;
    setHistory([]);
    saveHistory(userId, []);
  }, [userId]);

  // 검색으로 본 게시물 기록 (같은 항목은 최신으로 끌어올림, 최대 MAX_VIEWED)
  const addViewedResult = useCallback(
    (item: Omit<ViewedResult, 'viewedAt'>) => {
      if (!userId || !item.id || !item.url) return;
      setViewedResults(prev => {
        const filtered = prev.filter(v => !(v.id === item.id && v.type === item.type));
        const next = [{ ...item, viewedAt: Date.now() }, ...filtered].slice(0, MAX_VIEWED);
        saveViewed(userId, next);
        return next;
      });
    },
    [userId]
  );

  const removeViewed = useCallback(
    (id: string, type: string) => {
      if (!userId) return;
      setViewedResults(prev => {
        const next = prev.filter(v => !(v.id === id && v.type === type));
        saveViewed(userId, next);
        return next;
      });
    },
    [userId]
  );

  const clearViewed = useCallback(() => {
    if (!userId) return;
    setViewedResults([]);
    saveViewed(userId, []);
  }, [userId]);

  return {
    history,
    addSearch,
    removeSearch,
    clearAll,
    viewedResults,
    addViewedResult,
    removeViewed,
    clearViewed,
  };
}
