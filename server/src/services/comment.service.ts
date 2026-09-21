import { Op } from 'sequelize';
import { BaseService } from './base.service';
import { Comment, CommentInstance } from '../models/Comment';
import { CommentLike } from '../models/CommentLike';
import { CommentReaction } from '../models/CommentReaction';
import { User } from '../models/User';
import { AppError } from '../middlewares/error.middleware';
import { isAdminOrManager } from '../config/constants';
import { getCommentSettings } from '../utils/settingsCache';
import { sanitizeHtmlContent } from '../utils/contentRenderer';
import { sequelize } from '../config/sequelize';

export class CommentService extends BaseService {
  /** 댓글 생성. authorName 은 컨트롤러가 넘기므로 User 를 따로 조회하지 않는다. */
  async createComment(
    postId: string,
    userId: string,
    content: string,
    authorName: string,
    parentId?: number
  ): Promise<CommentInstance> {
    const { maxDepth, maxCount } = getCommentSettings();

    const newComment = await sequelize.transaction(async t => {
      // 게시글당 최대 댓글 수는 관리자 설정값을 쓴다.
      const currentCount = await Comment.count({
        where: { PostId: postId },
        transaction: t,
      });
      if (currentCount >= maxCount) {
        throw new AppError(400, `이 게시글의 댓글은 최대 ${maxCount}개까지 작성할 수 있습니다.`);
      }

      // LOCK.UPDATE 로 부모 존재·깊이의 TOCTOU 를 막는다.
      let depth = 0;
      let path = '';
      if (parentId !== undefined && parentId !== null) {
        const parentComment = await Comment.findByPk(parentId, {
          attributes: ['id', 'depth', 'path', 'PostId'],
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (!parentComment) {
          throw new AppError(404, '부모 댓글을 찾을 수 없습니다.');
        }
        if (String(parentComment.PostId) !== String(postId)) {
          throw new AppError(400, '다른 게시글의 댓글에는 대댓글을 달 수 없습니다.');
        }
        // depth 는 0-based 라 maxDepth 단계는 depth(maxDepth-1) 까지다.
        if ((parentComment.depth ?? 0) >= maxDepth - 1) {
          throw new AppError(
            400,
            `더 이상 대댓글을 달 수 없습니다. 최대 ${maxDepth}단계까지 허용됩니다.`
          );
        }
        // M3: 훅이 트랜잭션 없이 부모를 재조회하는 TOCTOU를 방지하기 위해
        //     잠긴 부모의 depth/path를 서비스에서 미리 계산해 create에 전달
        depth = (parentComment.depth ?? 0) + 1;
        path = parentComment.path
          ? `${parentComment.path}.${parentComment.id}`
          : String(parentComment.id);
      }

      return Comment.create(
        {
          // 댓글도 HTML 이므로 화면의 DOMPurify 에만 기대지 않고 서버에서 정화한다.
          content: sanitizeHtmlContent(content.trim()),
          PostId: postId,
          UserId: userId,
          author: authorName,
          parentId: parentId ?? null,
          depth,
          path,
        },
        { transaction: t }
      );
    });

    const commentWithUser = await Comment.findByPk(newComment.id, {
      attributes: [
        'id',
        'content',
        'author',
        'createdAt',
        'updatedAt',
        'UserId',
        'PostId',
        'isEdited',
        'editedAt',
        'parentId',
        'depth',
        'path',
      ],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'avatar'],
          required: false,
        },
      ],
    });

    if (!commentWithUser) {
      throw new AppError(500, '댓글 생성 후 조회 실패');
    }

