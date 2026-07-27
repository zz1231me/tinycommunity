// src/api/boards.ts
import api from './axios';
import { unwrap } from './utils';

// ✅ 사용자가 접근 가능한 게시판 목록 조회
export const fetchUserAccessibleBoards = () => {
  return api.get('/boards/accessible');
};

// ✅ 새로운: 사용자의 특정 게시판 접근 권한 확인 (일반 사용자용)
export const checkUserBoardAccess = (boardType: string) => {
  return api.get(`/boards/check/${boardType}`);
};

// ✅ 게시판 내 관리(담당자) — 관리 가능 여부 조회
export const checkBoardManageCapability = (boardType: string): Promise<{ canManage: boolean }> =>
  api.get(`/boards/${boardType}/can-manage`).then(unwrap);

// ✅ 게시판 기본정보(이름/설명) 수정 — 담당자/관리자
export const updateBoardInfo = (boardType: string, data: { name?: string; description?: string }) =>
  api.put(`/boards/${boardType}/info`, data).then(unwrap);
