// 한곳에서 보는 활동 피드. 읽을 수 있는 게시판의 새 글·새 댓글·업무 변경이 시간순으로 온다.

import api from './axios';
import { unwrap } from './utils';

export type ActivityKind = 'post' | 'comment' | 'task';
export type ActivityChange = 'status' | 'assignee' | 'schedule' | 'priority';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  at: string;
  actor: { id: string; name: string } | null;
  postId: string;
  postTitle: string;
  boardType: string;
  boardName: string;
  /** 업무 변경일 때 무엇이 바뀌었는지 */
  change?: ActivityChange;
  /** 바뀐 뒤 값(상태키·사용자 id). 이름 붙이기는 화면이 한다 */
  toValue?: string | null;
}

export async function fetchActivity(
  params: { limit?: number; before?: string } = {},
  signal?: AbortSignal
): Promise<ActivityItem[]> {
  const search = new URLSearchParams();
  if (params.limit) search.set('limit', String(params.limit));
  if (params.before) search.set('before', params.before);
  const query = search.toString();
  return unwrap(await api.get(`/activity${query ? `?${query}` : ''}`, { signal }));
}
