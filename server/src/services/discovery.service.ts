// server/src/services/discovery.service.ts
// "읽을 만한 글을 어떻게 찾게 할 것인가" 를 담당한다 — 인기글, 관련 글, 태그 클라우드.
//
// 세 기능이 한 파일에 있는 이유: 셋 다 "이 사용자가 읽을 수 있는 게시판" 과
// "비밀글은 본인 것만" 이라는 같은 전제 위에서만 성립한다. 이 전제가 한 곳에
// 있어야 셋 중 하나만 조건이 어긋나 남의 글이 새는 일이 없다.

import { Op, literal } from 'sequelize';
import { sequelize } from '../config/sequelize';
import { Post } from '../models/Post';
import User from '../models/User';
import Board from '../models/Board';
import { Tag } from '../models/Tag';
import { getAccessibleBoardTypes } from './accessibleBoards';
import { buildPagination } from '../utils/pagePayload';

/** 인기 집계 기간 */
export type PopularPeriod = 'week' | 'month' | 'all';

const PERIOD_DAYS: Record<PopularPeriod, number | null> = {
  week: 7,
  month: 30,
  all: null,
};

/**
 * 인기 점수. 좋아요 > 댓글 > 조회 순으로 가중치를 둔다 —
 * 조회는 실수로도 올라가지만 좋아요와 댓글은 사람이 의도해야 올라간다.
 * 조회수만으로 정렬하면 낚시 제목이 상위를 차지한다.
 */
const SCORE_SQL =
  '(SELECT COUNT(*) FROM PostLikes AS pl WHERE pl.PostId = Post.id) * 3 + ' +
  '(SELECT COUNT(*) FROM comments AS c WHERE c.PostId = Post.id AND c.deletedAt IS NULL) * 2 + ' +
  'Post.viewCount * 0.5';

/** 읽을 수 있는 게시판 + 비밀글은 본인 것만 — 모든 탐색 질의의 공통 전제 */
function visibleWhere(boardTypes: string[], userId: string) {
  return {
    boardType: { [Op.in]: boardTypes },
    status: 'published' as const,
    [Op.or]: [{ isSecret: false }, { isSecret: true, UserId: userId }],
  };
}

const LIST_INCLUDE = [
  { model: User, as: 'user', attributes: ['id', 'name', 'avatar'], required: false },
  { model: Board, as: 'board', attributes: ['name'], required: false },
];

const LIST_ATTRIBUTES = [
  'id',
  'title',
  'boardType',
  'createdAt',
  'viewCount',
  [literal('(SELECT COUNT(*) FROM PostLikes AS pl WHERE pl.PostId = Post.id)'), 'likeCount'],
  [
    literal(
      '(SELECT COUNT(*) FROM comments AS c WHERE c.PostId = Post.id AND c.deletedAt IS NULL)'
    ),
    'commentCount',
  ],
] as const;

interface PlainPost {
  id: string;
  title: string;
  boardType: string;
  createdAt: Date;
  viewCount: number | null;
  likeCount: unknown;
  commentCount: unknown;
  score?: unknown;
  user?: { id: string; name: string; avatar: string | null } | null;
  board?: { name: string } | null;
}

function toListItem(plain: PlainPost) {
  return {
    id: plain.id,
    title: plain.title,
    boardType: plain.boardType,
    boardName: plain.board?.name ?? plain.boardType,
    author: plain.user?.name ?? '알 수 없음',
    authorAvatar: plain.user?.avatar ?? null,
    viewCount: plain.viewCount ?? 0,
    likeCount: Number(plain.likeCount) || 0,
    commentCount: Number(plain.commentCount) || 0,
    createdAt: plain.createdAt,
  };
}

