// 저장된 업무 필터. 지라의 saved filter 자리다.
//
// '긴급 + 이번 주 마감 + 품질 게시판' 처럼 늘 보는 조건을 매번 다시 만들지 않게 이름을
// 붙여 둔다. 계정에 저장하므로 기기를 바꿔도 따라온다.

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, X } from 'lucide-react';
import {
  deleteTaskFilter,
  fetchTaskFilters,
  saveTaskFilter,
  type SavedTaskFilter,
  type SavedTaskFilterInput,
} from '../../api/taskFilters';
import { savedFilterKeys } from '../../api/queryKeys';
import { hasOpenDialog } from '../../hooks/useFocusTrap';
import { getApiErrorMessage } from '../../api/utils';
import { toast } from '../../utils/toast';

/** 지금 화면의 조건이 저장해 둔 것과 같은가. 이름을 따로 기억하지 않고 매번 견준다 —
 *  조건을 하나라도 손대면 이름 표시가 저절로 사라진다. */
function sameConditions(saved: SavedTaskFilter, current: SavedTaskFilterInput): boolean {
  return (
    saved.scope === current.scope &&
    saved.query === current.query &&
    saved.boardType === current.boardType &&
    saved.due === current.due &&
    saved.priority === current.priority &&
    saved.sort === current.sort
  );
}

interface Props {
  /** 지금 화면의 조건. '이 조건 저장' 이 그대로 담는다. */
  current: SavedTaskFilterInput;
  onApply: (filter: SavedTaskFilter) => void;
}

export function SavedFilters({ current, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [lastSavedId, setLastSavedId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: filters = [] } = useQuery({
    queryKey: savedFilterKeys.all,
    queryFn: ({ signal }) => fetchTaskFilters(signal),
    staleTime: 5 * 60_000,
  });

  // 조건이 같은 것이 여럿일 수 있다. 방금 저장한 것이 있으면 그것을 보여 준다 —
  // 이름을 적어 저장한 직후에 남의 이름이 서 있으면 저장이 안 된 것처럼 보인다.
  const matching = filters.filter(f => sameConditions(f, current));
  const active = matching.find(f => f.id === lastSavedId) ?? matching[0];

  const close = () => {
    setOpen(false);
    setNaming(false);
    setName('');
  };

  // 다른 메뉴들과 같게 닫힌다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || hasOpenDialog()) return;
      close();
    };
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: savedFilterKeys.all });

  const save = useMutation({
    mutationFn: (input: SavedTaskFilterInput) => saveTaskFilter(input),
    onSuccess: saved => {
      setLastSavedId(saved.id);
      void refresh();
      close();
      toast.success(`'${saved.name}' 으로 저장했습니다.`);
    },
    onError: err => toast.error(getApiErrorMessage(err, '필터를 저장하지 못했습니다.')),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteTaskFilter(id),
    onSuccess: () => void refresh(),
    onError: err => toast.error(getApiErrorMessage(err, '필터를 지우지 못했습니다.')),
  });

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
      >
        <Bookmark
          className={`h-3.5 w-3.5 ${active ? 'text-primary-600 dark:text-primary-400' : ''}`}
          aria-hidden="true"
        />
        <span className="max-w-[9rem] truncate">{active ? active.name : '저장된 필터'}</span>
        {!active && filters.length > 0 && (
          <span className="tabular-nums text-xs text-slate-400">{filters.length}</span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 w-72 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {filters.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
              저장해 둔 필터가 없습니다.
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {filters.map(filter => (
                <li key={filter.id} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      onApply(filter);
                      close();
                    }}
                    className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm text-slate-800 transition-colors hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-700/60"
                  >
                    {filter.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove.mutate(filter.id)}
                    aria-label={`${filter.name} 지우기`}
                    className="mr-1 rounded p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-slate-100 pt-1 dark:border-slate-700">
            {naming ? (
              <form
                onSubmit={e => {
                  e.preventDefault();
                  const trimmed = name.trim();
                  if (trimmed) save.mutate({ ...current, name: trimmed });
                }}
                className="flex items-center gap-1 px-2 py-1"
              >
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  // 열자마자 이름부터 적게 한다
                  autoFocus
                  maxLength={50}
                  placeholder="필터 이름"
                  aria-label="필터 이름"
                  className="input flex-1 py-1 text-sm"
                />
                <button
                  type="submit"
                  disabled={!name.trim() || save.isPending}
                  className="btn-primary px-2 py-1 text-xs"
                >
                  저장
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setNaming(true)}
                className="block w-full px-3 py-2 text-left text-sm font-medium text-primary-600 transition-colors hover:bg-slate-50 dark:text-primary-400 dark:hover:bg-slate-700/60"
              >
                지금 조건을 저장
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
