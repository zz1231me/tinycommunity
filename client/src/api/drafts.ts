// 작성 중인 글의 서버 임시저장.

import api from './axios';
import { unwrap } from './utils';

/** 목록용. 본문 대신 평문 미리보기만 온다. */
export interface DraftSummary {
  id: string;
  boardType: string;
  /** 게시판이 사라졌으면 null */
  boardName: string | null;
  title: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
}

export interface DraftDetail {
  id: string;
  boardType: string;
  title: string;
  content: string;
  updatedAt: string;
}

export interface DraftSaved {
  id: string;
  updatedAt: string;
}

export async function fetchDrafts(signal?: AbortSignal): Promise<DraftSummary[]> {
  const res = await api.get('/drafts', { signal });
  return unwrap(res);
}

export async function fetchDraft(id: string, signal?: AbortSignal): Promise<DraftDetail> {
  const res = await api.get(`/drafts/${id}`, { signal });
  return unwrap(res);
}

export async function createDraft(
  boardType: string,
  title: string,
  content: string
): Promise<DraftSaved> {
  const res = await api.post('/drafts', { boardType, title, content });
  return unwrap(res);
}

export async function updateDraft(id: string, title: string, content: string): Promise<DraftSaved> {
  const res = await api.put(`/drafts/${id}`, { title, content });
  return unwrap(res);
}

export async function deleteDraft(id: string): Promise<void> {
  await api.delete(`/drafts/${id}`);
}
