// 간트가 읽는 나무 모양 만들기. 화면이 아니라 자료 변환이라 따로 둔다
// (컴포넌트 파일에서 내보내면 fast refresh 가 깨진다).

import type { ITask } from '@svar-ui/react-gantt';
import type { MyTask } from '../../api/tasks';
import { toGanttRange } from './taskViews';

/**
 * 업무 목록을 간트가 읽는 나무 모양으로 바꾼다.
 *
 * 하위 업무는 상위 아래로 들여 그린다 — 목록이 이미 그렇게 보여 주므로, 간트에서만
 * 나란히 서면 같은 자료가 화면마다 다른 모양이 된다.
 *
 * 조심할 것 둘:
 *  1. 상위가 이 목록에 없을 수 있다(끝난 업무는 50개까지만 오고, 게시판 간트는 그
 *     게시판 것만 받는다). 없는 부모를 가리키면 그 줄이 통째로 사라지므로 맨 윗단으로.
 *  2. `open` 은 **실제로 하위를 가진 줄에만** 준다. 자식이 없는 줄에 주면 SVAR 가 없는
 *     자식 목록을 훑다가 터지고(TypeError: reading 'forEach') 간트가 통째로 사라진다.
 */
export function toGanttTree(tasks: MyTask[], today: Date): ITask[] {
  const present = new Set(tasks.map(t => t.id));
  const hasChildren = new Set(
    tasks.map(t => t.parentTaskId).filter((id): id is string => !!id && present.has(id))
  );
  return tasks.map(task => {
    const range = toGanttRange(task, today);
    const parent =
      task.parentTaskId && present.has(task.parentTaskId) ? task.parentTaskId : undefined;
    return {
      id: task.id,
      text: task.title,
      start: range.start,
      end: range.end,
      type: 'task',
      scheduled: range.scheduled,
      ...(parent ? { parent } : {}),
      // 하위를 가진 줄은 펼쳐 둔다. 간트는 기간을 보는 그림이라 하위 막대가 눈금에서
      // 빠지면 뜻이 없다 — 목록에서 접는 것과 반대인 이유다(목록은 글을 훑는 자리).
      ...(hasChildren.has(task.id) ? { open: true } : {}),
      // 막대 템플릿·왼쪽 목록이 쓴다
      task,
    };
  });
}
