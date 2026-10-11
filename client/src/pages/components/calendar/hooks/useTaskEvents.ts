// 달력에 함께 띄우는 내 업무. 일정이 있고 아직 끝나지 않은 것만, 읽기 전용 종일 일정으로 그린다.
// 일정은 업무 화면·글 상세에서 바꾼다. 달력에서 끌어 바꾸면 '일정' 과 '업무' 의 편집 규칙이 섞인다.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { EventInput } from '@fullcalendar/core';
import { fetchMyTasks, type WorkStatus } from '../../../../api/tasks';
import { taskKeys } from '../../../../api/queryKeys';
import { useFeature } from '../../../../store/features';
import { dueInfo } from '../../../../components/tasks/taskViews';
import { dateUtils } from '../utils';

const OPEN: WorkStatus[] = ['todo', 'doing'];
const TASK_COLOR = '#f97316';
const OVERDUE_COLOR = '#e11d48';

export function useTaskEvents(): EventInput[] {
  const enabled = useFeature('post.tasks');
  const { data = [] } = useQuery({
    // 업무 화면과 같은 키를 써서 한쪽에서 바꾸면 다른 쪽도 맞춰진다
    queryKey: taskKeys.mine(OPEN.join(',')),
    queryFn: ({ signal }) => fetchMyTasks(OPEN, signal),
    enabled,
  });

  return useMemo(() => {
    const today = new Date();
    return data
      .filter(t => t.startDate || t.dueDate)
      .map(t => {
        const first = (t.startDate ?? t.dueDate) as string;
        const last = (t.dueDate ?? t.startDate) as string;
        const overdue = dueInfo(t, today)?.tone === 'overdue';
        const color = overdue ? OVERDUE_COLOR : TASK_COLOR;
        return {
          id: `task:${t.id}`,
          title: `업무 · ${t.title}`,
          start: first,
          // 종일 일정의 끝은 다음 날 0시다
          end: dateUtils.addDay(last),
          allDay: true,
          editable: false,
          backgroundColor: color,
          borderColor: color,
          classNames: ['task-event'],
          extendedProps: { taskLink: `/dashboard/posts/${t.boardType}/${t.id}` },
        };
      });
  }, [data]);
}
