// client/src/hooks/useBookmarks.ts - 새로운 API로 마이그레이션
import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchBookmarks, type Bookmark } from '../api/bookmarks';

/**
 * 북마크가 가리키는 진짜 주소. 사람이 'example.com' 처럼 적어 두므로 빠진 스킴을 채운다.
 * 링크의 href 로도 쓰므로 창을 여는 쪽과 같은 값이어야 한다 —
 * 두 벌로 갈라지면 마우스를 올렸을 때 보이는 주소와 실제로 가는 곳이 달라진다.
 */
export function bookmarkHref(url: string): string {
  return url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
}

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 수동 새로고침용 컨트롤러 — 언마운트/재호출 시 직전 요청을 취소해 unmount 후 setState 방지
  const refreshControllerRef = useRef<AbortController | null>(null);

  const loadBookmarks = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError(null);

      const bookmarkData = await fetchBookmarks(signal);
      if (signal?.aborted) return;
      setBookmarks(bookmarkData);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (signal?.aborted) return;
      setError(err.message || '북마크를 불러올 수 없습니다');
      // 기존 북마크 데이터 유지 (에러 시 초기화하지 않음)
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadBookmarks(controller.signal);
    return () => {
      controller.abort();
      refreshControllerRef.current?.abort();
    };
  }, [loadBookmarks]);

  const openBookmark = (url: string) => {
    window.open(bookmarkHref(url), '_blank', 'noopener,noreferrer');
  };

  const refreshBookmarks = useCallback(() => {
    refreshControllerRef.current?.abort();
    const controller = new AbortController();
    refreshControllerRef.current = controller;
    loadBookmarks(controller.signal);
  }, [loadBookmarks]);

  return {
    bookmarks,
    loading,
    error,
    openBookmark,
    refreshBookmarks,
  };
}
