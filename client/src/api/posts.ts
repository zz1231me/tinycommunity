import axios from './axios';
import { unwrap } from './utils';

// ✅ 깔끔한 타입 정의
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
}

// ✅ 게시글 목록 조회 - 응답 구조 수정
export async function fetchPostsByType(
  boardType: string,
  options: FetchPostsOptions = {},
  signal?: AbortSignal
): Promise<PostListResponse> {
  const { page = 1, limit = 10, search = '', tags } = options;

  const params = new URLSearchParams();
  params.append('page', page.toString());
  params.append('limit', limit.toString());
  if (search.trim()) {
    params.append('search', search.trim());
  }
  if (tags && tags.length > 0) {
    params.append('tags', tags.join(','));
  }

  const res = await axios.get(`/posts/${boardType}?${params.toString()}`, { signal });

  // ✅ sendSuccess 응답 구조: { success: true, data: { posts, pagination } }
  if (!res.data.success || !res.data.data) {
    throw new Error('잘못된 API 응답 구조');
  }

  const responseData = res.data.data;

  if (!responseData.posts || !responseData.pagination) {
    throw new Error('응답에 posts 또는 pagination이 없습니다');
  }

  return responseData;
}

// ✅ 게시글 단건 조회 - 비밀글 잠금 상태 포함
export async function fetchPostById(boardType: string, postId: string) {
  const res = await axios.get(`/posts/${boardType}/${postId}`);

  if (!res.data.success || !res.data.data) {
    throw new Error('잘못된 API 응답 구조');
  }

  const postData = res.data.data;

  // 비밀글 잠금 상태 - 정상 반환 (content 없어도 OK)
  if (postData.isLocked) {
    return postData;
  }

  if (!postData.title || !postData.content) {
    throw new Error('게시글 제목 또는 내용이 없습니다');
  }

  return postData;
}

// ✅ 비밀글 비밀번호 검증 (일반 비밀글용 — E2EE 게시글에는 사용하지 않음)
export async function verifySecretPost(boardType: string, postId: string, password: string) {
  const res = await axios.post(`/posts/${boardType}/${postId}/verify`, { password });
  if (!res.data.success || !res.data.data) throw new Error('잘못된 응답 구조');
  return res.data.data;
}

// ✅ 좋아요 토글
export async function toggleLike(boardType: string, postId: string) {
  const res = await axios.post(`/posts/${boardType}/${postId}/like`);
  return unwrap(res);
}

// ✅ 좋아요 상태 조회
export async function getLikeStatus(boardType: string, postId: string) {
  const res = await axios.get(`/posts/${boardType}/${postId}/like`);
  return unwrap(res);
}

// ✅ 게시글 생성 - 한글 파일명 완벽 지원
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

  // ✅ 다중 파일 추가 - 한글 파일명 안전 처리 (개수 제한은 호출부/서버에서 처리)
  if (files && files.length > 0) {
    // 원본 파일명을 JSON으로 별도 전송
    const originalNames = files.map(file => file.name);
    formData.append('originalFilenames', JSON.stringify(originalNames));

    // 파일 자체는 그대로 추가 (multer가 처리)
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

// ✅ 게시글 수정 - deletedFileNames + 비밀글 지원
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
  // 게시판 이동: 현재 게시판과 다를 때만 전송
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
    // isEncrypted는 항상 명시적으로 전송 (absent 시 서버가 false로 강제 처리하여 E2EE 플래그 소실 방지)
    formData.append('isEncrypted', isEncrypted ? 'true' : 'false');
    if (isEncrypted && secretSalt) formData.append('secretSalt', secretSalt);
  }

  // ✅ 삭제된 파일명 목록 전송
  if (deletedFileNames && deletedFileNames.length > 0) {
    formData.append('deletedFileNames', JSON.stringify(deletedFileNames));
  }

  // ✅ 새로운 파일들 추가 - 한글 파일명 안전 처리 (개수 제한은 호출부/서버에서 처리)
  if (files && files.length > 0) {
    // 원본 파일명을 JSON으로 별도 전송
    const originalNames = files.map(file => file.name);
    formData.append('originalFilenames', JSON.stringify(originalNames));

    // 파일 자체는 그대로 추가 (multer가 처리)
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

// ✅ 게시글 삭제
export async function deletePost(boardType: string, postId: string) {
  const res = await axios.delete(`/posts/${boardType}/${postId}`);
  return unwrap(res);
}

export async function markPostRead(boardType: string, postId: string): Promise<void> {
  await axios.post(`/posts/${boardType}/${postId}/read`).catch(() => {});
}

export async function togglePin(boardType: string, postId: string): Promise<{ isPinned: boolean }> {
  const res = await axios.patch(`/posts/${boardType}/${postId}/pin`);
  return unwrap(res);
}
