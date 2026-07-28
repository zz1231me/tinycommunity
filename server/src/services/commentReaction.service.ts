import { Transaction } from 'sequelize';
import { Comment } from '../models/Comment';
import { CommentReaction } from '../models/CommentReaction';
import { AppError } from '../middlewares/error.middleware';
import { sequelize } from '../config/sequelize';
import { BaseService } from './base.service';

export interface ReactionSummary {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

// 한 댓글에 허용하는 서로 다른 이모지 종류 수(스팸 방지)
const MAX_DISTINCT_EMOJIS = 20;

export class CommentReactionService extends BaseService {
  /**
   * 댓글 이모지 리액션 토글 — 같은 (댓글, 사용자, 이모지)가 없으면 추가, 있으면 제거.
   * CommentLike.toggleLike와 동일하게 트랜잭션 + LOCK.UPDATE로 동시 클릭 race를 막는다.
   * 반환은 해당 댓글의 최신 리액션 요약(요청자 기준 reactedByMe 포함).
   */
  async toggleReaction(
    commentId: number,
    userId: string,
    emoji: string
  ): Promise<ReactionSummary[]> {
    return sequelize.transaction(async t => {
      const comment = await Comment.findByPk(commentId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!comment) throw new AppError(404, '댓글을 찾을 수 없습니다.');

      const existing = await CommentReaction.findOne({
        where: { CommentId: commentId, UserId: userId, emoji },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (existing) {
        await existing.destroy({ transaction: t });
      } else {
        // 새 이모지 종류 추가 시에만 종류 수 제한 검사(같은 이모지 반복 토글은 무제한)
        const distinct = await CommentReaction.count({
          where: { CommentId: commentId },
          distinct: true,
          col: 'emoji',
          transaction: t,
        });
        if (distinct >= MAX_DISTINCT_EMOJIS) {
          throw new AppError(400, '이 댓글에 추가할 수 있는 이모지 종류를 초과했습니다.');
        }
        await CommentReaction.create(
          { CommentId: commentId, UserId: userId, emoji },
          { transaction: t }
        );
      }

      return this.summarize(commentId, userId, t);
    });
  }

  // 댓글의 리액션을 {emoji, count, reactedByMe}[]로 집계(count 내림차순)
  private async summarize(
    commentId: number,
    userId: string | undefined,
    transaction?: Transaction
  ): Promise<ReactionSummary[]> {
    const rows = await CommentReaction.findAll({
      where: { CommentId: commentId },
      attributes: ['UserId', 'emoji'],
      transaction,
    });
    const map = new Map<string, { count: number; reactedByMe: boolean }>();
    for (const r of rows) {
      const emoji = r.emoji;
      const cur = map.get(emoji) ?? { count: 0, reactedByMe: false };
      cur.count += 1;
      if (userId && r.UserId === userId) cur.reactedByMe = true;
      map.set(emoji, cur);
    }
    return [...map.entries()]
      .map(([emoji, v]) => ({ emoji, count: v.count, reactedByMe: v.reactedByMe }))
      .sort((a, b) => b.count - a.count);
  }
}

export const commentReactionService = new CommentReactionService();
