// 칸반이 업무를 상태별 열에 나눠 그리고, 끌기 말고도 ⋯ 메뉴로 상태·일정을 바꿀 수 있는지.
// 끌어 놓기 자체는 happy-dom 에 배치가 없어 여기서 재지 않고 브라우저에서 확인한다.
// 놓은 뒤의 처리(저장·되돌리기)는 MyTasks.test 가 본다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MyTask } from '../../api/tasks';
import { renderWithQuery } from '../../test/renderWithQuery';
import { TaskKanban } from './TaskKanban';

const fetchWorkStatuses = vi.hoisted(() => vi.fn());
vi.mock('../../api/tasks', async () => {
  const actual = await vi.importActual<typeof import('../../api/tasks')>('../../api/tasks');
  return { ...actual, fetchWorkStatuses };
});

const task = (
  id: string,
  workStatus: MyTask['workStatus'],
  over: Partial<MyTask> = {}
): MyTask => ({
  id,
  title: `업무 ${id}`,
  boardType: 'qc',
  boardName: 'QC',
  workStatus,
  priority: 'none',
  assignee: null,
  canEdit: true,
  startDate: null,
  dueDate: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

function setup(
  tasks: MyTask[],
  props: { showDone?: boolean; showAssignee?: boolean; showBoard?: boolean } = {}
) {
  const handlers = { onMove: vi.fn(), onSchedule: vi.fn(), onClearSchedule: vi.fn() };
  renderWithQuery(
    <MemoryRouter>
      <TaskKanban
        tasks={tasks}
        showDone={props.showDone ?? true}
        showAssignee={props.showAssignee}
        showBoard={props.showBoard}
        {...handlers}
      />
    </MemoryRouter>
  );
  return handlers;
}

const column = (name: string) => screen.getByRole('region', { name });

describe('TaskKanban', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchWorkStatuses.mockResolvedValue([]);
  });

  it('할 일·진행 중·완료 열에 나눠 그린다', () => {
    setup([task('a', 'todo'), task('b', 'doing'), task('c', 'done')]);
    expect(within(column('할 일')).getByText('업무 a')).toBeInTheDocument();
    expect(within(column('진행 중')).getByText('업무 b')).toBeInTheDocument();
    expect(within(column('완료')).getByText('업무 c')).toBeInTheDocument();
  });

  it('열 이름은 관리자가 바꾼 상태 이름을 따른다', async () => {
    fetchWorkStatuses.mockResolvedValue([{ key: 'doing', label: '작업 중', description: '' }]);
    setup([task('b', 'doing')]);
    expect(await screen.findByRole('region', { name: '작업 중' })).toBeInTheDocument();
  });

  it('카드 제목은 글로 가는 링크이고, 마감까지 남은 날을 함께 적는다', () => {
    const inThree = new Date();
    inThree.setDate(inThree.getDate() + 3);
    const due = `${inThree.getFullYear()}-${String(inThree.getMonth() + 1).padStart(2, '0')}-${String(inThree.getDate()).padStart(2, '0')}`;
    setup([task('b', 'doing', { dueDate: due })]);
    expect(screen.getByRole('link', { name: '업무 b' })).toHaveAttribute(
      'href',
      '/dashboard/posts/qc/b'
    );
    expect(screen.getByText('D-3')).toBeInTheDocument();
  });

  it('완료한 일을 불러오지 않았으면 완료 열이 빈 이유를 적는다', () => {
    setup([task('a', 'todo')], { showDone: false });
    expect(screen.getByText(/완료한 일도 보기/)).toBeInTheDocument();
  });

  it('빈 열에는 놓을 자리임을 알린다', () => {
    setup([task('a', 'todo')]);
    expect(within(column('진행 중')).getByText('여기로 끌어다 놓으세요')).toBeInTheDocument();
  });

  it('팀 보기에서는 담당자를 카드에 보여 준다', () => {
    setup(
      [
        task('a', 'todo', { assignee: { id: 'u1', name: '김담당', avatar: null } }),
        task('b', 'todo'),
      ],
      { showAssignee: true }
    );
    expect(screen.getByText('김담당')).toBeInTheDocument();
    expect(screen.getByText('담당 없음')).toBeInTheDocument();
  });

  it('바꿀 권한이 없는 카드에는 메뉴 대신 자물쇠를 둔다', () => {
    setup([task('a', 'todo', { canEdit: false }), task('b', 'todo')]);
    expect(screen.getByLabelText('바꿀 권한 없음')).toBeInTheDocument();
    expect(screen.queryByLabelText("'업무 a' 상태·일정 바꾸기")).not.toBeInTheDocument();
    expect(screen.getByLabelText("'업무 b' 상태·일정 바꾸기")).toBeInTheDocument();
  });
});

