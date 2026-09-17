// server/src/services/postScrap.service.ts
// 게시글 스크랩(나중에 보기).
//
// 목록을 돌려줄 때 "지금도 읽을 수 있는가" 를 다시 검사한다 — 스크랩한 뒤에
// 게시판 권한이 회수되거나 글이 비밀글로 바뀔 수 있고, 그때 스크랩이
// 우회 경로가 되면 안 된다.

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

/**
 * 이 글이 정말 그 게시판의 글이고, 보는 사람이 볼 수 있는 글인가.
 *
 * 라우트는 주소의 :boardType 으로 '그 게시판을 읽을 수 있는가' 만 본다. 글이 정말
 * 그 게시판 소속인지는 따로 확인하지 않으면, 읽을 수 있는 게시판 이름을 붙여 다른
 * 게시판의 글에 손댈 수 있다 — 없는 id 는 404, 있는 id 는 200 이라 남의 게시판에
 * 어떤 글이 있는지 훑는 창구가 되고, 남의 비밀글도 스크랩된다.
 *
 * 좋아요·태그·댓글·읽음은 모두 이 교차 확인을 하고 각각 주석까지 달려 있었다.
 * 스크랩만 빠져 있었다.
 */
async function assertPostReachable(
  postId: string,
  boardType: string,
  userId: string,
  userRole?: string
): Promise<void> {
  const post = await Post.findByPk(postId, {
    attributes: ['id', 'boardType', 'isSecret', 'secretType', 'secretUserIds', 'UserId'],
  });
  // 다른 게시판의 글이면 '없는 글' 과 똑같이 답한다 — 존재를 알려 주지 않는다
  if (!post || post.boardType !== boardType) {
    throw new AppError(404, '게시글을 찾을 수 없습니다.');
  }
  const access = checkSecretPostAccess(post, userId, userRole);
  if (!access.ok) throw new AppError(403, access.message);
}

export const postScrapService = {
  /**
   * 주소의 게시판과 글이 맞는지, 볼 수 있는 글인지 확인한다.
   *
   * 주소(:boardType/:id)로 들어오는 스크랩 엔드포인트가 쓴다. 글 상세처럼 이미
   * 확인을 마친 곳에서는 부르지 않는다 — 같은 글을 한 번 더 읽게 되기 때문이다.
   */
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
      // 버튼을 빠르게 두 번 누르면 두 요청이 모두 '없음' 을 보고 동시에 만들려 든다.
      // 유니크 제약이 데이터는 지켜 주지만, 진 쪽이 그대로 터지면 사용자에게는 500 이 뜬다.
      // 이미 만들어졌다는 뜻이므로 결과 상태만 돌려준다.
      if (!(err instanceof UniqueConstraintError)) throw err;
    }
    return { scrapped: true };
  },

  /**
   * 스크랩했는지만 본다. 여기서는 인가하지 않는다.
   *
   * 글 상세(loadViewerState)도 이 함수를 부르는데, 그 경로는 이미 게시판 권한과
   * 비밀글 접근을 확인한 뒤다. 여기에 확인을 넣으면 글을 열 때마다 같은 글을 한 번 더
   * 읽게 된다. 주소로 들어오는 엔드포인트는 assertReachable 을 먼저 부른다.
   */
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

    // PostScrap 이 아니라 Post 를 주 모델로 두고 EXISTS 로 좁힌다.
    // 스크랩을 주 모델로 하면 상관 서브쿼리에서 조인된 Post 의 별칭을 인용해야 하는데,
    // 그 인용 문법이 MySQL(백틱)과 PostgreSQL(큰따옴표)에서 다르다.
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
      // 시각이 같으면 id 로 가른다 — 없으면 페이지 경계에서 글이 중복·누락된다.
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
