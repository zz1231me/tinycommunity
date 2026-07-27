// client/src/components/Dashboard/GlobalSearch.tsx
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../../api/axios';
import { formatDate } from '../../utils/date';
import { useAuthStore } from '../../store/auth';
import { useSearchHistory } from '../../hooks/useSearchHistory';
import { useUIOverlays } from '../../store/uiOverlays';

type ResultType = 'post' | 'wiki' | 'event' | 'memo';

interface SearchResult {
  id: string;
  type: ResultType;
  title: string;
  content: string;
  boardType: string;
  boardName: string;
  slug?: string;
  start?: string;
  end?: string;
  createdAt: string;
  User?: {
    name: string;
  };
}

const TYPE_ICONS: Record<ResultType, React.ReactNode> = {
  post: (
    <svg
      aria-hidden="true"
      focusable="false"
      className="w-4 h-4 text-primary-600 dark:text-primary-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  ),
  wiki: (
    <svg
      aria-hidden="true"
      focusable="false"
      className="w-4 h-4 text-emerald-600 dark:text-emerald-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  ),
  event: (
    <svg
      aria-hidden="true"
      focusable="false"
      className="w-4 h-4 text-orange-600 dark:text-orange-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  ),
  memo: (
    <svg
      aria-hidden="true"
      focusable="false"
      className="w-4 h-4 text-yellow-600 dark:text-yellow-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  ),
};

const TYPE_BG: Record<ResultType, string> = {
  post: 'from-primary-50 to-primary-100/50 dark:from-primary-900/20 dark:to-primary-900/10 group-hover:from-primary-100 group-hover:to-primary-200/50 dark:group-hover:from-primary-900/30 dark:group-hover:to-primary-900/20',
  wiki: 'from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-900/10 group-hover:from-emerald-100 group-hover:to-emerald-200/50 dark:group-hover:from-emerald-900/30 dark:group-hover:to-emerald-900/20',
  event:
    'from-orange-50 to-orange-100/50 dark:from-orange-900/20 dark:to-orange-900/10 group-hover:from-orange-100 group-hover:to-orange-200/50 dark:group-hover:from-orange-900/30 dark:group-hover:to-orange-900/20',
  memo: 'from-yellow-50 to-yellow-100/50 dark:from-yellow-900/20 dark:to-yellow-900/10 group-hover:from-yellow-100 group-hover:to-yellow-200/50 dark:group-hover:from-yellow-900/30 dark:group-hover:to-yellow-900/20',
};

const TYPE_ACCENT: Record<ResultType, string> = {
  post: 'from-primary-500 to-primary-600',
  wiki: 'from-emerald-500 to-emerald-600',
  event: 'from-orange-500 to-orange-600',
  memo: 'from-yellow-500 to-yellow-600',
};

const TYPE_COUNT_STYLE: Record<ResultType, string> = {
  post: 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20',
  wiki: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
  event: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20',
  memo: 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20',
};

const TYPE_LABELS: Record<ResultType, string> = {
  post: '게시글',
  wiki: '위키',
  event: '일정',
  memo: '메모',
};

export function GlobalSearch() {
  // 통합 overlay store — NotificationBell/UserDropdown과 자동 배타,
  // 모바일 사이드바 열림 시 자동 close
  const isOpen = useUIOverlays(s => s.activeDropdown === 'search');
  // setIsOpen은 useCallback dep을 비워 안정 ref 유지. 함수형 호출 시 prev는 store 최신값.
  const setIsOpen = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    const state = useUIOverlays.getState();
    const currentOpen = state.activeDropdown === 'search';
    const next = typeof value === 'function' ? value(currentOpen) : value;
    if (next) state.openDropdown('search');
    else state.closeDropdown('search');
  }, []);
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState<ResultType | null>(null);

  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const navigate = useNavigate();

  const user = useAuthStore(state => state.user);
  const {
    history,
    addSearch,
    removeSearch,
    clearAll,
    viewedResults,
    addViewedResult,
    removeViewed,
    clearViewed,
  } = useSearchHistory(user?.id);

  const showHistory = isOpen && searchTerm === '' && history.length > 0;
  const showViewed = isOpen && searchTerm === '' && viewedResults.length > 0;

  // ⌘K / Ctrl+K 전역 단축키
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
        if (!isOpen) {
          setTimeout(() => inputRef.current?.focus(), 100);
        }
      }
    };
    document.addEventListener('keydown', handleGlobalKey);
    return () => document.removeEventListener('keydown', handleGlobalKey);
  }, [isOpen, setIsOpen]);

  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    },
    [setIsOpen]
  );

  // ⌨️ 키보드 내비게이션 — 검색 결과 ↑↓로 이동, Enter 선택, ESC 닫기
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeIndexRef = useRef(-1);
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  // 키보드 핸들러는 최신 filteredResults를 사용해야 하므로 ref 패턴 사용
  const filteredResultsRef = useRef<SearchResult[]>([]);

  const handleResultClickRef = useRef<((r: SearchResult) => void) | null>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        return;
      }
      const list = filteredResultsRef.current;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex(prev => (list.length === 0 ? -1 : Math.min(list.length - 1, prev + 1)));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex(prev => Math.max(0, prev - 1));
      } else if (event.key === 'Enter') {
        const idx = activeIndexRef.current;
        if (idx >= 0 && idx < list.length && handleResultClickRef.current) {
          event.preventDefault();
          handleResultClickRef.current(list[idx]);
        }
      }
    },
    [setIsOpen]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleClickOutside, handleKeyDown]);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
    };
  }, []);

  const performSearch = useCallback(async (term: string) => {
    if (term.length < 2) {
      setResults([]);
      return;
    }
    searchAbortRef.current?.abort();
    searchAbortRef.current = new AbortController();
    const { signal } = searchAbortRef.current;

    setLoading(true);
    setError('');

    try {
      const response = await axios.get('/posts/search/global', {
        params: { q: term },
        signal,
      });

      if (response.data.success && response.data.data?.results) {
        setResults(response.data.data.results as SearchResult[]);
      } else {
        setResults([]);
      }
    } catch (err: unknown) {
      const axiosErr = err as {
        name?: string;
        response?: { data?: { message?: string } };
        message?: string;
      };
      if (axiosErr.name === 'CanceledError' || axiosErr.name === 'AbortError') return;
      if (import.meta.env.DEV) console.error('❌ [GlobalSearch] 검색 실패:', err);
      setError(axiosErr.response?.data?.message || '검색 중 오류가 발생했습니다.');
      setResults([]);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm.length >= 2) {
        performSearch(searchTerm);
      } else {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, performSearch]);

  const getResultUrl = (result: SearchResult): string => {
    switch (result.type) {
      case 'wiki':
        return `/dashboard/wiki/${result.slug}`;
      case 'event':
        return `/dashboard/calendar`;
      case 'memo':
        return `/dashboard/memos`;
      default:
        return `/dashboard/posts/${result.boardType}/${result.id}`;
    }
  };

  const handleResultClick = (result: SearchResult) => {
    addSearch(searchTerm);
    addViewedResult({
      id: result.id,
      type: result.type,
      title: result.title,
      boardType: result.boardType,
      url: getResultUrl(result),
      query: searchTerm,
    });
    navigate(getResultUrl(result));
    setIsOpen(false);
    setSearchTerm('');
    setResults([]);
  };

  const handleHistoryClick = (query: string) => {
    setSearchTerm(query);
    inputRef.current?.focus();
  };

  const handleOpen = () => {
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const highlightText = (text: string, term: string) => {
    if (!term) return text;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return parts.map((part, index) =>
      part.toLowerCase() === term.toLowerCase() ? (
        <mark
          key={index}
          className="bg-primary-100 dark:bg-primary-900/30 text-primary-900 dark:text-primary-100 px-0.5 rounded"
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  // 타입 순서: post → wiki → event → memo
  const typeOrder: ResultType[] = ['post', 'wiki', 'event', 'memo'];

  // 활성 필터 적용
  const filteredResults = useMemo(
    () => (activeFilter ? results.filter(r => r.type === activeFilter) : results),
    [activeFilter, results]
  );

  // 키보드 핸들러용 ref 동기화 + 결과 변경 시 선택 인덱스 리셋
  useEffect(() => {
    filteredResultsRef.current = filteredResults;
    setActiveIndex(filteredResults.length > 0 ? 0 : -1);
  }, [filteredResults]);

  useEffect(() => {
    handleResultClickRef.current = (result: SearchResult) => {
      addSearch(searchTerm);
      addViewedResult({
        id: result.id,
        type: result.type,
        title: result.title,
        boardType: result.boardType,
        url: getResultUrl(result),
        query: searchTerm,
      });
      navigate(getResultUrl(result));
      setIsOpen(false);
      setSearchTerm('');
      setResults([]);
    };
  }, [searchTerm, addSearch, addViewedResult, navigate, setIsOpen]);

  // 타입별로 그룹화
  const groupedResults = useMemo(
    () =>
      filteredResults.reduce(
        (acc, result) => {
          const key = result.type;
          if (!acc[key]) {
            acc[key] = { boardName: result.boardName, items: [] };
          }
          acc[key].items.push(result);
          return acc;
        },
        {} as Record<ResultType, { boardName: string; items: SearchResult[] }>
      ),
    [filteredResults]
  );

  const orderedGroups = useMemo(
    () => typeOrder.filter(t => groupedResults[t]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupedResults]
  );

  return (
    <>
      <div className="relative flex-1 max-w-2xl mx-4" ref={searchRef}>
        {/* 검색 버튼 (닫힌 상태) */}
        {!isOpen && (
          <button
            onClick={handleOpen}
            aria-label="전체 검색 열기 (⌘K)"
            className="w-full flex items-center gap-3 px-4 py-2.5
                       bg-slate-50/80 dark:bg-slate-800/50
                       hover:bg-slate-100 dark:hover:bg-slate-700/50
                       rounded-xl transition-all duration-200"
          >
            <svg
              aria-hidden="true"
              focusable="false"
              className="w-5 h-5 text-slate-400 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <span className="text-sm text-slate-500 dark:text-slate-400">전체검색</span>
            <kbd className="hidden sm:inline-flex items-center gap-1 ml-auto px-2 py-1 text-xs font-mono text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 rounded">
              ⌘K
            </kbd>
          </button>
        )}

        {/* 검색 입력창 (열린 상태) */}
        {isOpen && (
          <div
            className="absolute top-0 left-0 right-0 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl z-[70] overflow-hidden"
            style={{
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
              animation: 'slideDown 0.2s ease-out',
            }}
            role="dialog"
            aria-modal="true"
            aria-label="전체 검색"
          >
            {/* 입력 영역 */}
            <div className="relative p-4">
              <div className="flex items-center gap-3">
                <svg
                  aria-hidden="true"
                  focusable="false"
                  className="w-5 h-5 text-primary-500 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="전체검색... (2자 이상)"
                  aria-label="검색어 입력"
                  className="flex-1 bg-transparent border-0 outline-none shadow-none text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-0"
                  autoComplete="off"
                />
                {searchTerm && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setResults([]);
                      setActiveFilter(null);
                      inputRef.current?.focus();
                    }}
                    aria-label="검색어 지우기"
                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0"
                  >
                    <svg
                      aria-hidden="true"
                      focusable="false"
                      className="w-4 h-4 text-slate-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setSearchTerm('');
                    setResults([]);
                    setActiveFilter(null);
                  }}
                  aria-label="검색 닫기"
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0"
                >
                  ESC
                </button>
              </div>

              {searchTerm.length > 0 && searchTerm.length < 2 && (
                <p className="mt-3 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <svg
                    aria-hidden="true"
                    focusable="false"
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  2자 이상 입력해주세요
                </p>
              )}
            </div>

            {/* 구분선 */}
            {(loading ||
              error ||
              results.length > 0 ||
              showHistory ||
              (searchTerm.length >= 2 && results.length === 0)) && (
              <div className="h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-700 to-transparent mx-4" />
            )}

            {/* 필터 버튼 — 결과 위 */}
            {results.length > 0 && (
              <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap border-b border-slate-100 dark:border-slate-700/50">
                <button
                  onClick={() => setActiveFilter(null)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full transition-all ${
                    activeFilter === null
                      ? 'bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  전체 {results.length}
                </button>
                {typeOrder
                  .filter(t => groupedResults[t])
                  .map(type => {
                    const count = groupedResults[type]?.items.length ?? 0;
                    const isActive = activeFilter === type;
                    const colorMap: Record<ResultType, string> = {
                      post: isActive
                        ? 'bg-primary-600 text-white'
                        : 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30',
                      wiki: isActive
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30',
                      event: isActive
                        ? 'bg-orange-600 text-white'
                        : 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30',
                      memo: isActive
                        ? 'bg-yellow-500 text-white'
                        : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-100 dark:hover:bg-yellow-900/30',
                    };
                    return (
                      <button
                        key={type}
                        onClick={() => setActiveFilter(isActive ? null : type)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-full transition-all ${colorMap[type]}`}
                      >
                        {TYPE_LABELS[type]} {count}
                      </button>
                    );
                  })}
                <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">
                  {activeFilter
                    ? `${filteredResults.length}/${results.length}개 표시`
                    : `총 ${results.length}개`}
                </span>
              </div>
            )}

            {/* 결과 영역 */}
            <div
              className="max-h-[28rem] overflow-y-auto"
              role="listbox"
              aria-label="검색 결과"
              aria-live="polite"
              aria-atomic="false"
            >
              {/* 최근 검색 기록 */}
              {showHistory && (
                <div className="py-2">
                  <div className="px-4 py-2.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      최근 검색
                    </span>
                    <button
                      onClick={clearAll}
                      className="text-xs text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    >
                      전체 삭제
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    {history.map(query => (
                      <div
                        key={query}
                        className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors group"
                      >
                        <svg
                          aria-hidden="true"
                          focusable="false"
                          className="w-4 h-4 text-slate-300 dark:text-slate-600 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <button
                          onClick={() => handleHistoryClick(query)}
                          className="flex-1 text-left text-sm text-slate-700 dark:text-slate-300 truncate"
                        >
                          {query}
                        </button>
                        <button
                          onClick={() => removeSearch(query)}
                          aria-label={`'${query}' 검색 기록 삭제`}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-all flex-shrink-0"
                        >
                          <svg
                            aria-hidden="true"
                            focusable="false"
                            className="w-3 h-3 text-slate-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 최근 본 게시물 (검색으로 클릭한 결과) */}
              {showViewed && (
                <div className="py-2 border-t border-slate-100 dark:border-slate-700">
                  <div className="px-4 py-2.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      최근 본 게시물
                    </span>
                    <button
                      onClick={clearViewed}
                      className="text-xs text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    >
                      전체 삭제
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    {viewedResults.map(v => (
                      <div
                        key={`${v.type}-${v.id}`}
                        className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors group"
                      >
                        <svg
                          aria-hidden="true"
                          focusable="false"
                          className="w-4 h-4 text-slate-300 dark:text-slate-600 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                          />
                        </svg>
                        <button
                          onClick={() => {
                            navigate(v.url);
                            setIsOpen(false);
                            setSearchTerm('');
                            setResults([]);
                          }}
                          className="flex-1 min-w-0 text-left"
                        >
                          <span className="block text-sm text-slate-700 dark:text-slate-300 truncate">
                            {v.title}
                          </span>
                          {v.query && (
                            <span className="block text-xs text-slate-400 dark:text-slate-500 truncate">
                              ‘{v.query}’ 검색에서
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => removeViewed(v.id, v.type)}
                          aria-label={`'${v.title}' 기록 삭제`}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-all flex-shrink-0"
                        >
                          <svg
                            aria-hidden="true"
                            focusable="false"
                            className="w-3 h-3 text-slate-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 로딩 */}
              {loading && (
                <div className="p-12 text-center">
                  <div className="relative w-12 h-12 mx-auto">
                    <div className="absolute inset-0 rounded-full bg-slate-100 dark:bg-slate-700" />
                    <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary-600 animate-spin" />
                  </div>
                  <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">검색 중...</p>
                </div>
              )}

              {/* 에러 */}
              {error && (
                <div className="p-12 text-center">
                  <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                    <svg
                      aria-hidden="true"
                      focusable="false"
                      className="w-6 h-6 text-red-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              {/* 결과 없음 */}
              {!loading && !error && searchTerm.length >= 2 && filteredResults.length === 0 && (
                <div className="p-12 text-center">
                  <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <svg
                      aria-hidden="true"
                      focusable="false"
                      className="w-6 h-6 text-slate-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {activeFilter
                      ? `${TYPE_LABELS[activeFilter]} 결과가 없습니다`
                      : '검색 결과가 없습니다'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    '{searchTerm}'에 대한 {activeFilter ? `${TYPE_LABELS[activeFilter]} ` : ''}
                    결과를 찾을 수 없습니다
                  </p>
                </div>
              )}

              {/* 타입별 그룹화 결과 */}
              {!loading && !error && orderedGroups.length > 0 && (
                <div className="py-2">
                  {orderedGroups.map(type => {
                    const group = groupedResults[type];
                    return (
                      <div key={type} className="mb-3 last:mb-0">
                        {/* 섹션 헤더 */}
                        <div className="px-4 py-2.5 bg-gradient-to-r from-slate-50/50 to-transparent dark:from-slate-900/50 dark:to-transparent">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-1 h-4 bg-gradient-to-b ${TYPE_ACCENT[type]} rounded-full shadow-sm`}
                            />
                            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                              {group.boardName}
                            </h3>
                            <span
                              className={`ml-auto px-2 py-0.5 text-xs font-semibold rounded-full ${TYPE_COUNT_STYLE[type]}`}
                            >
                              {group.items.length}
                            </span>
                          </div>
                        </div>

                        {/* 결과 목록 */}
                        <div className="space-y-0.5">
                          {group.items.map(result => (
                            <button
                              key={`${result.type}-${result.id}`}
                              onClick={() => handleResultClick(result)}
                              role="option"
                              aria-selected={false}
                              className="w-full px-4 py-3 hover:bg-gradient-to-r hover:from-slate-50 hover:to-transparent dark:hover:from-slate-700/30 dark:hover:to-transparent transition-all text-left group"
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  className={`flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br ${TYPE_BG[type]} flex items-center justify-center transition-all shadow-sm`}
                                >
                                  {TYPE_ICONS[result.type]}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                                    {highlightText(result.title, searchTerm)}
                                  </h4>
                                  {result.content && (
                                    <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                                      {highlightText(result.content, searchTerm)}
                                    </p>
                                  )}
                                  <div className="mt-2.5 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-500">
                                    {result.User && (
                                      <>
                                        <span className="flex items-center gap-1.5">
                                          <svg
                                            aria-hidden="true"
                                            focusable="false"
                                            className="w-3.5 h-3.5"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                            />
                                          </svg>
                                          <span className="font-medium">{result.User.name}</span>
                                        </span>
                                        <span className="text-slate-300 dark:text-slate-600">
                                          •
                                        </span>
                                      </>
                                    )}
                                    {result.type === 'event' && result.start && (
                                      <>
                                        <span className="flex items-center gap-1.5">
                                          <svg
                                            aria-hidden="true"
                                            focusable="false"
                                            className="w-3.5 h-3.5"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                            />
                                          </svg>
                                          {formatDate(result.start)}
                                        </span>
                                        <span className="text-slate-300 dark:text-slate-600">
                                          •
                                        </span>
                                      </>
                                    )}
                                    <span className="flex items-center gap-1.5">
                                      <svg
                                        aria-hidden="true"
                                        focusable="false"
                                        className="w-3.5 h-3.5"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                        />
                                      </svg>
                                      {formatDate(result.createdAt)}
                                    </span>
                                  </div>
                                </div>
                                {/* 화살표 */}
                                <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-0.5">
                                  <svg
                                    aria-hidden="true"
                                    focusable="false"
                                    className="w-5 h-5 text-primary-500"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M9 5l7 7-7 7"
                                    />
                                  </svg>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <style>{`
          @keyframes slideDown {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}</style>
      </div>

      {/* 백드롭 */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/5 dark:bg-black/40 backdrop-blur-[2px] z-[60]"
          style={{ animation: 'fadeIn 0.2s ease-out' }}
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}
