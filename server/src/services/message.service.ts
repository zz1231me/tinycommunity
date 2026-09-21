// 1:1 메시지. 두 사람 사이의 대화만 다루며, 내용은 평문으로 저장하고 표시 단계에서 이스케이프한다.

import { Op, literal } from 'sequelize';
import { sequelize } from '../config/sequelize';
import { Conversation, buildPairKey } from '../models/Conversation';
import { Message } from '../models/Message';
import User from '../models/User';
import { AppError } from '../middlewares/error.middleware';
import { notificationService } from './notification.service';
import { logError } from '../utils/logger';

/** 메시지 한 통의 최대 길이 */
const MAX_CONTENT_LENGTH = 2000;

/** 대화 목록에 보여 줄 미리보기 길이 */
const PREVIEW_LENGTH = 100;

function preview(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  return flat.length > PREVIEW_LENGTH ? `${flat.slice(0, PREVIEW_LENGTH)}…` : flat;
}

function sideOf(conversation: Conversation, userId: string): 'A' | 'B' {
  return conversation.userAId === userId ? 'A' : 'B';
}

function otherIdOf(conversation: Conversation, userId: string): string {
  return conversation.userAId === userId ? conversation.userBId : conversation.userAId;
}

async function loadParticipant(userId: string) {
  const user = await User.findOne({
    where: { id: userId, isActive: true, isDeleted: false },
    attributes: ['id', 'name', 'avatar'],
  });
  if (!user) throw new AppError(404, '사용자를 찾을 수 없습니다.');
  return user;
}

