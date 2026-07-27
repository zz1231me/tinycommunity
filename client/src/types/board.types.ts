// 게시판 관련 타입 정의

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
  isRead?: boolean;
  tags?: Tag[];
};

export type BoardInfo = {
  id: string;
  name: string;
  description: string;
  isPersonal?: boolean; // ✅ 개인 폴더 여부
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
