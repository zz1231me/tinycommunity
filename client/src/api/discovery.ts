// client/src/api/discovery.ts
// 탐색(인기글·관련 글·태그 클라우드·태그별 글)과 참여(스크랩) API.

import api from './axios';
import { unwrap } from './utils';
import type { PaginationInfo, Tag } from '../types/board.types';

export type PopularPeriod = 'week' | 'month' | 'all';

/** 탐색 화면의 글 한 줄 — 게시판을 가로지르므로 게시판 이름을 함께 받는다 */
export interface DiscoveryPost {
  id: string;
  title: string;
  boardType: string;
  boardName: string;
  author: string;
  authorAvatar: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  createdAt: string;
}

export interface ScrapPost extends Omit<DiscoveryPost, 'likeCount'> {
  scrappedAt: string;
}

export interface Paged<T> {
  posts: T[];
  pagination: PaginationInfo;
}

export interface CloudTag extends Tag {
  postCount: number;
}

export async function fetchPopularPosts(
  period: PopularPeriod,
  signal?: AbortSignal
): Promise<DiscoveryPost[]> {
  const res = await api.get(`/posts/popular?period=${period}`, { signal });
  return unwrap<{ period: PopularPeriod; posts: DiscoveryPost[] }>(res).posts;
}

export async function fetchRelatedPosts(
  boardType: string,
  postId: string,
  signal?: AbortSignal
): Promise<DiscoveryPost[]> {
  const res = await api.get(`/posts/${boardType}/${postId}/related`, { signal });
  return unwrap(res);
}

export async function fetchTagCloud(signal?: AbortSignal): Promise<CloudTag[]> {
  const res = await api.get('/tags/cloud', { signal });
  return unwrap(res);
}

export async function fetchPostsByTag(
  tagId: number,
  page = 1,
  signal?: AbortSignal
): Promise<Paged<DiscoveryPost>> {
  const res = await api.get(`/tags/${tagId}/posts?page=${page}`, { signal });
  return unwrap(res);
}

export async function toggleScrap(boardType: string, postId: string): Promise<boolean> {
  const res = await api.post(`/posts/${boardType}/${postId}/scrap`);
  return unwrap<{ scrapped: boolean }>(res).scrapped;
}

export async function fetchMyScraps(page = 1, signal?: AbortSignal): Promise<Paged<ScrapPost>> {
  const res = await api.get(`/posts/scraps/mine?page=${page}`, { signal });
  return unwrap(res);
}
