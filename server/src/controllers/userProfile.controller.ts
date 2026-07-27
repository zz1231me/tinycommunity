import { Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import { sendSuccess, sendError } from '../utils/response';
import { parsePagination } from '../utils/pagination';
import { Post } from '../models/Post';
import { Comment } from '../models/Comment';
import { SecurityLog } from '../models/SecurityLog';
import { Board } from '../models/Board';
import { PostLike } from '../models/PostLike';
import User from '../models/User';
import { Op, fn, col } from 'sequelize';

// GET /api/users/me/posts  → 내 게시글
export const getMyPosts = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { page, limit, offset } = parsePagination(req);

  try {
    const [total, posts] = await Promise.all([
      Post.count({ where: { UserId: userId } }),
      Post.findAll({
        where: { UserId: userId },
        include: [{ model: Board, as: 'board', attributes: ['name'], required: false }],
        attributes: ['id', 'title', 'boardType', 'viewCount', 'createdAt', 'isSecret'],
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      }),
    ]);

    // 댓글 수를 별도로 조회 (GROUP BY 없이 pagination 안전하게)
    const postIds = posts.map(p => p.id);
    const commentCounts: Record<string, number> = {};
    if (postIds.length > 0) {
      const counts = (await Comment.findAll({
        where: { PostId: postIds },
        attributes: ['PostId', [fn('COUNT', col('id')), 'cnt']],
        group: ['PostId'],
        raw: true,
      })) as any[];
      counts.forEach((r: any) => {
        commentCounts[r.PostId] = parseInt(r.cnt, 10);
      });
    }

    sendSuccess(res, {
      posts: posts.map(p => {
        const d = p.get({ plain: true }) as any;
        return {
          id: d.id,
          title: d.title, // 제목 원본 유지, 클라이언트에서 🔒 아이콘 표시
          boardType: d.boardType,
          boardName: d.board?.name || d.boardType,
          viewCount: d.viewCount || 0,
          commentCount: commentCounts[d.id] ?? 0,
          createdAt: d.createdAt,
          isSecret: d.isSecret,
        };
      }),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalCount: total,
      },
    });
  } catch (_err) {
    sendError(res, 500, '내 게시글 조회 실패');
  }
};

// GET /api/users/me/comments  → 내 댓글
export const getMyComments = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { page, limit, offset } = parsePagination(req);

  try {
    const [total, comments] = await Promise.all([
      Comment.count({ where: { UserId: userId } }),
      Comment.findAll({
        where: { UserId: userId },
        include: [
          {
            model: Post,
            as: 'post',
            attributes: ['id', 'title', 'boardType'],
            required: false,
            paranoid: false,
          },
        ],
        attributes: ['id', 'content', 'PostId', 'createdAt'],
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      }),
    ]);

    sendSuccess(res, {
      comments: comments.map(c => {
        const d = c.get({ plain: true }) as any;
        return {
          id: d.id,
          content: d.content.length > 100 ? d.content.slice(0, 100) + '...' : d.content,
          PostId: d.PostId,
          postTitle: d.post?.title || '(삭제된 게시글)',
          boardType: d.post?.boardType || null,
          createdAt: d.createdAt,
        };
      }),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalCount: total,
      },
    });
  } catch (_err) {
    sendError(res, 500, '내 댓글 조회 실패');
  }
};

// GET /api/users/me/security-logs  → 접속 기록
export const getMySecurityLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { page, limit, offset } = parsePagination(req, { defaultLimit: 20 });

  try {
    const [total, logs] = await Promise.all([
      SecurityLog.count({
        where: {
          userId,
          action: { [Op.in]: ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT'] },
        },
      }),
      SecurityLog.findAll({
        where: {
          userId,
          action: { [Op.in]: ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT'] },
        },
        attributes: ['id', 'action', 'ipAddress', 'userAgent', 'createdAt'],
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      }),
    ]);

    sendSuccess(res, {
      logs,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalCount: total,
      },
    });
  } catch (_err) {
    sendError(res, 500, '접속 기록 조회 실패');
  }
};

// GET /api/users/me/activity  → 활동 통계
export const getMyActivity = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;

  try {
    const [postCount, commentCount, likeGiven] = await Promise.all([
      Post.count({ where: { UserId: userId } }),
      Comment.count({ where: { UserId: userId } }),
      // 내가 좋아요 누른 수
      PostLike.count({ where: { UserId: userId } }),
    ]);

    sendSuccess(res, { postCount, commentCount, likeGiven });
  } catch (_err) {
    sendError(res, 500, '활동 통계 조회 실패');
  }
};

// GET /api/users/search?q=name  → 사용자 이름 검색 (비밀글 대상 설정용)
export const searchUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  const q = ((req.query.q as string) || '').trim();
  if (q.length < 1) {
    sendSuccess(res, []);
    return;
  }

  try {
    const escapedQ = q.replace(/[%_\\]/g, '\\$&');
    const users = await User.findAll({
      where: {
        name: { [Op.like]: `%${escapedQ}%` },
        isActive: true,
        isDeleted: false,
      },
      attributes: ['id', 'name'],
      limit: 10,
    });
    sendSuccess(
      res,
      users.map(u => ({ id: u.id, name: u.name }))
    );
  } catch (_err) {
    sendError(res, 500, '사용자 검색 실패');
  }
};
