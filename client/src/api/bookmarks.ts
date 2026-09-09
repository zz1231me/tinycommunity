// client/src/api/bookmarks.ts
import axios from './axios';
import { unwrap } from './utils';

export interface Bookmark {
  id: string;
  name: string;
  url: string;
  icon?: string | null;
  order: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const fetchBookmarks = async (signal?: AbortSignal): Promise<Bookmark[]> => {
  const res = await axios.get('/bookmarks', { signal });
  return unwrap(res);
};

export const fetchAllBookmarks = async (): Promise<Bookmark[]> => {
  const res = await axios.get('/bookmarks/all');
  return unwrap(res);
};

export const createBookmark = async (data: {
  name: string;
  url: string;
  icon?: string;
  order?: number;
}): Promise<Bookmark> => {
  const res = await axios.post('/bookmarks', data);
  return unwrap(res);
};

export const updateBookmark = async (id: string, data: Partial<Bookmark>): Promise<Bookmark> => {
  const res = await axios.put(`/bookmarks/${id}`, data);
  return unwrap(res);
};

export const deleteBookmark = async (id: string): Promise<void> => {
  await axios.delete(`/bookmarks/${id}`);
};

export const reorderBookmarks = async (
  bookmarks: { id: string; order: number }[]
): Promise<void> => {
  await axios.put('/bookmarks/reorder/batch', { bookmarks });
};
