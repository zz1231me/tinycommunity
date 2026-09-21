// 게시글 스크랩. 목록을 돌려줄 때 지금도 읽을 수 있는 글인지 다시 검사한다.

import { Op, literal, UniqueConstraintError } from 'sequelize';
import { sequelize } from '../config/sequelize';
import { Post } from '../models/Post';
import { PostScrap } from '../models/PostScrap';
import User from '../models/User';
import Board from '../models/Board';
import { AppError } from '../middlewares/error.middleware';
import { checkSecretPostAccess } from '../utils/postAccess';
import { getAccessibleBoardTypes } from './accessibleBoards';
import { buildPagination } from '../utils/pagePayload';

/** 글이 정말 그 게시판 소속인지, 보는 사람이 볼 수 있는 글인지 확인한다. */
async function assertPostReachable(
  postId: string,
  boardType: string,
  userId: string,
  userRole?: string
): Promise<void> {
  const post = await Post.findByPk(postId, {
    attributes: ['id', 'boardType', 'isSecret', 'secretType', 'secretUserIds', 'UserId'],
  });
  // 다른 게시판의 글이면 없는 글과 똑같이 답해 존재를 알려 주지 않는다.
  if (!post || post.boardType !== boardType) {
    throw new AppError(404, '게시글을 찾을 수 없습니다.');
  }
  const access = checkSecretPostAccess(post, userId, userRole);
  if (!access.ok) throw new AppError(403, access.message);
}

export const postScrapService = {
  /** 주소로 들어오는 엔드포인트용. 이미 확인을 마친 곳에서는 부르지 않는다. */
  assertReachable: assertPostReachable,

  /** 스크랩 토글. 돌려주는 값은 토글 이후 상태다. */
  async toggle(
    postId: string,
    userId: string,
    boardType: string,
    userRole?: string
  ): Promise<{ scrapped: boolean }> {
    await assertPostReachable(postId, boardType, userId, userRole);

    const existing = await PostScrap.findOne({ where: { PostId: postId, UserId: userId } });
    if (existing) {
      await existing.destroy();
      return { scrapped: false };
    }
    try {
      await PostScrap.create({ PostId: postId, UserId: userId });
    } catch (err) {
      // 동시에 두 번 눌러 유니크 제약에 걸린 경우는 이미 만들어진 것으로 본다.
      if (!(err instanceof UniqueConstraintError)) throw err;
    }
    return { scrapped: true };
  },

  /** 스크랩 여부만 본다. 인가는 하지 않으므로 호출부가 먼저 확인해야 한다. */
  async isScrapped(postId: string, userId: string): Promise<boolean> {
    const found = await PostScrap.findOne({
      where: { PostId: postId, UserId: userId },
      attributes: ['id'],
    });
    return !!found;
  },

  /** 내 스크랩 목록 (최신 스크랩 순) */
  async list(userId: string, userRole: string, page = 1, limit = 20) {
    const boardTypes = await getAccessibleBoardTypes(userId, userRole);
    if (boardTypes.length === 0) {
      return { posts: [], pagination: buildPagination(1, limit, 0) };
    }

    const safeLimit = Math.min(Math.max(1, limit), 50);
    const safePage = Math.max(1, page);
    const me = sequelize.escape(userId);

    // 별칭 인용 문법이 DB 마다 달라서 PostScrap 대신 Post 를 주 모델로 두고 EXISTS 로 좁힌다.
    const scrapExists = `EXISTS(SELECT 1 FROM PostScraps AS ps WHERE ps.PostId = Post.id AND ps.UserId = ${me})`;
    const scrappedAt = `(SELECT ps.createdAt FROM PostScraps AS ps WHERE ps.PostId = Post.id AND ps.UserId = ${me})`;

    const { rows, count } = await Post.findAndCountAll({
      where: {
        boardType: { [Op.in]: boardTypes },
        status: 'published',
        [Op.or]: [{ isSecret: false }, { isSecret: true, UserId: userId }],
        [Op.and]: [literal(scrapExists)],
      },
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'avatar'], required: false },
        { model: Board, as: 'board', attributes: ['name'], required: false },
      ],
      attributes: [
        'id',
        'title',
        'boardType',
        'createdAt',
        'viewCount',
        [
          literal(
            '(SELECT COUNT(*) FROM comments AS c WHERE c.PostId = Post.id AND c.deletedAt IS NULL)'
          ),
          'commentCount',
        ],
        [literal(scrappedAt), 'scrappedAt'],
      ],
      // 시각이 같을 때 id 로 가르지 않으면 페이지 경계에서 글이 중복되거나 빠진다.
      order: [
        [literal('scrappedAt'), 'DESC'],
        ['id', 'DESC'],
      ],
      limit: safeLimit,
      offset: (safePage - 1) * safeLimit,
      subQuery: false,
    });

    const posts = rows.map(row => {
      const plain = row.get({ plain: true }) as unknown as {
        id: string;
        title: string;
        boardType: string;
        createdAt: Date;
        viewCount: number | null;
        commentCount: unknown;
        scrappedAt: Date | string;
        user?: { name: string; avatar: string | null } | null;
        board?: { name: string } | null;
      };
      return {
        id: plain.id,
        title: plain.title,
        boardType: plain.boardType,
        boardName: plain.board?.name ?? plain.boardType,
        author: plain.user?.name ?? '알 수 없음',
        authorAvatar: plain.user?.avatar ?? null,
        viewCount: plain.viewCount ?? 0,
        commentCount: Number(plain.commentCount) || 0,
        createdAt: plain.createdAt,
        scrappedAt: plain.scrappedAt,
      };
    });

    return {
      posts,
      pagination: buildPagination(safePage, safeLimit, count),
    };
  },
};
