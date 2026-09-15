// client/src/components/common/UserPicker.tsx
// 사람을 찾아 고르는 입력.
//
// 사용자가 수백 명이면 <select> 로는 고를 수 없다. Tom Select 같은 바닐라 라이브러리는
// DOM 을 직접 조작해 React 리렌더와 부딪히므로, 사용자 검색 API 위에 얇게 만든다.
//
// 한 명을 고르는 곳(메시지 받는 사람)과 여러 명을 고르는 곳(비밀글 열람 허용)이 같은
// 컴포넌트를 쓴다. 검색 지연·키보드 조작·빈 상태 문구가 갈리지 않는다.

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { searchUsers, type UserSuggestion } from '../../api/users';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { ListState } from './ListState';

interface Props {
  /** 이미 고른 사람들 — 목록에서 빼고 칩으로 보여 준다 */
  selected: UserSuggestion[];
  onChange: (next: UserSuggestion[]) => void;
  /** 한 명만 고를지 */
  single?: boolean;
  /** 목록에서 제외할 아이디 (보통 본인) */
  excludeIds?: string[];
  placeholder?: string;
  /** 결과 목록에 처음부터 포커스를 둘지 */
  autoFocus?: boolean;
  /** 이 게시판을 볼 수 있는 사람만 후보로 — 담당자 지정처럼 대상이 제한된 곳에서 쓴다 */
  boardType?: string;
}

export function UserPicker({
  selected,
  onChange,
  single = false,
  excludeIds = [],
  placeholder = '아이디나 이름으로 검색',
  autoFocus = false,
  boardType,
}: Props) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebouncedValue(query, 200);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const { data: found = [], isFetching } = useQuery({
    queryKey: ['user-picker', debounced, boardType ?? ''],
    queryFn: ({ signal }) => searchUsers(debounced, signal, boardType),
    // 같은 검색어를 오가며 고를 때 매번 다시 받지 않는다
    staleTime: 30_000,
  });

  const chosen = new Set(selected.map(u => u.id));
  const excluded = new Set(excludeIds);
  const results = found.filter(u => !chosen.has(u.id) && !excluded.has(u.id));

  // 결과가 바뀌면 첫 항목으로 되돌린다 — 안 그러면 사라진 자리를 가리킨다
  useEffect(() => {
    setActiveIndex(0);
  }, [debounced, selected.length]);

  const pick = (user: UserSuggestion) => {
    onChange(single ? [user] : [...selected, user]);
    setQuery('');
  };

  const remove = (id: string) => onChange(selected.filter(u => u.id !== id));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (results.length === 0) return;
    // 한글 조합을 끝내는 Enter 로 사람이 골라지지 않게 한다
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      // 폼 안에서 쓰이므로 Enter 가 제출로 새지 않게 막는다
      e.preventDefault();
      pick(results[activeIndex]);
    }
  };

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map(user => (
            <li key={user.id}>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 py-1 pl-2.5 pr-1 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                {user.name}
                <button
                  type="button"
                  onClick={() => remove(user.id)}
                  aria-label={`${user.name} 제외`}
                  className="rounded-full p-0.5 hover:bg-primary-200 dark:hover:bg-primary-800"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-600">
        <Search className="h-4 w-4 flex-shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      {/* 검색어가 없을 때도 최근 사용자 몇 명을 보여 주면 고르기 쉽다 */}
      <ul
        role="listbox"
        aria-label="검색 결과"
        className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700"
      >
        {results.length === 0 ? (
          <li>
            <ListState>{isFetching ? '찾는 중…' : '고를 수 있는 사람이 없습니다.'}</ListState>
          </li>
        ) : (
          results.map((user, i) => (
            <li key={user.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => pick(user)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  i === activeIndex
                    ? 'bg-primary-50 dark:bg-primary-900/20'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                  {user.name}
                </span>
                <span className="truncate text-xs text-slate-400">@{user.id}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