export const discoveryService = {
  /** 인기글 — 기간 안의 글을 인기 점수 순으로 */
  async getPopularPosts(
    userId: string,
    userRole: string,
    period: PopularPeriod = 'week',
    limit = 10
  ) {
    const boardTypes = await getAccessibleBoardTypes(userId, userRole);
    if (boardTypes.length === 0) return [];

    const days = PERIOD_DAYS[period];
    const where: Record<string | symbol, unknown> = visibleWhere(boardTypes, userId);
    if (days !== null) {
      where.createdAt = { [Op.gte]: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
    }

    const posts = await Post.findAll({
      where,
      include: LIST_INCLUDE,
      attributes: [...LIST_ATTRIBUTES, [literal(SCORE_SQL), 'score']],
      // 점수가 같으면 최신 글을 위로 — 오래된 글이 상단을 영구히 점유하지 않게 한다
      order: [
        [literal('score'), 'DESC'],
        ['createdAt', 'DESC'],
      ],
      limit: Math.min(Math.max(1, limit), 30),
      subQuery: false,
    });

    // 점수가 0 인 글은 제외한다. 활동이 없는 게시판에서 목록을 채우려고 방금 쓴 글을
    // 올리면 인기글 목록의 의미가 없어진다.
    return posts
      .map(p => p.get({ plain: true }) as unknown as PlainPost)
      .filter(p => Number(p.score) > 0)
      .map(toListItem);
  },

  /**
   * 관련 글 — 태그가 겹치는 글을 먼저, 없으면 같은 게시판의 최근 글.
   * 태그가 하나도 안 겹치는데 "관련 글" 이라고 내보내면 추천이 아니라 소음이므로,
   * 폴백은 같은 게시판이라는 최소한의 근거가 있을 때만 쓴다.
   */
  async getRelatedPosts(postId: string, userId: string, userRole: string, limit = 5) {
    const post = await Post.findByPk(postId, { attributes: ['id', 'boardType'] });
    if (!post) return [];

    const boardTypes = await getAccessibleBoardTypes(userId, userRole);
    if (!boardTypes.includes(post.boardType)) return [];

    const capped = Math.min(Math.max(1, limit), 20);
    const base = visibleWhere(boardTypes, userId);

    const byTag = await Post.findAll({
      where: {
        ...base,
        id: { [Op.ne]: postId },
        [Op.and]: [
          literal(
            `EXISTS(SELECT 1 FROM PostTags AS pt WHERE pt.PostId = Post.id AND pt.TagId IN ` +
              `(SELECT TagId FROM PostTags WHERE PostId = ${sequelize.escape(postId)}))`
          ),
        ],
      },
      include: LIST_INCLUDE,
      attributes: [
        ...LIST_ATTRIBUTES,
        [
          literal(
            `(SELECT COUNT(*) FROM PostTags AS pt WHERE pt.PostId = Post.id AND pt.TagId IN ` +
              `(SELECT TagId FROM PostTags WHERE PostId = ${sequelize.escape(postId)}))`
          ),
          'sharedTags',
        ],
      ],
      order: [
        [literal('sharedTags'), 'DESC'],
        ['createdAt', 'DESC'],
      ],
      limit: capped,
      subQuery: false,
    });

    if (byTag.length >= capped) {
      return byTag.map(p => toListItem(p.get({ plain: true }) as unknown as PlainPost));
    }

    // 태그로 채우지 못한 자리만 같은 게시판 최근 글로 메운다
    const exclude = [postId, ...byTag.map(p => p.id)];
    const sameBoard = await Post.findAll({
      where: {
        ...base,
        boardType: post.boardType,
        id: { [Op.notIn]: exclude },
      },
      include: LIST_INCLUDE,
      attributes: [...LIST_ATTRIBUTES],
      order: [['createdAt', 'DESC']],
      limit: capped - byTag.length,
      subQuery: false,
    });

    return [...byTag, ...sameBoard].map(p =>
      toListItem(p.get({ plain: true }) as unknown as PlainPost)
    );
  },

  /** 특정 태그가 붙은 글 (태그 클라우드에서 눌렀을 때) */
  async getPostsByTag(tagId: number, userId: string, userRole: string, page = 1, limit = 20) {
    const boardTypes = await getAccessibleBoardTypes(userId, userRole);
    if (boardTypes.length === 0) {
      return { posts: [], pagination: buildPagination(1, limit, 0) };
    }

    const safeLimit = Math.min(Math.max(1, limit), 50);
    const safePage = Math.max(1, page);

    const { rows, count } = await Post.findAndCountAll({
      where: {
        ...visibleWhere(boardTypes, userId),
        [Op.and]: [
          literal(
            `EXISTS(SELECT 1 FROM PostTags AS pt WHERE pt.PostId = Post.id AND pt.TagId = ${sequelize.escape(tagId)})`
          ),
        ],
      },
      include: LIST_INCLUDE,
      attributes: [...LIST_ATTRIBUTES],
      order: [['createdAt', 'DESC']],
      limit: safeLimit,
      offset: (safePage - 1) * safeLimit,
      subQuery: false,
    });

    return {
      posts: rows.map(p => toListItem(p.get({ plain: true }) as unknown as PlainPost)),
      pagination: buildPagination(safePage, safeLimit, count),
    };
  },

  /**
   * 태그 클라우드 — 태그별로 "내가 볼 수 있는 글" 이 몇 개인지.
   * 전체 글 수로 세면 접근 못 하는 게시판의 활동량이 태그 크기로 새어 나온다.
   */
  async getTagCloud(userId: string, userRole: string, limit = 40) {
    const boardTypes = await getAccessibleBoardTypes(userId, userRole);
    if (boardTypes.length === 0) return [];

    const boardList = boardTypes.map(b => sequelize.escape(b)).join(', ');
    const countSql =
      `(SELECT COUNT(*) FROM PostTags AS pt JOIN Posts AS p ON p.id = pt.PostId ` +
      `WHERE pt.TagId = Tag.id AND p.deletedAt IS NULL AND p.status = 'published' ` +
      `AND p.boardType IN (${boardList}) ` +
      // NOT p.isSecret — MySQL(tinyint)/SQLite(0·1)/PostgreSQL(boolean) 어디서나 통하는 형태.
      // `= 0` 으로 쓰면 PostgreSQL 에서 타입 오류가 난다.
      `AND (NOT p.isSecret OR p.UserId = ${sequelize.escape(userId)}))`;

    const tags = await Tag.findAll({
      attributes: ['id', 'name', 'color', 'boardId', [literal(countSql), 'postCount']],
      // 글이 하나도 없는 태그는 클라우드에 띄울 이유가 없다
      having: literal('postCount > 0'),
      group: ['Tag.id'],
      order: [[literal('postCount'), 'DESC']],
      limit: Math.min(Math.max(1, limit), 100),
    });

    return tags.map(t => {
      const plain = t.get({ plain: true }) as unknown as {
        id: number;
        name: string;
        color: string;
        boardId: string | null;
        postCount: unknown;
      };
      return {
        id: plain.id,
        name: plain.name,
        color: plain.color,
        boardId: plain.boardId,
        postCount: Number(plain.postCount) || 0,
      };
    });
  },
};
