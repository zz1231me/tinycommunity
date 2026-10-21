// 업무 카드를 옮기고 일정을 바꾸는 손. 화면(모아 보기·게시판 안)마다 따로 적던 것을 한자리로 모은다.
//
// 어느 화면에서 부르든 규칙은 같다.
//  - 서버 응답을 기다리지 않고 화면을 먼저 고치고, 실패하면 되돌린다.
//  - 완료로 옮기면 기본 목록에서 사라지므로 묻지 않고 옮기되 몇 초 동안 무를 수 있게 한다.
//  - 무르기는 ifWorkStatus 를 함께 보낸다 — 그사이 남이 바꾼 상태를 덮어쓰지 않는다.

import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { changeTask, type MyTask, type WorkStatus } from '../api/tasks';
import { taskKeys } from '../api/queryKeys';
import { getApiErrorMessage } from '../api/utils';
import type { KanbanStatus, Schedule } from '../components/tasks/taskViews';
import { useStatusLabel } from '../components/tasks/useStatusLabel';
import { useConfirm } from './useConfirm';
import { toast } from '../utils/toast';

export function useTaskActions(queryKey: QueryKey) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const statusLabel = useStatusLabel();

  /** 서버 응답을 기다리지 않고 화면의 한 업무를 고친다 */
  const patchTask = (id: string, change: Partial<MyTask>) =>
    queryClient.setQueryData<MyTask[]>(queryKey, prev =>
      prev?.map(t => (t.id === id ? { ...t, ...change } : t))
    );

  /** 상태를 바꾸고 성공하면 true. 실패하면 화면을 되돌린다. */
  const saveStatus = async (
    task: MyTask,
    to: WorkStatus,
    options: { ifWorkStatus?: WorkStatus } = {}
  ): Promise<boolean> => {
    patchTask(task.id, { workStatus: to });
    try {
      const result = await changeTask(task.boardType, task.id, { workStatus: to, ...options });
      // 담당자 없는 업무를 '진행 중' 으로 옮기면 서버가 옮긴 사람을 담당자로 정한다.
      // 팀 보기에서 남의 일을 정리하다 모르는 새 맡게 되지 않게 알린다.
      if (!task.assignee && result?.assignee) {
        toast.info(`'${task.title}' 의 담당자가 ${result.assignee.name}(으)로 정해졌습니다.`);
      }
      return true;
    } catch (err) {
      patchTask(task.id, { workStatus: task.workStatus });
      toast.error(getApiErrorMessage(err, '상태를 바꾸지 못했습니다.'));
      return false;
    } finally {
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
    }
  };

  const moveTask = async (task: MyTask, to: KanbanStatus) => {
    const ok = await saveStatus(task, to);
    // 완료로 옮기면 기본 목록에서 사라진다. 묻는 대신 바로 옮기고 몇 초 동안 무를 수 있게 한다.
    if (ok && to === 'done') {
      toast.undo(`'${task.title}' 을(를) ${statusLabel('done')}(으)로 옮겼습니다.`, () => {
        // 그사이 다른 사람이 상태를 바꿨으면 서버가 409 로 거절한다. 남의 변경을 덮어쓰지 않는다.
        void saveStatus({ ...task, workStatus: to }, task.workStatus, { ifWorkStatus: to });
      });
    }
  };

  /** 일정을 바꾼다. 실패하면 화면을 되돌리고 거절한다(간트가 막대를 제자리로 돌린다). */
  const saveSchedule = async (task: MyTask, schedule: Schedule) => {
    patchTask(task.id, schedule);
    try {
      await changeTask(task.boardType, task.id, schedule);
    } catch (err) {
      patchTask(task.id, { startDate: task.startDate, dueDate: task.dueDate });
      toast.error(getApiErrorMessage(err, '일정을 바꾸지 못했습니다.'));
      throw err;
    } finally {
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
    }
  };

  const setSchedule = (task: MyTask, schedule: Schedule) => {
    saveSchedule(task, schedule).catch(() => {
      // 이미 알렸고 화면도 되돌렸다
    });
  };

  const clearSchedule = async (task: MyTask) => {
    // 지운 날짜는 되살릴 길이 없어 묻는다
    const ok = await confirm({
      title: '일정을 지울까요?',
      description: `'${task.title}' 의 시작일·마감일을 지웁니다. 마감 알림도 더 오지 않습니다.`,
      confirmLabel: '일정 지우기',
      danger: true,
    });
    if (ok) setSchedule(task, { startDate: null, dueDate: null });
  };

  return { moveTask, saveSchedule, setSchedule, clearSchedule, dialog };
}
