// 게시판 관련 타입 정의

import type { WorkStatus } from '../api/tasks';

export type Post = {
  id: string;
  title: string;
  content?: string;
  createdAt: string;
  updatedAt?: string;
  author: string;
  commentCount: number;
  viewCount?: number;
  likeCount?: number;
  isSecret?: boolean;
  secretType?: 'password' | 'users' | null;
  user?: {
    id: string;
    name: string;
    avatar?: string | null;
  };
  isPinned?: boolean;
  /** 상단 고정 만료 시각. 고정 중이면서 null 이면 무기한 고정이다 */
  pinnedUntil?: string | null;
  isRead?: boolean;
  attachmentCount?: number; // 첨부파일 개수(0/undefined면 없음)
  /** 목록 미리보기용 첫 이미지 첨부의 저장 파일명. 실제 접근은 썸네일 라우트가 다시 인가한다 */
  thumbnailName?: string | null;
  tags?: Tag[];
  /** 업무 상태 — 업무로 추적하지 않는 글은 'none' */
  workStatus?: WorkStatus;
  /** 담당자. 목록·상세 모두 같은 모양으로 내려온다 */
  assignee?: { id: string; name: string; avatar?: string | null } | null;
};

export type BoardInfo = {
  id: string;
  name: string;
  description: string;
  isPersonal?: boolean; // ✅ 개인 폴더 여부
  /** 업무용 게시판 — 담당자·업무 상태를 쓴다 */
  taskEnabled?: boolean;
  ownerId?: string; // ✅ 개인 폴더 소유자
  order?: number;
  permissions?: {
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
  };
};

export type PaginationInfo = {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

export type Tag = {
  id: number;
  name: string;
  color: string;
  description?: string;
  boardId?: string | null;
};
