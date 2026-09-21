import axios from './axios';
import { unwrap } from './utils';
import type { WorkStatus } from './tasks';

// 접근 가능한 게시판들의 최신 게시글(헤더 드롭다운)
export interface RecentPost {
  id: string;
  title: string;
  boardType: string;
  boardName: string;
  authorName: string;
  isSecret: boolean;
  isRead: boolean; // 열람 여부. 안 읽은 글 강조와 카운트에 쓴다.
  createdAt: string;
}
export const fetchRecentPosts = (): Promise<RecentPost[]> =>
  axios.get('/posts/recent').then(unwrap);

type PostPayload = {
  title: string;
  content: string;
  boardType: string;
  files?: File[];
  isSecret?: boolean;
  secretType?: 'password' | 'users';
  secretPassword?: string;
  secretUserIds?: string[];
  isEncrypted?: boolean;
  secretSalt?: string;
};

export interface PostListResponse {
  posts: Array<{
    id: string;
    title: string;
    author: string;
    createdAt: string;
    UserId: string;
    viewCount?: number;
    commentCount: number;
    likeCount?: number;
    isSecret?: boolean;
    secretType?: 'password' | 'users' | null;
    isPinned?: boolean;
    isRead?: boolean;
    attachmentCount?: number; // 첨부파일 개수(0이면 없음)
    tags?: Array<{ id: number; name: string; color: string }>;
  }>;
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    limit: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface FetchPostsOptions {
  page?: number;
  limit?: number;
  search?: string;
  tags?: number[];
  /** 업무 상태 필터. 비우면 상태와 무관하게 전부 */
  workStatus?: WorkStatus[];
}

// 게시글 목록 조회
export async function fetchPostsByType(
  boardType: string,
  options: FetchPostsOptions = {},
  signal?: AbortSignal
): Promise<PostListResponse> {
  const { page = 1, limit = 10, search = '', tags, workStatus } = options;

  const params = new URLSearchParams();
  params.append('page', page.toString());
  params.append('limit', limit.toString());
  if (search.trim()) {
    params.append('search', search.trim());
  }
  if (tags && tags.length > 0) {
    params.append('tags', tags.join(','));
  }
  if (workStatus && workStatus.length > 0) {
    params.append('workStatus', workStatus.join(','));
  }

  const res = await axios.get(`/posts/${boardType}?${params.toString()}`, { signal });

  // sendSuccess 응답 구조는 { success, data: { posts, pagination } }
  if (!res.data.success || !res.data.data) {
    throw new Error('잘못된 API 응답 구조');
  }

  const responseData = res.data.data;

  if (!responseData.posts || !responseData.pagination) {
    throw new Error('응답에 posts 또는 pagination이 없습니다');
  }

  return responseData;
}

// 게시글 단건 조회. 비밀글 잠금 상태를 포함한다.
export async function fetchPostById(boardType: string, postId: string) {
  const res = await axios.get(`/posts/${boardType}/${postId}`);

  if (!res.data.success || !res.data.data) {
    throw new Error('잘못된 API 응답 구조');
  }

  const postData = res.data.data;

  // 잠긴 비밀글은 content 가 없어도 정상 응답이다
  if (postData.isLocked) {
    return postData;
  }

  if (!postData.title || !postData.content) {
    throw new Error('게시글 제목 또는 내용이 없습니다');
  }

  return postData;
}

// 일반 비밀글용 비밀번호 검증. E2EE 글에는 쓰지 않는다.
export async function verifySecretPost(boardType: string, postId: string, password: string) {
  const res = await axios.post(`/posts/${boardType}/${postId}/verify`, { password });
  if (!res.data.success || !res.data.data) throw new Error('잘못된 응답 구조');
  return res.data.data;
}

// 좋아요 토글
export async function toggleLike(boardType: string, postId: string) {
  const res = await axios.post(`/posts/${boardType}/${postId}/like`);
  return unwrap(res);
}

// 게시글 생성
export async function createPost({
  title,
  content,
  boardType,
  files,
  isSecret,
  secretType,
  secretPassword,
  secretUserIds,
  isEncrypted,
  secretSalt,
}: PostPayload) {
  const formData = new FormData();
  formData.append('title', title);
  formData.append('content', content);
  formData.append('boardType', boardType);

  if (isSecret) {
    formData.append('isSecret', 'true');
    if (secretType) formData.append('secretType', secretType);
    if (secretType === 'password' && secretPassword)
      formData.append('secretPassword', secretPassword);
    if (secretType === 'users' && secretUserIds)
      formData.append('secretUserIds', JSON.stringify(secretUserIds));
    if (isEncrypted) {
      formData.append('isEncrypted', 'true');
      if (secretSalt) formData.append('secretSalt', secretSalt);
    }
  }

  // 한글 파일명이 깨지지 않도록 원본 이름을 JSON 으로 따로 보낸다
  if (files && files.length > 0) {
    const originalNames = files.map(file => file.name);
    formData.append('originalFilenames', JSON.stringify(originalNames));

    files.forEach(file => {
      formData.append('files', file);
    });
  }

  const res = await axios.post(`/posts/${boardType}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      Accept: 'application/json',
    },
  });

  return unwrap(res);
}

// 게시글 수정
export async function updatePost(
  boardType: string,
  postId: string,
  {
    title,
    content,
    files,
    keepExistingFiles = false,
    deletedFileNames,
    isSecret,
    secretType,
    secretPassword,
    secretUserIds,
    isEncrypted,
    secretSalt,
    targetBoardType,
  }: Omit<PostPayload, 'boardType'> & {
    keepExistingFiles?: boolean;
    deletedFileNames?: string[];
    /** 게시판 이동 대상 (현재와 다르면 이동) */
    targetBoardType?: string;
  }
) {
  const formData = new FormData();
  formData.append('title', title);
  formData.append('content', content);
  formData.append('keepExistingFiles', keepExistingFiles.toString());
  // 게시판 이동은 현재와 다를 때만 보낸다
  if (targetBoardType && targetBoardType !== boardType) {
    formData.append('targetBoardType', targetBoardType);
  }
  formData.append('isSecret', isSecret ? 'true' : 'false');
  if (isSecret && secretType) formData.append('secretType', secretType);
  if (isSecret && secretType === 'password' && secretPassword)
    formData.append('secretPassword', secretPassword);
  if (isSecret && secretType === 'users' && secretUserIds)
    formData.append('secretUserIds', JSON.stringify(secretUserIds));
  if (isSecret) {
    // isEncrypted 는 항상 명시적으로 보낸다. 빠지면 서버가 false 로 처리해 E2EE 표시가 사라진다.
    formData.append('isEncrypted', isEncrypted ? 'true' : 'false');
    if (isEncrypted && secretSalt) formData.append('secretSalt', secretSalt);
  }

  if (deletedFileNames && deletedFileNames.length > 0) {
    formData.append('deletedFileNames', JSON.stringify(deletedFileNames));
  }

  // 한글 파일명이 깨지지 않도록 원본 이름을 JSON 으로 따로 보낸다
  if (files && files.length > 0) {
    const originalNames = files.map(file => file.name);
    formData.append('originalFilenames', JSON.stringify(originalNames));

    files.forEach(file => {
      formData.append('files', file);
    });
  }

  const res = await axios.put(`/posts/${boardType}/${postId}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      Accept: 'application/json',
    },
  });

  return unwrap(res);
}

