// 헤더의 메시지 아이콘과 안 읽은 수. 실시간은 알림 벨이 맡고 여기서는 주기적으로 다시 확인한다.

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MessagesSquare } from 'lucide-react';
import { fetchUnreadMessageCount } from '../../api/messages';
import { messageKeys } from '../../api/queryKeys';
import { useFeature } from '../../store/features';

/** 다시 확인하는 주기 */
const REFETCH_MS = 60_000;

export function MessageBadge() {
  const enabled = useFeature('social.dm');

  const { data: count = 0 } = useQuery({
    queryKey: messageKeys.unread,
    queryFn: ({ signal }) => fetchUnreadMessageCount(signal),
    enabled,
    refetchInterval: REFETCH_MS,
    refetchOnWindowFocus: true,
  });

  if (!enabled) return null;

  return (
    <Link
      to="/dashboard/messages"
      aria-label={count > 0 ? `메시지 ${count}통 안 읽음` : '메시지'}
      title="메시지"
      className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      <MessagesSquare className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-2xs font-bold text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
