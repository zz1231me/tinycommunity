// server/src/services/mention.service.ts
// 본문에서 @아이디 멘션을 찾아 해당 사용자에게 알림을 보낸다.
//
// ⚠️ 멘션은 알림을 통해 게시글 제목·링크를 전달하므로, 그 글을 읽을 수 없는
//    사용자를 멘션해 내용을 흘리는 통로가 되면 안 된다. 아래 notifyMentions 는
//    게시판 읽기 권한과 비밀글 접근을 반드시 확인한다.

import { Op } from 'sequelize';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { extractSearchText } from '../utils/contentRenderer';
import { checkSecretPostAccess, SecretPostFields } from '../utils/postAccess';
import { boardService } from './board.service';
import { notificationService } from './notification.service';
import { featureFlagService } from './featureFlag.service';
import { logError } from '../utils/logger';

// 가입 시 아이디 규칙(registerSchema)과 동일: 영문·숫자·언더스코어 4~20자.
// 앞에 단어 문자가 오면(예: 이메일 a@b) 멘션으로 보지 않는다.
const MENTION_RE = /(^|[^\w@])@([a-zA-Z0-9_]{4,20})\b/g;

/** 한 번의 작성에서 알림을 보낼 최대 인원 — 대량 멘션으로 알림을 폭주시키는 것 방지 */
const MAX_MENTIONS = 10;

/**
 * 본문(CKEditor HTML 또는 Tiptap JSON)에서 멘션된 아이디 목록을 뽑는다.
 * 소문자·대문자를 구분하는 아이디 체계라 원문 그대로 반환하며, 중복은 제거한다.
 */
export function extractMentions(content: string): string[] {
  const text = extractSearchText(content ?? '');
  const found = new Set<string>();
  for (const match of text.matchAll(MENTION_RE)) {
    found.add(match[2]);
    if (found.size >= MAX_MENTIONS) break;
  }
  return [...found];
}

interface NotifyParams {
  content: string;
  /** 멘션한 사람 — 자기 자신은 알림에서 제외 */
  actorId: string;
  actorName: string;
  boardType: string;
  /** 비밀글 접근 검증용. 게시글이 아니면(예: 위키) 생략 가능 */
  post?: SecretPostFields;
  message: (actorName: string) => string;
  link: string;
  relatedId?: string;
  /** 이미 다른 사유로 알림을 받는 사용자 — 중복 알림 방지 */
  excludeUserIds?: string[];
}

/**
 * 본문의 멘션을 해석해 알림을 보낸다. 실패해도 호출부의 흐름을 막지 않도록
 * 내부에서 오류를 삼키고 로깅만 한다(fire-and-forget 으로 호출).
 */
export async function notifyMentions(params: NotifyParams): Promise<void> {
  try {
    // 관리자가 멘션 알림을 껐으면 아무에게도 보내지 않는다.
    // 이 기능은 전용 라우트가 없어 글 저장 흐름 안에서 직접 확인한다.
    if (!(await featureFlagService.isEnabled('social.mentions'))) return;

    const ids = extractMentions(params.content);
    if (ids.length === 0) return;

    const exclude = new Set([params.actorId, ...(params.excludeUserIds ?? [])]);
    const targetIds = ids.filter(id => !exclude.has(id));
    if (targetIds.length === 0) return;

    // 실존하고 활성 상태인 사용자만 대상으로 한다.
    const users = await User.findAll({
      where: { id: { [Op.in]: targetIds }, isActive: true, isDeleted: false },
      attributes: ['id'],
      include: [{ model: Role, as: 'roleInfo', attributes: ['id'] }],
    });

    for (const user of users) {
      const roleId = (user as unknown as { roleInfo?: { id: string } }).roleInfo?.id;
      if (!roleId) continue;

      // 이 사용자가 해당 게시판을 읽을 수 있는가
      const perm = await boardService.checkPermission(user.id, roleId, params.boardType, 'canRead');
      if (!perm.hasAccess) continue;

      // 비밀글이면 그 글에 접근할 수 있는가
      if (params.post) {
        const secret = checkSecretPostAccess(params.post, user.id, roleId);
        if (!secret.ok) continue;
      }

      await notificationService.create({
        userId: user.id,
        type: 'MENTION',
        message: params.message(params.actorName),
        link: params.link,
        relatedId: params.relatedId,
      });
    }
  } catch (err) {
    logError('멘션 알림 처리 실패', err, { actorId: params.actorId });
  }
}
