// 본문의 @아이디 멘션에 알림을 보낸다. 알림에 제목·링크가 실리므로 읽기 권한을 반드시 확인한다.

import { Op } from 'sequelize';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { extractSearchText } from '../utils/contentRenderer';
import { checkSecretPostAccess, SecretPostFields } from '../utils/postAccess';
import { boardService } from './board.service';
import { notificationService } from './notification.service';
import { featureFlagService } from './featureFlag.service';
import { logError } from '../utils/logger';

// 가입 아이디 규칙과 동일. 앞에 단어 문자가 오면(이메일 등) 멘션으로 보지 않는다.
const MENTION_RE = /(^|[^\w@])@([a-zA-Z0-9_]{4,20})\b/g;

/** 한 번의 작성에서 알림을 보낼 최대 인원 */
const MAX_MENTIONS = 10;

/** 본문에서 멘션된 아이디를 뽑는다. 대소문자를 구분하므로 원문 그대로 돌려준다. */
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
  /** 멘션한 사람. 자기 자신은 알림에서 뺀다. */
  actorId: string;
  actorName: string;
  boardType: string;
  /** 비밀글 접근 검증용. 게시글이 아니면(예: 위키) 생략 가능 */
  post?: SecretPostFields;
  message: (actorName: string) => string;
  link: string;
  relatedId?: string;
  /** 이미 다른 사유로 알림을 받는 사용자 */
  excludeUserIds?: string[];
}

/** 본문의 멘션에 알림을 보낸다. 실패해도 호출부를 막지 않도록 오류는 로깅만 한다. */
export async function notifyMentions(params: NotifyParams): Promise<void> {
  try {
    // 전용 라우트가 없어 글 저장 흐름 안에서 기능 플래그를 직접 확인한다.
    if (!(await featureFlagService.isEnabled('social.mentions'))) return;

    const ids = extractMentions(params.content);
    if (ids.length === 0) return;

    const exclude = new Set([params.actorId, ...(params.excludeUserIds ?? [])]);
    const targetIds = ids.filter(id => !exclude.has(id));
    if (targetIds.length === 0) return;

    const users = await User.findAll({
      where: { id: { [Op.in]: targetIds }, isActive: true, isDeleted: false },
      attributes: ['id'],
      include: [{ model: Role, as: 'roleInfo', attributes: ['id'] }],
    });

    for (const user of users) {
      const roleId = (user as unknown as { roleInfo?: { id: string } }).roleInfo?.id;
      if (!roleId) continue;

      const perm = await boardService.checkPermission(user.id, roleId, params.boardType, 'canRead');
      if (!perm.hasAccess) continue;

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
