// client/src/api/tasks.ts
// 담당자·업무 상태·일정, 팀 보기, 읽음 확인, 첨부 이전 버전.

import api from './axios';
import type { TaskPriority } from '../components/tasks/taskPriority';
import { unwrap } from './utils';

export type WorkStatus = 'none' | 'todo' | 'doing' | 'done';

export interface WorkStatusOption {
  key: WorkStatus;
  label: string;
  description: string;
}

export interface Assignee {
  id: string;
  name: string;
  avatar: string | null;
}

export interface TaskState {
  workStatus: WorkStatus;
  priority: TaskPriority;
  assignee: Assignee | null;
  /** YYYY-MM-DD. 정하지 않았으면 null */
  startDate: string | null;
  dueDate: string | null;
}

export interface MyTask {
  id: string;
  title: string;
  boardType: string;
  boardName: string;
  workStatus: WorkStatus;
  priority: TaskPriority;
  assignee: Assignee | null;
  /** 지금 사용자가 상태·일정을 바꿀 수 있는지. 서버의 권한 규칙과 같다. */
  canEdit: boolean;
  /** YYYY-MM-DD. 아직 일정을 잡지 않았으면 null */
  startDate: string | null;
  /** YYYY-MM-DD, 당일 포함 */
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReadReceipts {
  /** 읽어야 할 사람 수 (작성자 제외) */
  total: number;
  readCount: number;
  readers: Array<{ id: string; name: string; avatar: string | null; readAt: string }>;
  unread: Array<{ id: string; name: string; avatar: string | null }>;
}

export interface AttachmentVersionGroup {
  originalName: string;
  versions: Array<{
    filename: string;
    size: number;
    mimetype: string;
    uploadedBy: string | null;
    createdAt: string;
    url: string;
  }>;
}

export async function fetchWorkStatuses(signal?: AbortSignal): Promise<WorkStatusOption[]> {
  const res = await api.get('/posts/tasks/statuses', { signal });
  return unwrap(res);
}

export async function changeTask(
  boardType: string,
  postId: string,
  change: {
    assigneeId?: string | null;
    workStatus?: WorkStatus;
    priority?: TaskPriority;
    startDate?: string | null;
    dueDate?: string | null;
    /** 이 상태일 때만 바꾼다. 다르면 서버가 409 로 거절한다(되돌리기용). */
    ifWorkStatus?: WorkStatus;
  }
): Promise<TaskState> {
  const res = await api.patch(`/posts/${boardType}/${postId}/task`, change);
  return unwrap(res);
}

export async function fetchMyTasks(status?: WorkStatus[], signal?: AbortSignal): Promise<MyTask[]> {
  const query = status?.length ? `?status=${status.join(',')}` : '';
  const res = await api.get(`/posts/tasks/mine${query}`, { signal });
  return unwrap(res);
}

/** 한 게시판의 업무 전체(팀 보기) */
export async function fetchBoardTasks(
  boardType: string,
  status?: WorkStatus[],
  signal?: AbortSignal
): Promise<MyTask[]> {
  const query = status?.length ? `?status=${status.join(',')}` : '';
  const res = await api.get(`/posts/tasks/board/${boardType}${query}`, { signal });
  return unwrap(res);
}

export interface TaskBoard {
  id: string;
  name: string;
}

/** 팀 보기에서 고를 수 있는 업무용 게시판 */
export async function fetchTaskBoards(signal?: AbortSignal): Promise<TaskBoard[]> {
  const res = await api.get('/posts/tasks/boards', { signal });
  return unwrap(res);
}

export async function fetchReadReceipts(
  boardType: string,
  postId: string,
  signal?: AbortSignal
): Promise<ReadReceipts> {
  const res = await api.get(`/posts/${boardType}/${postId}/readers`, { signal });
  return unwrap(res);
}

export async function fetchAttachmentVersions(
  boardType: string,
  postId: string,
  signal?: AbortSignal
): Promise<AttachmentVersionGroup[]> {
  const res = await api.get(`/posts/${boardType}/${postId}/attachment-versions`, { signal });
  return unwrap(res);
}

/** 글에 일어난 일 한 줄 */
export interface ActivityEntry {
  id: string;
  kind: 'created' | 'edited' | 'attachment' | 'status' | 'assignee' | 'schedule' | 'priority';
  at: string;
  actor: { id: string; name: string } | null;
  /** 수정 줄에서 diff 를 열 때 쓴다 */
  revisionId?: number;
  fileName?: string;
  from?: { value: string | null; label: string | null };
  to?: { value: string | null; label: string | null };
}

export async function fetchActivity(
  boardType: string,
  postId: string,
  signal?: AbortSignal
): Promise<ActivityEntry[]> {
  const res = await api.get(`/posts/${boardType}/${postId}/activity`, { signal });
  return unwrap(res);
}
