// 업무 칸반. 카드를 다른 열로 끌어 놓으면 그 상태로 바뀐다.
// 서버에 열 안의 순서가 없어 같은 열 안에서 순서를 바꾸지는 않는다.
// 끌기가 어려운 사람(휴대폰·키보드)은 카드의 ⋯ 메뉴로 같은 일을 한다.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { Lock, UserRound } from 'lucide-react';
import type { MyTask } from '../../api/tasks';
import { Tooltip } from '../common/Tooltip';
import { DueBadge } from './DueBadge';
import { TaskCardMenu } from './TaskCardMenu';
import { TaskTooltipContent } from './TaskTooltipContent';
import {
  groupByStatus,
  isKanbanStatus,
  KANBAN_COLUMNS,
  type KanbanStatus,
  type Schedule,
} from './taskViews';
import { useStatusLabel } from './useStatusLabel';
import { useToday } from '../../hooks/useToday';

interface Props {
  tasks: MyTask[];
  /** 완료한 일을 불러왔는지. 안 불러왔으면 완료 열이 비어 있는 이유를 적는다. */
  showDone: boolean;
  /** 팀 보기에서는 카드마다 담당자를 보여 준다 */
  showAssignee?: boolean;
  onMove: (task: MyTask, to: KanbanStatus) => void;
  onSchedule: (task: MyTask, schedule: Schedule) => void;
  onClearSchedule: (task: MyTask) => void;
}

/** 키보드로 들었을 때 방향키 한 번에 옆 열로 간다. 기본값(25px씩)은 열 하나 건너는 데 수십 번 눌러야 했다. */
const columnCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const step = ['ArrowRight', 'ArrowDown'].includes(event.code)
    ? 1
    : ['ArrowLeft', 'ArrowUp'].includes(event.code)
      ? -1
      : 0;
  if (step === 0) return undefined;
  event.preventDefault();

  const from = isKanbanStatus(context.over?.id)
    ? context.over.id
    : (context.active?.data.current?.status as KanbanStatus | undefined);
  if (!from) return undefined;
  const index = Math.min(
    KANBAN_COLUMNS.length - 1,
    Math.max(0, KANBAN_COLUMNS.indexOf(from) + step)
  );
  const rect = context.droppableRects.get(KANBAN_COLUMNS[index]);
  if (!rect) return undefined;
  return { x: rect.left + rect.width / 2, y: rect.top + 48 };
};

