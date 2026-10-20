// 달력 화면의 '간트' 보기. 첫 화면에서 바로 일정 띠를 보려고 둔다.
//
// 달력은 '언제 무엇이 있는가' 를 보여 주지만, 기간이 겹치는 일을 한눈에 비교하기는
// 어렵다. 같은 자리에서 보기만 바꿔 띠로 볼 수 있게 한다 — 업무 화면까지 들어가지
// 않아도 되도록.
//
// 막대를 끌면 일정이 바뀐다(업무 화면의 간트와 같은 부품·같은 규칙이다).
// 바꿀 권한이 없는 업무는 서버가 거절하고 막대가 제자리로 돌아간다.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { changeTask, fetchMyTasks, type MyTask, type WorkStatus } from '../../../../api/tasks';
import { taskKeys } from '../../../../api/queryKeys';
import { TaskGantt } from '../../../../components/tasks/TaskGantt';
import { ListError, ListLoading, ListState } from '../../../../components/common/ListState';
import { toast } from '../../../../utils/toast';
import { getApiErrorMessage } from '../../../../api/utils';

/** 끝난 일은 빼고 본다 — 달력에서도 '남은 일' 이 궁금한 자리다. */
const OPEN: WorkStatus[] = ['todo', 'doing'];
const STATUS_KEY = OPEN.join(',');

export function CalendarGantt() {
  const queryClient = useQueryClient();

  const {
    data: tasks = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: taskKeys.mine(STATUS_KEY),
    queryFn: ({ signal }) => fetchMyTasks(OPEN, signal),
    refetchOnMount: 'always',
  });

  /** 실패하면 거절한다 — 간트가 막대를 저장된 자리로 되돌린다. */
  const reschedule = async (task: MyTask, dates: { startDate: string; dueDate: string }) => {
    try {
      await changeTask(task.boardType, task.id, dates);
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    } catch (err) {
      toast.error(getApiErrorMessage(err, '일정을 바꾸지 못했습니다.'));
      throw err;
    }
  };

  if (isLoading) return <ListLoading />;
  if (isError) return <ListError what="내 업무" />;
  if (tasks.length === 0) {
    return (
      <ListState size="roomy">
        맡은 일이 없습니다.
        <br />글 상세 화면에서 담당자로 지정되면 여기에 띠로 모입니다.
      </ListState>
    );
  }

  return <TaskGantt tasks={tasks} onReschedule={reschedule} embedded />;
}