// 게시글 삭제
export async function deletePost(boardType: string, postId: string) {
  const res = await axios.delete(`/posts/${boardType}/${postId}`);
  return unwrap(res);
}

export async function markPostRead(boardType: string, postId: string): Promise<void> {
  await axios.post(`/posts/${boardType}/${postId}/read`).catch(() => {});
}

/**
 * 상단 고정 토글. 고정할 때 pinnedUntil 을 주면 그 시각까지만 고정된다.
 * 고정을 푸는 호출에서는 무시된다(서버가 기간도 함께 지운다).
 */
/** @param pinned 원하는 상태. 뒤집기로 보내면 화면이 낡았을 때 반대로 걸린다. */
export async function togglePin(
  boardType: string,
  postId: string,
  pinnedUntil?: Date | null,
  pinned?: boolean
): Promise<{ isPinned: boolean; pinnedUntil: string | null }> {
  const res = await axios.patch(`/posts/${boardType}/${postId}/pin`, {
    pinnedUntil: pinnedUntil ? pinnedUntil.toISOString() : undefined,
    pinned,
  });
  return unwrap(res);
}

export interface PostRevision {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  editor: { id: string; name: string } | null;
}

export async function fetchPostRevisions(
  boardType: string,
  postId: string
): Promise<PostRevision[]> {
  const res = await axios.get(`/posts/${boardType}/${postId}/revisions`);
  return unwrap<{ revisions: PostRevision[] }>(res).revisions;
}
