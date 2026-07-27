import api from './axios';
import { unwrap } from './utils';
import { WikiPage, WikiRevision } from '../types/wiki.types';

export async function getWikiPageTree(): Promise<WikiPage[]> {
  const res = await api.get('/wiki');
  return unwrap(res);
}

export async function getWikiPageBySlug(slug: string): Promise<WikiPage> {
  const res = await api.get(`/wiki/${slug}`);
  return unwrap(res);
}

export async function createWikiPage(data: {
  slug: string;
  title: string;
  content?: string;
  parentId?: number | null;
  isPublished?: boolean;
}): Promise<WikiPage> {
  const res = await api.post('/wiki', data);
  return unwrap(res);
}

export async function updateWikiPage(
  slug: string,
  data: Partial<{
    title: string;
    content: string;
    parentId: number | null;
    isPublished: boolean;
    order: number;
  }>
): Promise<WikiPage> {
  const res = await api.put(`/wiki/${slug}`, data);
  return unwrap(res);
}

export async function deleteWikiPage(slug: string): Promise<void> {
  await api.delete(`/wiki/${slug}`);
}

export async function getWikiPageHistory(slug: string): Promise<WikiRevision[]> {
  const res = await api.get(`/wiki/${slug}/history`);
  return unwrap(res);
}

export async function getWikiEditPermissions(): Promise<{ roles: string[] }> {
  const res = await api.get('/wiki/permissions');
  return unwrap(res);
}
