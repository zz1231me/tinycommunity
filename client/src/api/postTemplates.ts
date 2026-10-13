// 글 템플릿. 관리자가 만들어 둔 틀을 글쓰기에서 골라 제목·본문을 미리 채운다.

import api from './axios';
import { unwrap } from './utils';

export interface PostTemplate {
  id: number;
  name: string;
  description: string | null;
  boardType: string | null;
  title: string | null;
  content: string;
}

/** 지금 쓰려는 게시판에서 고를 수 있는 것. 게시판을 주면 그 게시판 것 + 공통. */
export async function fetchPostTemplates(
  boardType?: string,
  signal?: AbortSignal
): Promise<PostTemplate[]> {
  const query = boardType ? `?boardType=${encodeURIComponent(boardType)}` : '';
  const res = await api.get(`/post-templates${query}`, { signal });
  return unwrap(res);
}

/** 관리자 화면용 — 꺼 둔 것까지 모두 */
export interface AdminPostTemplate extends PostTemplate {
  order: number;
  isActive: boolean;
}

export async function fetchAdminPostTemplates(signal?: AbortSignal): Promise<AdminPostTemplate[]> {
  const res = await api.get('/admin/post-templates', { signal });
  return unwrap(res);
}

export type TemplateInput = {
  name: string;
  description?: string | null;
  boardType?: string | null;
  title?: string | null;
  content: string;
  order?: number;
  isActive?: boolean;
};

export async function createPostTemplate(input: TemplateInput): Promise<AdminPostTemplate> {
  const res = await api.post('/admin/post-templates', input);
  return unwrap(res);
}

export async function updatePostTemplate(
  id: number,
  input: TemplateInput
): Promise<AdminPostTemplate> {
  const res = await api.put(`/admin/post-templates/${id}`, input);
  return unwrap(res);
}

export async function deletePostTemplate(id: number): Promise<void> {
  await api.delete(`/admin/post-templates/${id}`);
}
