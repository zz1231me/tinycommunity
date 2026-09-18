// server/src/services/attachmentAccess.service.ts
// 첨부파일 접근 인가 — 다운로드와 썸네일이 공유한다.
//
// ⚠️ 새로운 첨부 서빙 경로를 추가할 때는 반드시 이 함수를 통과시켜야 한다.
//    인증만으로는 파일명만 알면 다른 게시판·비밀글의 첨부를 받아갈 수 있다(IDOR).

import { Op, WhereOptions } from 'sequelize';
import { Post } from '../models/Post';
import { PostAttachmentVersion } from '../models/PostAttachmentVersion';
import { boardService } from './board.service';
import { ROLES } from '../config/constants';

export type AttachmentAccessResult = { ok: true } | { ok: false; message: string };

/**
 * 이 파일을 가진 게시글을 찾는다.
 *
 * 지금 붙어 있는 첨부는 Post.attachments 에서 찾는다. 그런데 같은 이름으로 다시 올려
 * 밀려난 파일은 그 목록에서 빠지고 PostAttachmentVersion 으로 옮겨지면서도 디스크에는
 * 그대로 남는다(이력이라 일부러 남긴다). 목록만 보고 판단하면 그 파일들은 '주인이 없는
 * 파일' 로 보여 아래 검사를 통째로 건너뛰었다 — 권한이 끊긴 뒤에도, 비밀글로 바뀐
 * 뒤에도, 예전에 받아 둔 주소로 계속 내려받을 수 있었다. 이력 표까지 따라간다.
 *
 * paranoid: false — 지운 글(soft delete)의 첨부도 주인을 찾아 규칙을 그대로 적용한다.
 * 빼면 글을 지우는 순간 그 첨부가 아무나 받을 수 있는 파일이 된다.
 */
async function findOwningPost(savedFilename: string) {
  // attachments는 TEXT(JSON 문자열) 컬럼이지만 모델 게터 타입이 Attachment[]라 LIKE에 캐스팅 필요
  const current = await Post.findOne({
    where: { attachments: { [Op.like]: `%${savedFilename}%` } } as WhereOptions,
    paranoid: false,
  });
  if (current) return current;

  const archived = await PostAttachmentVersion.findOne({
    where: { filename: savedFilename },
    attributes: ['postId'],
  });
  return archived ? Post.findByPk(archived.postId, { paranoid: false }) : null;
}

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
  const owningPost = await findOwningPost(savedFilename);
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
