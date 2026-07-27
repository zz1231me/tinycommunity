import api from './axios';
import { unwrap } from './utils';
import { Tag } from '../types/board.types';

export async function getTags(boardId?: string | null, signal?: AbortSignal): Promise<Tag[]> {
  const params = new URLSearchParams();
  if (boardId !== null && boardId !== undefined) {
    params.append('boardId', boardId);
  }
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await api.get(`/tags${query}`, { signal });
  return unwrap(res);
}

export async function createTag(data: {
  name: string;
  color?: string;
  description?: string;
  boardId?: string | null;
}): Promise<Tag> {
  const res = await api.post('/tags', data);
  return unwrap(res);
}

export async function updateTag(
  id: number,
  data: Partial<{ name: string; color: string; description: string }>
): Promise<Tag> {
  const res = await api.put(`/tags/${id}`, data);
  return unwrap(res);
}

export async function deleteTag(id: number): Promise<void> {
  await api.delete(`/tags/${id}`);
}

export async function getPostTags(boardType: string, postId: string): Promise<Tag[]> {
  const res = await api.get(`/posts/${boardType}/${postId}/tags`);
  return unwrap(res);
}

export async function savePostTags(
  boardType: string,
  postId: string,
  tagIds: number[]
): Promise<void> {
  await api.post(`/posts/${boardType}/${postId}/tags`, { tagIds });
}