export function TaskKanban({
  tasks,
  showDone,
  showAssignee = false,
  onMove,
  onSchedule,
  onClearSchedule,
}: Props) {
  const [dragging, setDragging] = useState<MyTask | null>(null);
  const groups = groupByStatus(tasks);
  const statusLabel = useStatusLabel();
  const today = useToday();

  const sensors = useSensors(
    // 마우스는 조금 움직여야 끌기로 본다. 그냥 누르면 카드 제목 링크가 열린다.
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // 손가락은 잠깐 눌러야 끌린다. 바로 끌리면 화면을 넘기려다 카드가 딸려 간다.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnCoordinates })
  );

  const titleOf = (id: unknown) => tasks.find(t => t.id === id)?.title ?? '업무';
  const columnOf = (id: unknown) => (isKanbanStatus(id) ? statusLabel(id) : null);

  // 화면 낭독기 안내. 기본값은 영어이고 제목 대신 내부 id 를 읽는다.
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `'${titleOf(active.id)}' 를 들었습니다. 방향키로 열을 고르고 스페이스로 놓습니다.`,
    onDragOver: ({ active, over }) =>
      over
        ? `'${titleOf(active.id)}' 가 ${columnOf(over.id)} 열 위에 있습니다.`
        : `'${titleOf(active.id)}' 가 열 밖에 있습니다.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `'${titleOf(active.id)}' 를 ${columnOf(over.id)} 열에 놓았습니다.`
        : `'${titleOf(active.id)}' 를 제자리에 두었습니다.`,
    onDragCancel: ({ active }) => `'${titleOf(active.id)}' 옮기기를 취소했습니다.`,
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const task = tasks.find(t => t.id === event.active.id);
    const to = event.over?.id;
    if (!task || !isKanbanStatus(to) || task.workStatus === to) return;
    onMove(task, to);
  };

  return (
    <DndContext
      sensors={sensors}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            '스페이스나 엔터로 업무를 들고, 방향키로 다른 열을 고른 뒤 스페이스로 놓습니다. ESC 로 취소합니다.',
        },
      }}
      onDragStart={e => setDragging(tasks.find(t => t.id === e.active.id) ?? null)}
      onDragCancel={() => setDragging(null)}
      onDragEnd={handleDragEnd}
    >
      <div className="grid gap-4 md:grid-cols-3">
        {KANBAN_COLUMNS.map(status => (
          <Column
            key={status}
            status={status}
            label={statusLabel(status)}
            count={groups[status].length}
          >
            {groups[status].map(task => (
              <Card
                key={task.id}
                task={task}
                today={today}
                showAssignee={showAssignee}
                onMove={onMove}
                onSchedule={onSchedule}
                onClearSchedule={onClearSchedule}
              />
            ))}
            {status === 'done' && !showDone && (
              <li className="px-2 py-6 text-center text-xs text-slate-400">
                ‘완료한 일도 보기’ 를 켜면 완료한 일이 여기 보입니다.
                <br />
                끌어다 놓으면 완료로 바뀝니다.
              </li>
            )}
            {groups[status].length === 0 && (status !== 'done' || showDone) && (
              <li className="rounded-lg border border-dashed border-slate-200 px-2 py-6 text-center text-xs text-slate-400 dark:border-slate-700">
                여기로 끌어다 놓으세요
              </li>
            )}
          </Column>
        ))}
      </div>
      {/* 끌리는 모습은 덮개로 그린다. 원래 카드는 제자리에 남아 놓는 순간 링크가 눌리지 않는다. */}
      <DragOverlay>
        {dragging && <CardBody task={dragging} today={today} showAssignee={showAssignee} lifted />}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  label,
  count,
  children,
}: {
  status: KanbanStatus;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      data-status={status}
      className={`card flex min-h-[12rem] flex-col p-3 transition-colors ${
        isOver ? 'ring-2 ring-primary-400 dark:ring-primary-500' : ''
      }`}
    >
      <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
        <span className="text-xs font-normal tabular-nums text-slate-400">{count}</span>
      </h2>
      <ul className="flex flex-1 flex-col gap-2">{children}</ul>
    </section>
  );
}

interface CardProps {
  task: MyTask;
  today: Date;
  showAssignee: boolean;
  onMove: Props['onMove'];
  onSchedule: Props['onSchedule'];
  onClearSchedule: Props['onClearSchedule'];
}

function Card({ task, today, showAssignee, onMove, onSchedule, onClearSchedule }: CardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { status: task.workStatus },
    // 바꿀 권한이 없는 업무는 끌리지 않는다. 서버가 거절할 일을 미리 막는다.
    disabled: !task.canEdit,
    // 기본 role 은 button 인데 카드 안에 링크·메뉴 단추가 또 있어 낭독기가 겹쳐 읽는다.
    // 목록 항목으로 두고 '끌 수 있음' 은 역할 설명으로 알린다.
    attributes: {
      role: 'listitem',
      roleDescription: task.canEdit ? '끌어서 상태를 바꿀 수 있는 업무' : '업무',
    },
  });
  return (
    <li ref={setNodeRef} {...attributes} {...listeners} className={isDragging ? 'opacity-40' : ''}>
      <Tooltip content={<TaskTooltipContent task={task} />}>
        <CardBody
          task={task}
          today={today}
          showAssignee={showAssignee}
          menu={
            task.canEdit ? (
              <TaskCardMenu
                task={task}
                onMove={onMove}
                onSchedule={onSchedule}
                onClearSchedule={onClearSchedule}
              />
            ) : (
              <Lock
                className="h-3.5 w-3.5 flex-shrink-0 text-slate-300"
                aria-label="바꿀 권한 없음"
              />
            )
          }
        />
      </Tooltip>
    </li>
  );
}

function CardBody({
  task,
  today,
  showAssignee,
  menu,
  lifted = false,
}: {
  task: MyTask;
  today: Date;
  showAssignee: boolean;
  menu?: React.ReactNode;
  lifted?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 ${
        task.canEdit ? 'cursor-grab' : ''
      } ${lifted ? 'cursor-grabbing shadow-lg' : 'hover:border-slate-300 dark:hover:border-slate-600'}`}
    >
      <div className="flex items-start gap-2">
        <Link
          to={`/dashboard/posts/${task.boardType}/${task.id}`}
          className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 hover:underline dark:text-slate-100"
        >
          {task.title}
        </Link>
        {menu}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
        <DueBadge task={task} today={today} />
        <span className="min-w-0 flex-1 truncate">{task.boardName}</span>
        {showAssignee &&
          (task.assignee ? (
            <span
              className="flex flex-shrink-0 items-center gap-1"
              title={`담당 ${task.assignee.name}`}
            >
              {/* 아바타 색 블록은 카드마다 제목보다 먼저 눈에 들어와 이름만 작게 쓴다 */}
              <UserRound className="h-3 w-3" aria-hidden="true" />
              <span className="max-w-[5rem] truncate">{task.assignee.name}</span>
            </span>
          ) : (
            <span className="flex-shrink-0">담당 없음</span>
          ))}
      </div>
    </div>
  );
}
