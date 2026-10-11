// 업무를 칸반 열·간트 막대·마감 표시로 옮기는 계산. 화면과 떼어 두어 따로 시험한다.

import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns';
import type { MyTask, WorkStatus } from '../../api/tasks';

/** 칸반에 그리는 상태. 'none' 은 업무로 추적하지 않는 글이라 열을 두지 않는다. */
export type KanbanStatus = Exclude<WorkStatus, 'none'>;
export const KANBAN_COLUMNS: KanbanStatus[] = ['todo', 'doing', 'done'];

export function isKanbanStatus(value: unknown): value is KanbanStatus {
  return KANBAN_COLUMNS.includes(value as KanbanStatus);
}

export function groupByStatus(tasks: MyTask[]): Record<KanbanStatus, MyTask[]> {
  const groups: Record<KanbanStatus, MyTask[]> = { todo: [], doing: [], done: [] };
  for (const task of tasks) {
    // 서버가 'none' 을 주지는 않지만, 와도 어느 열에도 넣지 않는다
    if (isKanbanStatus(task.workStatus)) groups[task.workStatus].push(task);
  }
  return groups;
}

/** '2026-10-01 ~ 2026-10-03', 하루면 날짜 하나, 없으면 '일정 미정' */
export function formatSchedule(startDate: string | null, dueDate: string | null): string {
  if (!startDate && !dueDate) return '일정 미정';
  if (startDate && dueDate && startDate !== dueDate) return `${startDate} ~ ${dueDate}`;
  if (startDate && !dueDate) return `${startDate} 시작`;
  return dueDate as string;
}

export interface Schedule {
  startDate: string | null;
  dueDate: string | null;
}

// ── 마감 ────────────────────────────────────────────────────────────────

export type DueTone = 'overdue' | 'today' | 'soon' | 'later';

export interface DueInfo {
  tone: DueTone;
  /** 'D-3', 'D-day', '2일 지남' */
  label: string;
  /** 마감까지 남은 날. 지났으면 음수 */
  days: number;
}

/** 이 날 수 안이면 '곧' 으로 칠한다 */
const SOON_DAYS = 3;

/** 마감 표시. 마감이 없거나 이미 끝낸 일은 null — 끝낸 일에 '지남' 을 붙이면 경고가 묻힌다. */
export function dueInfo(task: Pick<MyTask, 'dueDate' | 'workStatus'>, today: Date): DueInfo | null {
  if (!task.dueDate || task.workStatus === 'done') return null;
  const days = differenceInCalendarDays(parseISO(task.dueDate), today);
  if (days < 0) return { tone: 'overdue', label: `${-days}일 지남`, days };
  if (days === 0) return { tone: 'today', label: 'D-day', days };
  return { tone: days <= SOON_DAYS ? 'soon' : 'later', label: `D-${days}`, days };
}

export type DueFilter = 'overdue' | 'today' | 'week';

export const DUE_FILTERS: { key: DueFilter; label: string }[] = [
  { key: 'overdue', label: '마감 지남' },
  { key: 'today', label: '오늘 마감' },
  { key: 'week', label: '7일 안' },
];

export function matchesDue(task: MyTask, filter: DueFilter, today: Date): boolean {
  const info = dueInfo(task, today);
  if (!info) return false;
  if (filter === 'overdue') return info.days < 0;
  if (filter === 'today') return info.days === 0;
  // 오늘부터 일주일. 지난 것은 따로 세므로 넣지 않는다.
  return info.days >= 0 && info.days < 7;
}

export function countDue(tasks: MyTask[], today: Date): Record<DueFilter, number> {
  const counts: Record<DueFilter, number> = { overdue: 0, today: 0, week: 0 };
  for (const task of tasks) {
    for (const { key } of DUE_FILTERS) if (matchesDue(task, key, today)) counts[key] += 1;
  }
  return counts;
}

// ── 거르기·정렬 ──────────────────────────────────────────────────────────

export interface TaskFilter {
  /** 제목에 들어 있는 글자. 대소문자는 가리지 않는다. */
  query: string;
  /** 게시판 하나로 좁힌다. 빈 문자열이면 전체. */
  boardType: string;
  due: DueFilter | null;
}

export function filterTasks(tasks: MyTask[], filter: TaskFilter, today: Date): MyTask[] {
  const q = filter.query.trim().toLowerCase();
  return tasks.filter(
    t =>
      (!q || t.title.toLowerCase().includes(q)) &&
      (!filter.boardType || t.boardType === filter.boardType) &&
      (!filter.due || matchesDue(t, filter.due, today))
  );
}

export type TaskSort = 'stale' | 'due';

export const TASK_SORTS: { key: TaskSort; label: string }[] = [
  { key: 'stale', label: '오래 방치된 순' },
  { key: 'due', label: '마감 빠른 순' },
];

/** 'stale' 은 서버 순서(오래 손대지 않은 것부터) 그대로. 'due' 는 마감 없는 일을 맨 뒤로. */
export function sortTasks(tasks: MyTask[], sort: TaskSort): MyTask[] {
  if (sort === 'stale') return tasks;
  return [...tasks].sort((a, b) => {
    if (a.dueDate === b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  });
}

// ── 간트 ────────────────────────────────────────────────────────────────

export interface GanttRange {
  start: Date;
  /** 간트는 끝을 '다음 날 0시' 로 센다. 마감일 당일까지 칠하려면 하루 뒤다. */
  end: Date;
  /** 일정이 저장돼 있는가. 없으면 오늘 하루짜리로 임시로 그린다. */
  scheduled: boolean;
}

/** 저장된 일정을 막대로. 한쪽만 있으면 그날 하루로 본다. */
export function toGanttRange(task: Pick<MyTask, 'startDate' | 'dueDate'>, today: Date): GanttRange {
  const first = task.startDate ?? task.dueDate;
  const last = task.dueDate ?? task.startDate;
  if (!first || !last) {
    const day = startOfDay(today);
    return { start: day, end: addDays(day, 1), scheduled: false };
  }
  // parseISO 는 날짜만 있는 문자열을 현지 0시로 읽는다. new Date() 는 UTC 로 읽어 하루 밀린다.
  return { start: parseISO(first), end: addDays(parseISO(last), 1), scheduled: true };
}

/** 끌어 놓은 막대를 저장할 날짜로. toGanttRange 의 반대. */
export function fromGanttRange(start: Date, end: Date): { startDate: string; dueDate: string } {
  const first = startOfDay(start);
  // 끝이 시작과 같은 날로 줄어들어도 하루는 남긴다
  const last = addDays(startOfDay(end), -1);
  return {
    startDate: format(first, 'yyyy-MM-dd'),
    dueDate: format(last < first ? first : last, 'yyyy-MM-dd'),
  };
}
