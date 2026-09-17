// client/src/components/boards/PostActivityLog.tsx
// 이 글에 무슨 일이 있었나 — 작성·수정·첨부 교체·상태·담당자 변경을 한 줄기로.
//
// 본문 변경만이 아니라 담당자·업무 상태·첨부 교체까지 한 줄기로 모은다.
//
// 접어 둔 상태에서는 최근 몇 줄만 보인다. 오래된 글일수록 기록이 길어져 본문을 밀어낸다.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, FileText, History, Paperclip, PenLine, UserRound } from 'lucide-react';
import { fetchActivity, fetchWorkStatuses, type ActivityEntry } from '../../api/tasks';
import { taskKeys } from '../../api/queryKeys';
import { formatFullDateTime, formatRelativeDate, toISOString } from '../../utils/date';

/** 접었을 때 보여 줄 줄 수 — 대부분의 글은 이 안에서 끝난다 */
const COLLAPSED_COUNT = 4;

const ICONS: Record<ActivityEntry['kind'], typeof History> = {
  created: FileText,
  edited: PenLine,
  attachment: Paperclip,
  status: History,
  assignee: UserRound,
};

interface Props {
  boardType: string;
  postId: string;
  /** 수정 줄을 눌렀을 때 본문 차이를 열어 준다 */
  onOpenRevisions?: () => void;
}

export function PostActivityLog({ boardType, postId, onOpenRevisions }: Props) {
  const [expanded, setExpanded] = useState(false);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: taskKeys.activity(boardType, postId),
    queryFn: ({ signal }) => fetchActivity(boardType, postId, signal),
    staleTime: 30_000,
  });

  // 상태 키('todo')를 사람이 읽는 말('할 일')로 바꾼다. 라벨은 서버 카탈로그가 정한다 —
  // 화면이 지어내면 상태를 늘렸을 때 여기만 옛 이름으로 남는다.
  const { data: statuses = [] } = useQuery({
    queryKey: taskKeys.statuses,
    queryFn: ({ signal }) => fetchWorkStatuses(signal),
    staleTime: Infinity,
  });
  const statusLabel = (key: string | null | undefined) =>
    statuses.find(s => s.key === key)?.label ?? key ?? '없음';

  if (isLoading || entries.length === 0) return null;

  const shown = expanded ? entries : entries.slice(0, COLLAPSED_COUNT);

  return (
    <section className="card overflow-hidden">
      <div className="card-header">
        <History className="h-4 w-4 text-slate-400" aria-hidden="true" />
        <h2 className="card-title">활동 기록</h2>
        <span className="text-xs text-slate-400">{entries.length}건</span>
      </div>

      <ol className="card-body">
        {shown.map(entry => {
          const Icon = ICONS[entry.kind];
          return (
            <li key={entry.id} className="flex items-start gap-3 py-1.5">
              <Icon
                className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400"
                aria-hidden="true"
              />
              <p className="min-w-0 flex-1 text-sm text-slate-600 dark:text-slate-300">
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {entry.actor?.name ?? '알 수 없음'}
                </span>{' '}
                {describe(entry, statusLabel)}
                {entry.kind === 'edited' && onOpenRevisions && (
                  <button
                    type="button"
                    onClick={onOpenRevisions}
                    className="ml-1.5 text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
                  >
                    차이 보기
                  </button>
                )}
              </p>
              <time
                dateTime={toISOString(entry.at)}
                title={formatFullDateTime(entry.at)}
                className="flex-shrink-0 text-xs text-slate-400"
              >
                {formatRelativeDate(entry.at)}
              </time>
            </li>
          );
        })}
      </ol>

      {entries.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          className="flex w-full items-center justify-center gap-1 border-t border-slate-200 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700/40"
        >
          {expanded ? '접기' : `${entries.length - COLLAPSED_COUNT}건 더 보기`}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      )}
    </section>
  );
}

/** 한 줄을 사람 말로 — 값이 비어 있는 경우(담당자 해제 등)까지 문장이 되게 */
function describe(entry: ActivityEntry, statusLabel: (key?: string | null) => string): string {
  switch (entry.kind) {
    case 'created':
      return '글을 썼습니다.';
    case 'edited':
      return '내용을 수정했습니다.';
    case 'attachment':
      return `${entry.fileName ?? '첨부'} 를 새 버전으로 교체했습니다.`;
    case 'status':
      return `상태를 ${statusLabel(entry.from?.value)} → ${statusLabel(entry.to?.value)} 로 바꿨습니다.`;
    case 'assignee':
      if (!entry.to?.value) return '담당자를 해제했습니다.';
      return entry.from?.value
        ? `담당자를 ${entry.from.label} 에서 ${entry.to.label} 로 바꿨습니다.`
        : `${entry.to.label} 를 담당자로 지정했습니다.`;
  }
}
