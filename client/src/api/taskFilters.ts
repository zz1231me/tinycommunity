// 저장된 업무 필터. 자주 쓰는 조건에 이름을 붙여 계정에 둔다(지라의 saved filter).

import api from './axios';
import { unwrap } from './utils';
import type { TaskFilter, TaskSort } from '../components/tasks/taskViews';

export interface SavedTaskFilter extends TaskFilter {
  id: number;
  name: string;
  /** '' 이면 내 업무, 아니면 그 게시판의 팀 보기 */
  scope: string;
  sort: TaskSort;
}

export type SavedTaskFilterInput = Omit<SavedTaskFilter, 'id'>;

export async function fetchTaskFilters(signal?: AbortSignal): Promise<SavedTaskFilter[]> {
  const res = await api.get('/users/me/task-filters', { signal });
  return unwrap(res);
}

/** 같은 이름이 이미 있으면 그것을 덮어쓴다. */
export async function saveTaskFilter(input: SavedTaskFilterInput): Promise<SavedTaskFilter> {
  const res = await api.post('/users/me/task-filters', input);
  return unwrap(res);
}

export async function deleteTaskFilter(id: number): Promise<void> {
  await api.delete(`/users/me/task-filters/${id}`);
}
