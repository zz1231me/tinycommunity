import api from './axios';
import { unwrap } from './utils';
import { Memo, MemoColor } from '../types/memo.types';

export async function getMemos(): Promise<Memo[]> {
  const res = await api.get('/memos');
  return unwrap(res);
}

export async function createMemo(data: {
  title?: string;
  content?: string;
  color?: MemoColor;
}): Promise<Memo> {
  const res = await api.post('/memos', data);
  return unwrap(res);
}

export async function updateMemo(
  id: number,
  data: Partial<{
    title: string;
    content: string;
    color: MemoColor;
    isPinned: boolean;
    order: number;
  }>
): Promise<Memo> {
  const res = await api.put(`/memos/${id}`, data);
  return unwrap(res);
}

export async function deleteMemo(id: number): Promise<void> {
  await api.delete(`/memos/${id}`);
}
