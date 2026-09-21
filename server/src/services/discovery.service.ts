// 탐색 기능(인기글·관련 글·태그 클라우드). 셋 다 읽을 수 있는 게시판과 비밀글 본인 한정이라는 같은 전제를 쓴다.

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
 * 인기 점수. 좋아요 > 댓글 > 조회 순 가중치. 조회수만으로 정렬하면 낚시 제목이 상위를 차지한다.
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
      // 점수가 같으면 최신 글을 위로 올린다
      order: [
        [literal('score'), 'DESC'],
        ['createdAt', 'DESC'],
      ],
      limit: Math.min(Math.max(1, limit), 30),
      subQuery: false,
    });

    // 점수가 0 인 글은 제외한다.
    return posts
      .map(p => p.get({ plain: true }) as unknown as PlainPost)
      .filter(p => Number(p.score) > 0)
      .map(toListItem);
  },

  /**
   * 관련 글. 태그가 겹치는 글을 먼저 쓰고, 없으면 같은 게시판의 최근 글로 메운다.
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
      // 시각이 같으면 id 로 가른다 — 없으면 페이지 경계에서 글이 중복·누락된다.
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
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
   * 태그 클라우드. 내가 볼 수 있는 글만 세야 접근 못 하는 게시판의 활동량이 새지 않는다.
   */
  async getTagCloud(userId: string, userRole: string, limit = 40) {
    const boardTypes = await getAccessibleBoardTypes(userId, userRole);
    if (boardTypes.length === 0) return [];

    const boardList = boardTypes.map(b => sequelize.escape(b)).join(', ');
    const countSql =
      `(SELECT COUNT(*) FROM PostTags AS pt JOIN Posts AS p ON p.id = pt.PostId ` +
      `WHERE pt.TagId = Tag.id AND p.deletedAt IS NULL AND p.status = 'published' ` +
      `AND p.boardType IN (${boardList}) ` +
      // NOT p.isSecret 형태여야 MySQL·SQLite·PostgreSQL 모두에서 통한다. `= 0` 은 PostgreSQL 에서 타입 오류.
      `AND (NOT p.isSecret OR p.UserId = ${sequelize.escape(userId)}))`;

    const tags = await Tag.findAll({
      attributes: ['id', 'name', 'color', 'boardId', [literal(countSql), 'postCount']],
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
