// server/src/services/attachmentAccess.service.ts
// 첨부파일 접근 인가 — 다운로드와 썸네일이 공유한다.
//
// ⚠️ 새로운 첨부 서빙 경로를 추가할 때는 반드시 이 함수를 통과시켜야 한다.
//    인증만으로는 파일명만 알면 다른 게시판·비밀글의 첨부를 받아갈 수 있다(IDOR).

import { Op, WhereOptions } from 'sequelize';
import { Post } from '../models/Post';
import { boardService } from './board.service';
import { ROLES } from '../config/constants';

export type AttachmentAccessResult = { ok: true } | { ok: false; message: string };

/**
 * 저장 파일명으로 소유 게시글을 찾아 게시판 읽기 권한과 비밀글 접근을 검증한다.
 *
 * 소유 게시글이 없으면 통과시킨다 — 게시글 삭제 시 파일도 함께 지워지므로
 * 일반적으로 고아 파일은 존재하지 않는다(기존 다운로드 동작과 동일).
 */
export async function authorizeAttachmentAccess(
  savedFilename: string,
  userId: string,
  userRole: string
): Promise<AttachmentAccessResult> {
  // attachments는 TEXT(JSON 문자열) 컬럼이지만 모델 게터 타입이 Attachment[]라 LIKE에 캐스팅 필요
  const owningPost = await Post.findOne({
    where: { attachments: { [Op.like]: `%${savedFilename}%` } } as WhereOptions,
  });
  if (!owningPost) return { ok: true };

  const perm = await boardService.checkPermission(
    userId,
    userRole,
    owningPost.boardType,
    'canRead'
  );
  if (!perm.hasAccess) {
    return { ok: false, message: '이 파일에 접근할 권한이 없습니다.' };
  }

  // 'users' 지정 비밀글만 허용 목록을 검증한다(서버가 판별 가능).
  // password/E2EE 비밀글은 stateless 엔드포인트에서 비밀번호 검증 상태를 알 수 없고,
  // 파일명은 비밀번호 입력 후에만 노출되는 capability이므로 게시판 읽기 권한 통과로 충분.
  // (정상적으로 글을 열람한 비소유자가 첨부를 못 받는 회귀 방지)
  if (owningPost.isSecret && owningPost.secretType === 'users') {
    const isOwner = owningPost.UserId === userId;
    const isPrivileged = userRole === ROLES.ADMIN || userRole === ROLES.MANAGER;
    const allowed = (owningPost.secretUserIds || []).includes(userId);
    if (!isOwner && !isPrivileged && !allowed) {
      return { ok: false, message: '이 비밀글의 첨부파일에 접근할 권한이 없습니다.' };
    }
  }

  return { ok: true };
}
