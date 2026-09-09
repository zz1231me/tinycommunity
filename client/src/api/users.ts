import api from './axios';
import { unwrap } from './utils';

// 내 게시글
export const getMyPosts = (page = 1, limit = 10) =>
  api.get('/users/me/posts', { params: { page, limit } }).then(unwrap);

// 내 댓글
export const getMyComments = (page = 1, limit = 10) =>
  api.get('/users/me/comments', { params: { page, limit } }).then(unwrap);

// 접속 기록
export const getSecurityLogs = (page = 1, limit = 20) =>
  api.get('/users/me/security-logs', { params: { page, limit } }).then(unwrap);

export interface UserSuggestion {
  id: string;
  name: string;
}

/**
 * 사용자 검색 — 아이디·이름 부분 일치, 최대 10명.
 * boardType 을 주면 그 게시판을 볼 수 있는 사람만 준다(담당자 지정처럼 대상이 제한된 경우).
 */
export const searchUsers = (
  q: string,
  signal?: AbortSignal,
  boardType?: string
): Promise<UserSuggestion[]> =>
  api
    .get('/users/search', { params: { q, ...(boardType ? { boardType } : {}) }, signal })
    .then(unwrap);