describe('카드 메뉴', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchWorkStatuses.mockResolvedValue([]);
  });

  const open = async (title: string) => {
    await act(async () => fireEvent.click(screen.getByLabelText(`'${title}' 상태·일정 바꾸기`)));
    return screen.getByLabelText(`'${title}' 상태·일정`);
  };

  it('끌지 않고 상태를 바꾼다', async () => {
    const { onMove } = setup([task('a', 'todo')]);
    const menu = await open('업무 a');
    await act(async () => fireEvent.click(within(menu).getByRole('button', { name: '진행 중' })));
    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'doing');
  });

  it('지금 상태를 다시 눌러도 저장하지 않는다', async () => {
    const { onMove } = setup([task('a', 'todo')]);
    const menu = await open('업무 a');
    await act(async () => fireEvent.click(within(menu).getByRole('button', { name: '할 일' })));
    expect(onMove).not.toHaveBeenCalled();
  });

  it('달력에서 기간을 고르고 적용하면 두 날짜만 넘긴다 — 상태가 저장 요청에 실리지 않게', async () => {
    const { onSchedule } = setup([
      task('a', 'todo', { startDate: '2026-10-10', dueDate: '2026-10-12' }),
    ]);
    const menu = await open('업무 a');
    fireEvent.click(within(menu).getByRole('button', { name: '2026년 10월 14일 수요일' }));
    fireEvent.click(within(menu).getByRole('button', { name: '2026년 10월 16일 금요일' }));
    expect(onSchedule).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(within(menu).getByRole('button', { name: '적용' })));
    expect(onSchedule).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), {
      startDate: '2026-10-14',
      dueDate: '2026-10-16',
    });
    // 적용하면 메뉴가 닫힌다
    expect(screen.queryByLabelText("'업무 a' 상태·일정")).not.toBeInTheDocument();
  });

  it('일정이 있을 때만 지우기를 보여 준다', async () => {
    const { onClearSchedule } = setup([
      task('a', 'todo', { dueDate: '2026-10-12' }),
      task('b', 'todo'),
    ]);
    const menu = await open('업무 a');
    await act(async () => fireEvent.click(within(menu).getByText('일정 지우기')));
    expect(onClearSchedule).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));

    const other = await open('업무 b');
    expect(within(other).queryByText('일정 지우기')).not.toBeInTheDocument();
  });

  it('메뉴 안을 누른 채 움직여도 카드가 끌려 나가지 않는다', async () => {
    setup([task('a', 'todo', { dueDate: '2026-10-12' })]);
    const menu = await open('업무 a');
    const input = within(menu).getByRole('button', { name: '2026년 10월 14일 수요일' });
    // 포털 안의 이벤트도 React 트리를 따라 카드까지 올라간다. 막지 않으면 여기서 끌기가 시작된다.
    fireEvent.mouseDown(input, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(document, { clientX: 60, clientY: 60 });
    expect(screen.queryByText(/를 들었습니다/)).not.toBeInTheDocument();
    fireEvent.mouseUp(document);
  });

  it('카드 자체를 누른 채 움직이면 끌린다 — 위 검사의 대조군', async () => {
    setup([task('a', 'todo')]);
    const card = screen.getByText('업무 a').closest('li') as HTMLElement;
    await act(async () => {
      fireEvent.mouseDown(card, { button: 0, clientX: 10, clientY: 10 });
      fireEvent.mouseMove(document, { clientX: 60, clientY: 60 });
    });
    expect(await screen.findByText(/를 들었습니다/)).toBeInTheDocument();
    fireEvent.mouseUp(document);
  });
});

describe('게시판 이름', () => {
  it('여러 게시판을 함께 볼 때는 카드에 적는다', () => {
    setup([task('1', 'todo')]);
    expect(screen.getByText('QC')).toBeInTheDocument();
  });

  it('한 게시판만 보는 자리에서는 적지 않는다 — 카드마다 같은 이름이 반복될 뿐이다', () => {
    setup([task('1', 'todo')], { showBoard: false });
    expect(screen.queryByText('QC')).toBeNull();
    // 업무 자체는 그대로 보인다
    expect(screen.getByText('업무 1')).toBeInTheDocument();
  });
});
