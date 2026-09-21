// 비밀글(isSecret) 접근 검증. 댓글·좋아요 등 본문 외 동작에서 공통으로 쓴다.

import { ROLES } from '../config/constants';

export interface SecretPostFields {
  isSecret?: boolean | null;
  secretType?: 'password' | 'users' | null;
  secretUserIds?: string[] | null;
  UserId?: string | null;
}

export type SecretAccessResult = { ok: true } | { ok: false; status: 403; message: string };

export function checkSecretPostAccess(
  post: SecretPostFields,
  userId: string,
  userRole?: string
): SecretAccessResult {
  if (!post.isSecret) return { ok: true };
  if (post.UserId && post.UserId === userId) return { ok: true };
  if (userRole === ROLES.ADMIN || userRole === ROLES.MANAGER) return { ok: true };

  if (post.secretType === 'users') {
    const allowed = post.secretUserIds || [];
    if (allowed.includes(userId)) return { ok: true };
    return { ok: false, status: 403, message: '이 비밀글에 접근할 권한이 없습니다.' };
  }

  // password 잠금은 해제 상태를 증명할 수 없어 차단한다.
  return { ok: false, status: 403, message: '비밀글에는 접근할 수 없습니다.' };
}
