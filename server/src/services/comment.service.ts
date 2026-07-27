import { Op } from 'sequelize';
import { BaseService } from './base.service';
import { Comment, CommentInstance } from '../models/Comment';
import { CommentLike } from '../models/CommentLike';
import { User } from '../models/User';
import { AppError } from '../middlewares/error.middleware';
import { isAdminOrManager } from '../config/constants';
import { getCommentSettings } from '../utils/settingsCache';
import { sequelize } from '../config/sequelize';

// Note: User is still needed for the include in findByPk responses

export class CommentService extends BaseService {
  /**
   * 댓글 생성
   * authorName: controller가 req.user.name 을 전달하므로 별도 User 조회 불필요
   */
  async createComment(
    postId: string,
    userId: string,
    content: string,
    authorName: string,
    parentId?: number
  ): Promise<CommentInstance> {
    const { maxDepth, maxCount } = getCommentSettings();

    const newComment = await sequelize.transaction(async t => {
      // ✅ 게시글당 최대 댓글 수 체크 (DoS 방지) — 관리자 설정값 사용
      const currentCount = await Comment.count({
        where: { PostId: postId },
        transaction: t,
      });
      if (currentCount >= maxCount) {
        throw new AppError(400, `이 게시글의 댓글은 최대 ${maxCount}개까지 작성할 수 있습니다.`);
      }

      // 대댓글 깊이 체크 — LOCK.UPDATE으로 부모 존재/깊이 TOCTOU 방지
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
        // depth는 0-based이므로 maxDepth단계 = depth(maxDepth-1)까지 허용
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
          content: content.trim(),
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

    // 응답용 데이터 조회 — 트랜잭션 성공 후 User 포함 재조회
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

    // 1) 살아있는 댓글 조회
    const live = await Comment.findAll({
      where: { PostId: postId },
      attributes: ATTRS,
      include: userInclude,
      // DoS 방지: 게시글당 최대 개수는 관리자 설정값 사용
      limit: getCommentSettings().maxCount,
    });

    const result: Array<Record<string, unknown>> = live.map(c => ({
      ...c.get({ plain: true }),
      isDeleted: false,
    }));
    const present = new Set<number>(result.map(c => c.id as number));

    // 2) 삭제된 '부모' 댓글 복원 — 자식이 살아있으면 트리 계층 보존을 위해 마스킹해 포함한다.
    //    부모가 또 삭제된 부모를 가질 수 있어 더 이상 누락이 없을 때까지 반복(상한 10회 안전장치).
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
        paranoid: false, // 소프트 삭제된 부모도 포함
      });
      if (parents.length === 0) break;

      for (const p of parents) {
        const plain = p.get({ plain: true }) as Record<string, unknown>;
        present.add(plain.id as number);
        if (plain.deletedAt) {
          // 삭제된 부모 — 내용/작성자 마스킹 + isDeleted 플래그(클라가 액션 없이 음영 처리)
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
          // 삭제는 아니나 limit으로 잘려 빠졌던 부모 — 그대로 복원
          result.push({ ...plain, deletedAt: undefined, isDeleted: false });
        }
      }
    }

    // 2.5) 현재 사용자의 좋아요 여부 — 표시된 댓글 id에 대해 1쿼리로 일괄 조회 후 liked 플래그 부여
    //      (삭제 placeholder는 항상 false. 비로그인은 모두 false)
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

    // 3) 정렬 — 마스킹 부모를 끼워넣었으므로 정렬 기준에 맞춰 다시 정렬(클라 트리 빌더의 root 순서 보존)
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

  /**
   * 댓글 수정
   */
  async updateComment(
    commentId: number,
    userId: string,
    userRole: string,
    content: string
  ): Promise<CommentInstance> {
    const updatedComment = await sequelize.transaction(async t => {
      // LOCK.UPDATE으로 동시 수정 TOCTOU 방지
      const comment = await Comment.findByPk(commentId, { transaction: t, lock: t.LOCK.UPDATE });

      if (!comment) {
        throw new AppError(404, '댓글을 찾을 수 없습니다.');
      }

      // 권한 확인 (admin, manager 또는 작성자 본인)
      const isPrivileged = isAdminOrManager(userRole);
      const isOwner = comment.UserId === userId;

      if (!isPrivileged && !isOwner) {
        throw new AppError(403, '수정 권한이 없습니다.');
      }

      // beforeUpdate 훅이 isEdited/editedAt 자동 설정하므로 content만 전달
      await comment.update({ content: content.trim() }, { transaction: t });

      // 응답용 데이터 조회
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

  /**
   * 댓글 삭제
   */
  async deleteComment(commentId: number, userId: string, userRole: string): Promise<void> {
    await sequelize.transaction(async t => {
      // LOCK.UPDATE으로 동시 삭제 TOCTOU 방지 (updateComment와 동일한 패턴)
      const comment = await Comment.findByPk(commentId, { transaction: t, lock: t.LOCK.UPDATE });

      if (!comment) {
        throw new AppError(404, '댓글을 찾을 수 없습니다.');
      }

      // 권한 확인 (admin, manager 또는 작성자 본인)
      const isPrivileged = isAdminOrManager(userRole);
      const isOwner = comment.UserId === userId;

      if (!isPrivileged && !isOwner) {
        throw new AppError(403, '삭제 권한이 없습니다.');
      }

      // 좋아요 정리: Comment는 paranoid(소프트 삭제)라 comment.destroy()가 FK CASCADE를
      // 발동시키지 않으므로, 남는 CommentLike 행을 같은 트랜잭션에서 명시적으로 제거한다.
      // (소프트 삭제된 댓글은 좋아요 토글 불가(404)이고 표시 시 likeCount 0으로 마스킹되지만,
      //  고아 행이 쌓이지 않도록 정리)
      await CommentLike.destroy({ where: { CommentId: commentId }, transaction: t });

      // soft delete가 model에 설정되어 있으므로 destroy 호출
      await comment.destroy({ transaction: t });
    });
  }
}

export const commentService = new CommentService();
