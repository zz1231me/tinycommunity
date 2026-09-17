// 비밀글(isSecret) 접근 공통 검증 헬퍼.
// 댓글/좋아요/리액션 등 게시글 본문 외 동작에서 비밀글 보호를 일관되게 적용한다.
//
// 정책:
// - 비밀글이 아니면 통과
// - 작성자 본인은 항상 통과
// - admin/manager는 항상 통과
// - secretType === 'users': secretUserIds에 포함된 사용자만 통과
// - secretType === 'password': 후속 요청에서 잠금 해제 상태를 증명할 수 없으므로 비-소유자는 차단
//   (비밀번호 잠금 글에 댓글/좋아요가 필요하면 별도 인증된 세션을 도입해야 함)

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

  // 'password' 또는 그 외 — 잠금 해제 상태를 증명할 수 없으므로 차단
  return { ok: false, status: 403, message: '비밀글에는 접근할 수 없습니다.' };
}
