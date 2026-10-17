// 저장된 업무 필터. 지라의 saved filter 자리다.
//
// '긴급 + 이번 주 마감 + 품질 게시판' 같은 조건을 매번 다시 만들지 않게 이름을 붙여 둔다.
// 거르는 일 자체는 화면이 한다 — 서버는 조건을 그대로 맡아 두기만 하므로, 아는 값인지만 본다.

import { isTaskPriority, type TaskPriority } from './taskPriority';

/** 한 사람이 둘 수 있는 개수. 고르는 메뉴가 끝없이 길어지지 않게 한다. */
export const MAX_PRESETS = 20;
export const MAX_NAME_LENGTH = 50;
export const MAX_QUERY_LENGTH = 100;

/** 화면의 마감 요약 단추와 같은 값 */
export const DUE_FILTERS = ['overdue', 'today', 'week'] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];

/** 화면의 정렬과 같은 값 */
export const TASK_SORTS = ['stale', 'due', 'priority'] as const;
export type TaskSort = (typeof TASK_SORTS)[number];

export interface TaskFilterPresetInput {
  name: string;
  /** 보는 범위. '' 이면 내 업무, 아니면 그 게시판의 팀 보기 */
  scope: string;
  query: string;
  boardType: string;
  due: DueFilter | null;
  priority: TaskPriority | null;
  sort: TaskSort;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * 보낸 값을 아는 모양으로 깎는다. 이름이 비면 null — 이름은 고르는 메뉴에 쓰이므로 필수다.
 * 나머지는 모르는 값이면 '조건 없음' 으로 둔다. 조건 하나가 이상하다고 저장을 막으면
 * 화면에서 손쓸 길이 없다.
 */
export function sanitizePreset(body: unknown): TaskFilterPresetInput | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const raw = body as Record<string, unknown>;

  const name = text(raw.name, MAX_NAME_LENGTH);
  if (!name) return null;

  const due = DUE_FILTERS.includes(raw.due as DueFilter) ? (raw.due as DueFilter) : null;
  const sort = TASK_SORTS.includes(raw.sort as TaskSort) ? (raw.sort as TaskSort) : 'stale';

  return {
    name,
    scope: text(raw.scope, 100),
    query: text(raw.query, MAX_QUERY_LENGTH),
    boardType: text(raw.boardType, 100),
    due,
    priority: isTaskPriority(raw.priority) ? raw.priority : null,
    sort,
  };
}
