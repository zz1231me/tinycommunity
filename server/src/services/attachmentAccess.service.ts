// 첨부파일 접근 인가. 새 첨부 서빙 경로는 반드시 이 함수를 거쳐야 IDOR 이 막힌다.

import { Op, WhereOptions } from 'sequelize';
import { Post } from '../models/Post';
import { PostAttachmentVersion } from '../models/PostAttachmentVersion';
import { boardService } from './board.service';
import { ROLES } from '../config/constants';

export type AttachmentAccessResult = { ok: true } | { ok: false; message: string };

/**
 * 이 파일을 가진 게시글을 찾는다. 이력(PostAttachmentVersion)과 지운 글까지 따라가야
 * 밀려난 첨부가 주인 없는 파일로 새지 않는다.
 */
async function findOwningPost(savedFilename: string) {
  // attachments 는 TEXT 컬럼이지만 게터 타입이 Attachment[] 라 LIKE 에 캐스팅이 필요하다
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

/** 저장 파일명으로 소유 게시글을 찾아 읽기 권한과 비밀글 접근을 검증한다. 주인이 없으면 통과. */
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

  // 'users' 지정 비밀글만 검증한다. password/E2EE 는 stateless 라 검증 상태를 알 수 없다.
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
