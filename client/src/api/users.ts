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
