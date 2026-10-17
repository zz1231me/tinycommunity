// 한곳에서 보는 활동 피드. 컨플루언스의 activity stream, 지라의 activity 자리다.
//
// 새 글·새 댓글·업무 변경이 게시판마다 흩어져 있어, 무슨 일이 있었는지 보려면 게시판을
// 하나씩 들러야 했다. 읽을 수 있는 게시판의 일만 모아 시간순으로 한 줄씩 보여 준다.
//
// 보여 줄 때 다시 거른다 — 저장 시점에 읽을 수 있었다고 계속 보여 주면 권한을 잃거나
// 글이 비밀글이 된 뒤에도 제목이 새 나간다(역링크와 같은 규칙).

import { Op } from 'sequelize';
import { Post } from '../models/Post';
import { Comment } from '../models/Comment';
import Board from '../models/Board';
import User from '../models/User';
import { PostActivity, type PostActivityKind } from '../models/PostActivity';
import { getAccessibleBoardTypes } from './accessibleBoards';
import { checkSecretPostAccess } from '../utils/postAccess';

/** 한 번에 주는 줄 수의 상한 */
export const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

export type ActivityKind = 'post' | 'comment' | 'task';

export interface ActivityItem {
  /** 종류가 달라도 겹치지 않는 열쇠 */
  id: string;
  kind: ActivityKind;
  at: Date;
  actor: { id: string; name: string } | null;
  postId: string;
  postTitle: string;
  boardType: string;
  boardName: string;
  /** 업무 변경일 때 무엇이 바뀌었는지 ('status' 등) */
  change?: PostActivityKind;
  /** 바뀐 뒤 값. 상태키·사용자 id 그대로 주고 이름 붙이기는 화면이 한다 */
  toValue?: string | null;
}

interface PostRow {
  id: string;
  title: string;
  boardType: string;
  createdAt: Date;
  isSecret: boolean;
  secretType: 'password' | 'users' | null;
  secretUserIds: string[] | null;
  UserId: string | null;
  author: string;
  board?: { name: string } | null;
}

const plain = <T>(row: { get: (o: { plain: true }) => unknown }): T =>
  row.get({ plain: true }) as T;

/**
 * 읽을 수 있는 게시판의 최근 활동. before 를 주면 그보다 이전 것만(이어 보기).
 *
 * 세 갈래를 각각 limit 만큼 읽어 섞고 다시 자른다. 한 갈래가 쏟아져도 다른 갈래가
 * 밀려 사라지지 않도록 각자 limit 을 준다.
 */
export async function listActivity(
  userId: string,
  userRole: string,
  options: { limit?: number; before?: Date } = {}
): Promise<ActivityItem[]> {
  const limit = Math.min(Math.max(1, options.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const accessible = await getAccessibleBoardTypes(userId, userRole);
  if (accessible.length === 0) return [];

  const before = options.before;
  const olderThan = (field: string) => (before ? { [field]: { [Op.lt]: before } } : {});

  const visible = (post: PostRow | undefined | null): post is PostRow =>
    !!post && checkSecretPostAccess(post, userId, userRole).ok;

  const [posts, comments, changes] = await Promise.all([
    Post.findAll({
      where: {
        boardType: { [Op.in]: accessible },
        status: 'published',
        ...olderThan('createdAt'),
      },
      include: [{ model: Board, as: 'board', attributes: ['name'], required: false }],
      attributes: [
        'id',
        'title',
        'boardType',
        'author',
        'createdAt',
        'isSecret',
        'secretType',
        'secretUserIds',
        'UserId',
      ],
      order: [['createdAt', 'DESC']],
      limit,
    }),
    Comment.findAll({
      where: olderThan('createdAt'),
      attributes: ['id', 'author', 'UserId', 'PostId', 'createdAt'],
      order: [['createdAt', 'DESC']],
      // 읽을 수 없는 게시판의 댓글이 섞여 있으므로 넉넉히 읽고 뒤에서 거른다
      limit: limit * 4,
    }),
    PostActivity.findAll({
      where: olderThan('createdAt'),
      include: [{ model: User, as: 'actor', attributes: ['id', 'name'], required: false }],
      attributes: ['id', 'postId', 'actorId', 'kind', 'toValue', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: limit * 4,
    }),
  ]);

  // 댓글·업무 변경이 가리키는 글을 한 번에 읽어 게시판과 비밀글 여부를 본다
  const postIds = [
    ...new Set([...comments.map(c => String(c.PostId)), ...changes.map(a => a.postId)]),
  ];
  const related = new Map<string, PostRow>();
  if (postIds.length > 0) {
    const rows = await Post.findAll({
      where: {
        id: { [Op.in]: postIds },
        boardType: { [Op.in]: accessible },
        status: 'published',
      },
      include: [{ model: Board, as: 'board', attributes: ['name'], required: false }],
      attributes: [
        'id',
        'title',
        'boardType',
        'author',
        'createdAt',
        'isSecret',
        'secretType',
        'secretUserIds',
        'UserId',
      ],
    });
    for (const row of rows) {
      const value = plain<PostRow>(row);
      related.set(value.id, value);
    }
  }

  const items: ActivityItem[] = [];

  for (const row of posts) {
    const post = plain<PostRow>(row);
    if (!visible(post)) continue;
    items.push({
      id: `post:${post.id}`,
      kind: 'post',
      at: post.createdAt,
      actor: post.UserId ? { id: post.UserId, name: post.author } : null,
      postId: post.id,
      postTitle: post.title,
      boardType: post.boardType,
      boardName: post.board?.name ?? post.boardType,
    });
  }

  for (const comment of comments) {
    const post = related.get(String(comment.PostId));
    if (!visible(post)) continue;
    items.push({
      id: `comment:${comment.id}`,
      kind: 'comment',
      at: comment.createdAt,
      actor: comment.UserId ? { id: String(comment.UserId), name: comment.author } : null,
      postId: post.id,
      postTitle: post.title,
      boardType: post.boardType,
      boardName: post.board?.name ?? post.boardType,
    });
  }

  for (const change of changes) {
    const post = related.get(change.postId);
    if (!visible(post)) continue;
    items.push({
      id: `task:${change.id}`,
      kind: 'task',
      at: change.createdAt,
      actor: change.actor ? { id: change.actor.id, name: change.actor.name } : null,
      postId: post.id,
      postTitle: post.title,
      boardType: post.boardType,
      boardName: post.board?.name ?? post.boardType,
      change: change.kind,
      toValue: change.toValue ?? null,
    });
  }

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}
