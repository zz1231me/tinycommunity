// 본인의 보기 설정. 권한이 아니라 취향이라 서버는 아는 키·값만 받아 저장한다.

import api from './axios';
import { unwrap } from './utils';

export interface UiPrefs {
  taskView?: 'list' | 'kanban' | 'gantt';
  taskSort?: 'stale' | 'due' | 'priority';
  taskShowDone?: boolean;
  taskGanttZoom?: 'day' | 'week' | 'month';
}

export async function fetchUiPrefs(signal?: AbortSignal): Promise<UiPrefs> {
  const res = await api.get('/users/me/ui-prefs', { signal });
  return unwrap(res);
}

/** 보낸 키만 덮어쓴다. 돌려받은 값이 저장된 전체다. */
export async function saveUiPrefs(patch: UiPrefs): Promise<UiPrefs> {
  const res = await api.patch('/users/me/ui-prefs', patch);
  return unwrap(res);
}
