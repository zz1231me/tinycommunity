// 간트가 읽는 나무 모양 만들기.
//
// 하위 업무는 상위 아래로 들여 그린다. 목록이 이미 그렇게 보여 주므로, 간트에서만
// 나란히 서면 같은 자료가 화면마다 다른 모양이 된다.
//
// 테스트로 고정하는 것 둘:
//  1. `open` 을 자식 없는 줄에 주면 SVAR 가 없는 자식 목록을 훑다가 터진다
//     (TypeError: reading 'forEach'). 실제로 간트가 통째로 사라졌다.
//  2. 상위가 목록에 없을 수 있다(끝난 업무는 50개까지, 게시판 간트는 그 게시판 것만).
//     없는 부모를 가리키면 그 줄이 통째로 사라지므로 맨 윗단으로 돌린다.

import { describe, expect, it } from 'vitest';
import type { MyTask } from '../../api/tasks';
import { toGanttTree } from './ganttTree';

const today = new Date(2026, 9, 21);

const task = (over: Partial<MyTask> & { id: string }): MyTask => ({
  title: `일 ${over.id}`,
  boardType: 'qc',
  boardName: 'QC',
  workStatus: 'todo',
  priority: 'none',
  assignee: null,
  canEdit: true,
  startDate: null,
  dueDate: null,
  showOnCalendar: true,
  parentTaskId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const byId = (rows: ReturnType<typeof toGanttTree>) =>
  Object.fromEntries(rows.map(r => [r.id as string, r]));

describe('간트 나무 만들기', () => {
  it('하위는 상위를 가리킨다', () => {
    const rows = byId(
      toGanttTree([task({ id: 'parent' }), task({ id: 'child', parentTaskId: 'parent' })], today)
    );
    expect(rows.child.parent).toBe('parent');
    expect(rows.parent.parent).toBeUndefined();
  });

  // 이것이 간트를 통째로 날렸던 것이다.
  it('자식이 없는 줄에는 open 을 주지 않는다', () => {
    const rows = byId(toGanttTree([task({ id: 'alone' })], today));
    expect('open' in rows.alone).toBe(false);
  });

  it('자식을 가진 줄만 펼쳐 둔다', () => {
    const rows = byId(
      toGanttTree([task({ id: 'parent' }), task({ id: 'child', parentTaskId: 'parent' })], today)
    );
    expect(rows.parent.open).toBe(true);
    // 하위 자신은 잎이므로 주지 않는다
    expect('open' in rows.child).toBe(false);
  });

  it('상위가 목록에 없으면 맨 윗단으로 올린다 — 줄이 사라지지 않게', () => {
    const rows = toGanttTree([task({ id: 'orphan', parentTaskId: '목록에-없는-상위' })], today);
    expect(rows).toHaveLength(1);
    expect(rows[0].parent).toBeUndefined();
    expect('open' in rows[0]).toBe(false);
  });

  it('줄 수는 그대로다 — 묶는다고 줄이 사라지지 않는다', () => {
    const rows = toGanttTree(
      [
        task({ id: 'a' }),
        task({ id: 'b', parentTaskId: 'a' }),
        task({ id: 'c', parentTaskId: 'a' }),
        task({ id: 'd' }),
      ],
      today
    );
    expect(rows).toHaveLength(4);
    expect(rows.filter(r => r.parent === 'a')).toHaveLength(2);
  });

  it('업무 원본을 함께 실어 준다 — 막대·왼쪽 목록이 쓴다', () => {
    const rows = toGanttTree([task({ id: 'x', title: '제목' })], today);
    expect((rows[0].task as MyTask).title).toBe('제목');
    expect(rows[0].text).toBe('제목');
  });
});
