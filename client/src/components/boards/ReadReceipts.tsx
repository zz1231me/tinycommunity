// client/src/components/boards/ReadReceipts.tsx
// 누가 읽었는지 — 작성자·게시판 담당자·관리자만 본다.
//
// 접힌 상태에서는 "12명 중 5명 확인" 같은 숫자만 보여 주고 이름은 펼쳐야 나온다.
// 서버도 같은 선을 지킨다(403).
//
// 아직 안 읽은 사람을 먼저 보여 준다.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Eye } from 'lucide-react';
import { Avatar } from '../Avatar';
import { fetchReadReceipts } from '../../api/tasks';
import { taskKeys } from '../../api/queryKeys';
import { formatRelativeDate } from '../../utils/date';

interface Props {
  boardType: string;
  postId: string;
}

export function ReadReceipts({ boardType, postId }: Props) {
  const [open, setOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: taskKeys.readers(boardType, postId),
    queryFn: ({ signal }) => fetchReadReceipts(boardType, postId, signal),
    // 열람은 계속 쌓이므로 접었다 펴면 다시 확인한다
    staleTime: 30_000,
    // 권한 없음(403)은 재시도해도 달라지지 않는다
    retry: false,
  });

  // 권한이 없으면 서버가 403 을 준다 — 그 경우 섹션 자체를 그리지 않는다
  if (isError) return null;

  const percent = data && data.total > 0 ? Math.round((data.readCount / data.total) * 100) : 0;

  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="card-header w-full text-left"
      >
        <Eye className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
        <span className="card-title">읽음 확인</span>

        {isLoading ? (
          <span className="text-xs text-slate-400">확인 중…</span>
        ) : data ? (
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {data.total}명 중{' '}
              <strong className="text-slate-900 dark:text-slate-100">{data.readCount}</strong>명
              확인
            </span>
            {/* 막대는 숫자를 대신하지 않고 거든다 — 숫자를 항상 함께 둔다 */}
            <span
              className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 sm:block"
              aria-hidden="true"
            >
              <span
                className="block h-full rounded-full bg-primary-500 transition-[width]"
                style={{ width: `${percent}%` }}
              />
            </span>
          </span>
        ) : null}

        <ChevronDown
          className={`ml-auto h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {open && data && (
        <div className="card-body grid gap-5 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              아직 안 읽음 ({data.unread.length})
            </h3>
            {data.unread.length === 0 ? (
              <p className="text-xs text-slate-400">모두 확인했습니다.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.unread.map(u => (
                  <li key={u.id} className="flex items-center gap-2">
                    <Avatar user={u} size="xs" />
                    <span className="truncate text-sm text-slate-700 dark:text-slate-300">
                      {u.name}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              읽음 ({data.readers.length})
            </h3>
            {data.readers.length === 0 ? (
              <p className="text-xs text-slate-400">아직 아무도 읽지 않았습니다.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.readers.map(u => (
                  <li key={u.id} className="flex items-center gap-2">
                    <Avatar user={u} size="xs" />
                    <span className="truncate text-sm text-slate-700 dark:text-slate-300">
                      {u.name}
                    </span>
                    <time
                      dateTime={u.readAt}
                      className="ml-auto flex-shrink-0 text-xs text-slate-400"
                    >
                      {formatRelativeDate(u.readAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