export const messageService = {
  MAX_CONTENT_LENGTH,

  /** 메시지를 보낸다. 대화 생성·메시지 저장·마지막 메시지 갱신을 한 트랜잭션으로 묶는다. */
  async send(senderId: string, recipientId: string, rawContent: string) {
    const content = String(rawContent ?? '').trim();
    if (!content) throw new AppError(400, '내용을 입력해주세요.');
    if (content.length > MAX_CONTENT_LENGTH) {
      throw new AppError(400, `메시지는 ${MAX_CONTENT_LENGTH}자를 넘을 수 없습니다.`);
    }
    if (senderId === recipientId) {
      throw new AppError(400, '자기 자신에게는 보낼 수 없습니다.');
    }

    const recipient = await loadParticipant(recipientId);
    const [userAId, userBId] = [senderId, recipientId].sort();
    const pairKey = buildPairKey(senderId, recipientId);

    const { conversation, message } = await sequelize.transaction(async t => {
      const [conv] = await Conversation.findOrCreate({
        where: { pairKey },
        defaults: { pairKey, userAId, userBId },
        transaction: t,
      });

      const msg = await Message.create(
        { conversationId: conv.id, senderId, content, isRead: false },
        { transaction: t }
      );

      conv.lastMessageAt = msg.createdAt;
      conv.lastMessagePreview = preview(content);
      conv.lastSenderId = senderId;
      // 새 메시지가 오면 양쪽 모두에서 숨김을 해제한다.
      conv.hiddenByA = false;
      conv.hiddenByB = false;
      await conv.save({ transaction: t });

      return { conversation: conv, message: msg };
    });

    // 알림은 트랜잭션 밖에서 처리한다. 보낸 사람 이름 조회도 이 안에 둬야 실패가 응답에 영향을 주지 않는다.
    void (async () => {
      const sender = await User.findByPk(senderId, { attributes: ['name'] });
      await notificationService.create({
        userId: recipientId,
        type: 'MESSAGE',
        // 내용은 알림에 싣지 않는다.
        message: `${sender?.name ?? senderId}님이 메시지를 보냈습니다.`,
        link: `/dashboard/messages/${conversation.id}`,
        relatedId: conversation.id,
      });
    })().catch(err => logError('메시지 알림 발송 실패', err, { conversationId: conversation.id }));

    return {
      conversationId: conversation.id,
      // 화면이 목록에 바로 이어 붙이므로 getMessages 와 같은 모양이어야 한다.
      message: {
        id: message.id,
        senderId,
        fromMe: true,
        content: message.content,
        createdAt: message.createdAt,
      },
      recipient: { id: recipient.id, name: recipient.name, avatar: recipient.avatar ?? null },
    };
  },

  /** 내 대화 목록 (최근 메시지 순). 숨긴 대화는 빠진다. */
  async listConversations(userId: string) {
    const conversations = await Conversation.findAll({
      where: {
        [Op.or]: [
          { userAId: userId, hiddenByA: false },
          { userBId: userId, hiddenByB: false },
        ],
        lastMessageAt: { [Op.ne]: null },
      },
      order: [['lastMessageAt', 'DESC']],
      limit: 100,
    });
    if (conversations.length === 0) return [];

    const otherIds = conversations.map(c => otherIdOf(c, userId));
    const users = await User.findAll({
      where: { id: { [Op.in]: otherIds } },
      attributes: ['id', 'name', 'avatar', 'isActive', 'isDeleted'],
    });
    const userById = new Map(users.map(u => [u.id, u]));

    // 대화별 안 읽은 수를 한 번에 센다.
    const unreadRows = (await Message.findAll({
      where: {
        conversationId: { [Op.in]: conversations.map(c => c.id) },
        senderId: { [Op.ne]: userId },
        isRead: false,
      },
      attributes: ['conversationId', [literal('COUNT(*)'), 'cnt']],
      group: ['conversationId'],
      raw: true,
    })) as unknown as Array<{ conversationId: string; cnt: number }>;
    const unreadByConversation = new Map(unreadRows.map(r => [r.conversationId, Number(r.cnt)]));

    return conversations.map(c => {
      const other = userById.get(otherIdOf(c, userId));
      const gone = !other || !other.isActive || other.isDeleted;
      return {
        id: c.id,
        partner: {
          id: otherIdOf(c, userId),
          name: gone ? '탈퇴한 사용자' : other.name,
          avatar: gone ? null : (other.avatar ?? null),
          active: !gone,
        },
        lastMessagePreview: c.lastMessagePreview,
        lastMessageAt: c.lastMessageAt,
        lastFromMe: c.lastSenderId === userId,
        unreadCount: unreadByConversation.get(c.id) ?? 0,
      };
    });
  },

  /** 헤더 배지용 안 읽은 메시지 총 개수. 자주 호출되므로 조인 한 번으로 센다. */
  async unreadCount(userId: string): Promise<number> {
    return Message.count({
      where: { senderId: { [Op.ne]: userId }, isRead: false },
      include: [
        {
          model: Conversation,
          as: 'conversation',
          required: true,
          attributes: [],
          where: {
            [Op.or]: [
              { userAId: userId, hiddenByA: false },
              { userBId: userId, hiddenByB: false },
            ],
          },
        },
      ],
    });
  },

  /** 참가자인지 확인하고 대화를 돌려준다 */
  async requireParticipant(conversationId: string, userId: string): Promise<Conversation> {
    const conversation = await Conversation.findByPk(conversationId);
    if (!conversation) throw new AppError(404, '대화를 찾을 수 없습니다.');
    if (conversation.userAId !== userId && conversation.userBId !== userId) {
      // 존재 여부를 알려 주지 않도록 403 이 아니라 404 로 답한다.
      throw new AppError(404, '대화를 찾을 수 없습니다.');
    }
    return conversation;
  },

  /**
   * 대화의 메시지를 최신순으로 읽고, 상대가 보낸 것을 읽음 처리한다.
   * cursor 는 그보다 오래된(id 가 작은) 메시지를 가져온다.
   */
  async getMessages(conversationId: string, userId: string, cursor?: number, limit = 30) {
    const conversation = await this.requireParticipant(conversationId, userId);

    const where: Record<string | symbol, unknown> = { conversationId };
    if (cursor !== undefined && Number.isFinite(cursor)) {
      where.id = { [Op.lt]: cursor };
    }

    const safeLimit = Math.min(Math.max(1, limit), 100);
    const rows = await Message.findAll({
      where,
      order: [['id', 'DESC']],
      limit: safeLimit + 1,
    });

    const hasMore = rows.length > safeLimit;
    const page = hasMore ? rows.slice(0, safeLimit) : rows;

    // 대화를 처음 열 때만 읽음 처리한다. 이전 메시지를 더 받는 요청(cursor)에서는 건너뛴다.
    if (cursor === undefined) {
      await Message.update(
        { isRead: true },
        { where: { conversationId, senderId: { [Op.ne]: userId }, isRead: false } }
      );
    }

    const other = await User.findByPk(otherIdOf(conversation, userId), {
      attributes: ['id', 'name', 'avatar', 'isActive', 'isDeleted'],
    });
    const gone = !other || !other.isActive || other.isDeleted;

    return {
      conversationId,
      partner: {
        id: otherIdOf(conversation, userId),
        name: gone ? '탈퇴한 사용자' : other.name,
        avatar: gone ? null : (other.avatar ?? null),
        active: !gone,
      },
      messages: page
        .slice()
        .reverse()
        .map(m => ({
          id: m.id,
          senderId: m.senderId,
          fromMe: m.senderId === userId,
          content: m.content,
          createdAt: m.createdAt,
        })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
      hasMore,
    };
  },

  /** 내 목록에서만 숨긴다. 상대의 대화는 그대로 남는다. */
  async hide(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.requireParticipant(conversationId, userId);
    if (sideOf(conversation, userId) === 'A') conversation.hiddenByA = true;
    else conversation.hiddenByB = true;
    await conversation.save();
  },
};