    return commentWithUser;
  }

  /**
   * 게시글의 댓글 목록 조회
   * @param sortBy 'oldest' (기본) | 'newest' | 'popular'
   */
  async getCommentsByPost(
    postId: string,
    sortBy: 'oldest' | 'newest' | 'popular' = 'oldest',
    userId?: string
  ): Promise<Array<Record<string, unknown>>> {
    const ATTRS = [
      'id',
      'content',
      'author',
      'createdAt',
      'updatedAt',
      'UserId',
      'PostId',
      'isEdited',
      'editedAt',
      'parentId',
      'depth',
      'path',
      'likeCount',
    ];
    const userInclude = [
      { model: User, as: 'user', attributes: ['id', 'name', 'avatar'], required: false },
    ];

    const live = await Comment.findAll({
      where: { PostId: postId },
      attributes: ATTRS,
      include: userInclude,
      // 상한에 걸렸을 때 잘려 나가는 대상이 정해지도록 정렬을 함께 건다.
      order: [['id', 'ASC']],
      limit: getCommentSettings().maxCount,
    });

    const result: Array<Record<string, unknown>> = live.map(c => ({
      ...c.get({ plain: true }),
      isDeleted: false,
    }));
    const present = new Set<number>(result.map(c => c.id as number));

    // 자식이 살아 있으면 삭제된 부모도 마스킹해 넣는다. 부모의 부모도 있을 수 있어 반복한다.
    for (let depth = 0; depth < 10; depth += 1) {
      const missing = [
        ...new Set(
          result
            .map(c => c.parentId as number | null)
            .filter((pid): pid is number => pid !== null && !present.has(pid))
        ),
      ];
      if (missing.length === 0) break;

      const parents = await Comment.findAll({
        where: { id: { [Op.in]: missing }, PostId: postId },
        attributes: [...ATTRS, 'deletedAt'],
        include: userInclude,
        paranoid: false,
      });
      if (parents.length === 0) break;

      for (const p of parents) {
        const plain = p.get({ plain: true }) as Record<string, unknown>;
        present.add(plain.id as number);
        if (plain.deletedAt) {
          // 삭제된 부모는 내용·작성자를 가리고 isDeleted 로 표시한다.
          result.push({
            ...plain,
            content: '삭제된 댓글입니다.',
            author: '(삭제됨)',
            user: null,
            UserId: null,
            isEdited: false,
            editedAt: null,
            likeCount: 0,
            deletedAt: undefined,
            isDeleted: true,
          });
        } else {
          // limit 에 잘려 빠졌던 부모는 그대로 복원한다.
          result.push({ ...plain, deletedAt: undefined, isDeleted: false });
        }
      }
    }

    // 좋아요 여부는 표시된 댓글 id 를 한 번에 조회해 채운다.
    if (userId) {
      const likableIds = result.filter(c => !c.isDeleted).map(c => c.id as number);
      const likedIds =
        likableIds.length > 0
          ? new Set(
              (
                await CommentLike.findAll({
                  where: { CommentId: likableIds, UserId: userId },
                  attributes: ['CommentId'],
                })
              ).map(r => r.CommentId as number)
            )
          : new Set<number>();
      for (const c of result) {
        c.liked = !c.isDeleted && likedIds.has(c.id as number);
      }
    } else {
      for (const c of result) c.liked = false;
    }

    // 이모지 리액션도 한 번에 모아 집계한다. 비로그인은 reactedByMe 가 항상 false 다.
    const reactableIds = result.filter(c => !c.isDeleted).map(c => c.id as number);
    const reactionByComment = new Map<number, Map<string, { count: number; me: boolean }>>();
    if (reactableIds.length > 0) {
      const rows = await CommentReaction.findAll({
        where: { CommentId: reactableIds },
        attributes: ['CommentId', 'UserId', 'emoji'],
      });
      for (const r of rows) {
        const cid = r.CommentId as number;
        let m = reactionByComment.get(cid);
        if (!m) {
          m = new Map();
          reactionByComment.set(cid, m);
        }
        const cur = m.get(r.emoji) ?? { count: 0, me: false };
        cur.count += 1;
        if (userId && r.UserId === userId) cur.me = true;
        m.set(r.emoji, cur);
      }
    }
    for (const c of result) {
      if (c.isDeleted) {
        c.reactions = [];
        continue;
      }
      const m = reactionByComment.get(c.id as number);
      c.reactions = m
        ? [...m.entries()]
            .map(([emoji, v]) => ({ emoji, count: v.count, reactedByMe: v.me }))
            .sort((a, b) => b.count - a.count)
        : [];
    }

    // 마스킹 부모를 끼워 넣었으므로 정렬 기준에 맞춰 다시 정렬한다.
    const byTime = (a: Record<string, unknown>, b: Record<string, unknown>): number =>
      new Date(a.createdAt as string).getTime() - new Date(b.createdAt as string).getTime();
    if (sortBy === 'newest') {
      result.sort((a, b) => byTime(b, a));
    } else if (sortBy === 'popular') {
      result.sort((a, b) => (b.likeCount as number) - (a.likeCount as number) || byTime(a, b));
    } else {
      result.sort(byTime);
    }

    return result;
  }

  async updateComment(
    commentId: number,
    userId: string,
    userRole: string,
    content: string
  ): Promise<CommentInstance> {
    const updatedComment = await sequelize.transaction(async t => {
      // LOCK.UPDATE 로 동시 수정의 TOCTOU 를 막는다.
      const comment = await Comment.findByPk(commentId, { transaction: t, lock: t.LOCK.UPDATE });

      if (!comment) {
        throw new AppError(404, '댓글을 찾을 수 없습니다.');
      }

      const isPrivileged = isAdminOrManager(userRole);
      const isOwner = comment.UserId === userId;

      if (!isPrivileged && !isOwner) {
        throw new AppError(403, '수정 권한이 없습니다.');
      }

      // beforeUpdate 훅이 isEdited/editedAt 을 채우므로 content 만 넘긴다.
      // 정화는 생성과 같은 자리에서 한다. 한쪽만 하면 수정으로 우회된다.
      await comment.update({ content: sanitizeHtmlContent(content.trim()) }, { transaction: t });

      const updated = await Comment.findByPk(commentId, {
        attributes: [
          'id',
          'content',
          'author',
          'createdAt',
          'updatedAt',
          'UserId',
          'PostId',
          'isEdited',
          'editedAt',
          'parentId',
          'depth',
          'path',
        ],
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'avatar'],
            required: false,
          },
        ],
        transaction: t,
      });

      if (!updated) {
        throw new AppError(500, '댓글 수정 후 조회 실패');
      }

      return updated;
    });

    return updatedComment;
  }

  async deleteComment(commentId: number, userId: string, userRole: string): Promise<void> {
    await sequelize.transaction(async t => {
      // LOCK.UPDATE 로 동시 삭제의 TOCTOU 를 막는다.
      const comment = await Comment.findByPk(commentId, { transaction: t, lock: t.LOCK.UPDATE });

      if (!comment) {
        throw new AppError(404, '댓글을 찾을 수 없습니다.');
      }

      const isPrivileged = isAdminOrManager(userRole);
      const isOwner = comment.UserId === userId;

      if (!isPrivileged && !isOwner) {
        throw new AppError(403, '삭제 권한이 없습니다.');
      }

      // Comment 는 soft delete 라 CASCADE 가 돌지 않으므로 CommentLike 를 직접 지운다.
      await CommentLike.destroy({ where: { CommentId: commentId }, transaction: t });
      // 이모지 리액션도 같은 이유로 직접 지운다.
      await CommentReaction.destroy({ where: { CommentId: commentId }, transaction: t });

      await comment.destroy({ transaction: t });
    });
  }
}

export const commentService = new CommentService();
