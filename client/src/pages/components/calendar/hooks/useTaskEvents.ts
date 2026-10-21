// 달력에 함께 띄우는 업무. 일정이 있고 아직 끝나지 않은 것만, 읽기 전용 종일 일정으로 그린다.
// 일정은 업무 화면·글 상세에서 바꾼다. 달력에서 끌어 바꾸면 '일정' 과 '업무' 의 편집 규칙이 섞인다.
//
// 전사 공유 달력에서는 '내 업무' 를, 게시판 달력에서는 '그 게시판의 업무' 를 띄운다 —
// 게시판 달력에서 내 일만 보이면 프로젝트 일정으로 쓸 수 없다.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { EventInput } from '@fullcalendar/core';
import { fetchBoardTasks, fetchMyTasks, type WorkStatus } from '../../../../api/tasks';
import { taskKeys } from '../../../../api/queryKeys';
import { useFeature } from '../../../../store/features';
import { dueInfo } from '../../../../components/tasks/taskViews';
import { dateUtils } from '../utils';
import { useToday } from '../../../../hooks/useToday';

const OPEN: WorkStatus[] = ['todo', 'doing'];
const TASK_COLOR = '#f97316';
const OVERDUE_COLOR = '#e11d48';

/**
 * @param scope 게시판 달력이면 그 게시판. `taskEnabled` 가 꺼져 있으면 업무를 아예 띄우지
 *   않는다 — 달력만 켜고 업무는 쓰지 않는 게시판이 있고, 그런 게시판에 업무를 물으면
 *   서버가 400 으로 거절한다.
 */
export function useTaskEvents(scope?: { boardId: string; taskEnabled: boolean }): EventInput[] {
  const featureOn = useFeature('post.tasks');
  const enabled = featureOn && (!scope || scope.taskEnabled);
  const { data = [] } = useQuery({
    // 업무 화면과 같은 키를 써서 한쪽에서 바꾸면 다른 쪽도 맞춰진다
    queryKey: scope ? taskKeys.board(scope.boardId, OPEN.join(',')) : taskKeys.mine(OPEN.join(',')),
    queryFn: ({ signal }) =>
      scope ? fetchBoardTasks(scope.boardId, OPEN, signal) : fetchMyTasks(OPEN, signal),
    enabled,
  });

  // 자정을 넘기면 지각 여부가 달라진다. new Date() 를 useMemo 안에서 읽으면 자료가 다시
  // 올 때까지 어제 기준으로 칠해져, 밤새 켜 둔 달력이 지난 마감을 아직 멀쩡한 색으로 뒀다.
  const today = useToday();

  return useMemo(() => {
    return (
      data
        // 일정이 있고, 달력에 그리기로 한 것만. 끈 업무는 간트·목록에는 그대로 남는다.
        .filter(t => (t.startDate || t.dueDate) && t.showOnCalendar !== false)
        .map(t => {
          const first = (t.startDate ?? t.dueDate) as string;
          const last = (t.dueDate ?? t.startDate) as string;
          const overdue = dueInfo(t, today)?.tone === 'overdue';
          const color = overdue ? OVERDUE_COLOR : TASK_COLOR;
          return {
            id: `task:${t.id}`,
            // 칸이 좁다. 칩에는 업무 이름만 싣고 '업무 ·' 는 툴팁(fullTitle)으로 보낸다 —
            // 접두사가 92px 짜리 이름에서 42px 를 먹어 날짜 칸에서 두 글자만 남았다.
            // 업무인지 아닌지는 색(TASK_COLOR/OVERDUE_COLOR)과 task-event 로도 구분된다.
            title: t.title,
            start: first,
            // 종일 일정의 끝은 다음 날 0시다
            end: dateUtils.addDay(last),
            allDay: true,
            editable: false,
            backgroundColor: color,
            borderColor: color,
            classNames: ['task-event'],
            extendedProps: {
              taskLink: `/dashboard/posts/${t.boardType}/${t.id}`,
              fullTitle: `업무 · ${t.title}`,
            },
          };
        })
    );
  }, [data, today]);
}
