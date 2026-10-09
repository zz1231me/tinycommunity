// 헤더의 메시지 아이콘과 안 읽은 수.
//
// 새 메시지는 SSE 알림이 먼저 알려 주므로 주기적인 확인은 그것이 끊겼을 때의 대비다.
// 연결이 살아 있는 동안 1 분마다 묻는 것은 사람 수만큼 쌓이는 헛된 요청이다.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MessagesSquare } from 'lucide-react';
import { fetchUnreadMessageCount } from '../../api/messages';
import { messageKeys } from '../../api/queryKeys';
import { useFeature } from '../../store/features';
import { useNotificationStore } from '../../store/notifications';
import { useNotificationArrival } from '../../hooks/useNotificationArrival';

/** 알림이 끊겼을 때 쓰는 주기 */
const REFETCH_MS = 60_000;
/** 알림이 살아 있을 때. 새 메시지는 알림이 알려 주므로 이것은 어긋남을 바로잡는 용도다. */
const REFETCH_MS_WITH_SSE = 5 * 60_000;

export function MessageBadge() {
  const enabled = useFeature('social.dm');
  const queryClient = useQueryClient();
  const live = useNotificationStore(s => s.isLive);

  const { data: count = 0 } = useQuery({
    queryKey: messageKeys.unread,
    queryFn: ({ signal }) => fetchUnreadMessageCount(signal),
    enabled,
    refetchInterval: live ? REFETCH_MS_WITH_SSE : REFETCH_MS,
    refetchOnWindowFocus: true,
  });

  // 알림이 오면 바로 센다. 주기를 늦춘 만큼 이것이 실제 반영을 맡는다.
  useNotificationArrival(['MESSAGE'], () => {
    void queryClient.invalidateQueries({ queryKey: messageKeys.unread });
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
        <span className="badge-count absolute -right-0.5 -top-0.5 bg-red-600 text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
