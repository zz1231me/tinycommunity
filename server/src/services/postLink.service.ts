// 글 사이의 링크를 모아 둔다. 글 화면이 '이 글을 가리키는 글'(역링크)을 보여 주는 데 쓴다.
//
// 본문에 다른 글의 주소가 들어 있으면 그 쌍을 한 줄로 남긴다. 저장할 때마다 그 글이 가진
// 링크를 통째로 다시 쓴다 — 본문에서 링크를 지우면 줄도 사라져야 한다.
//
// 보여 줄 때는 보는 사람 기준으로 다시 거른다. 저장 시점에 읽을 수 있었다고 계속 보여 주면
// 게시판 권한을 잃거나 글이 비밀글이 된 뒤에도 제목이 새 나간다.

import { Op } from 'sequelize';
import { Post } from '../models/Post';
import Board from '../models/Board';
import { PostLink } from '../models/PostLink';
import { getAccessibleBoardTypes } from './accessibleBoards';
import { checkSecretPostAccess } from '../utils/postAccess';
import { logError } from '../utils/logger';

/** 한 글에 담아 둘 링크 수 상한. 본문에 주소를 수백 개 넣어도 줄이 폭증하지 않게 한다. */
const MAX_LINKS = 50;

/**
 * 본문에서 다른 글의 id 를 뽑는다.
 * `/dashboard/posts/<게시판>/<글id>` 를 찾는다 — 상대 주소와 전체 주소 모두.
 * 글 id 는 영문 대문자·숫자 12자다(nanoid 계열). 뒤에 /edit 같은 것이 붙어도 id 만 집는다.
 */
export function extractPostLinks(content: string): string[] {
  const found = new Set<string>();
  const re = /\/dashboard\/posts\/[A-Za-z0-9_-]+\/([A-Z0-9]{8,32})\b/g;
  for (const m of (content ?? '').matchAll(re)) {
    found.add(m[1]);
    if (found.size >= MAX_LINKS) break;
  }
  return [...found];
}

/**
 * 한 글의 링크를 다시 쓴다. 저장 흐름에서 부르며 실패해도 글 저장을 막지 않는다.
 * 없는 글을 가리키는 주소는 버린다(지워진 글·오타).
 */
export async function syncPostLinks(fromPostId: string, content: string): Promise<void> {
  try {
    const ids = extractPostLinks(content).filter(id => id !== fromPostId);
    const existing =
      ids.length > 0
        ? await Post.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id'] })
        : [];
    const valid = existing.map(p => p.id);

    await PostLink.destroy({ where: { fromPostId } });
    if (valid.length > 0) {
      await PostLink.bulkCreate(valid.map(toPostId => ({ fromPostId, toPostId })));
    }
  } catch (err) {
    logError('글 링크 갱신 실패', err, { fromPostId });
  }
}

export interface Backlink {
  id: string;
  title: string;
  boardType: string;
  boardName: string;
  author: string;
  createdAt: Date;
}

/** 이 글을 가리키는 글들. 보는 사람이 지금 읽을 수 있는 것만. */
export async function listBacklinks(
  toPostId: string,
  userId: string,
  userRole: string
): Promise<Backlink[]> {
  const links = await PostLink.findAll({ where: { toPostId }, attributes: ['fromPostId'] });
  if (links.length === 0) return [];

  const accessible = await getAccessibleBoardTypes(userId, userRole);
  if (accessible.length === 0) return [];

  const posts = await Post.findAll({
    where: {
      id: { [Op.in]: links.map(l => l.fromPostId) },
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
      // 비밀글 판정에 필요한 것들
      'isSecret',
      'secretType',
      'secretUserIds',
      'UserId',
    ],
    order: [['createdAt', 'DESC']],
    limit: MAX_LINKS,
  });

  return posts
    .filter(p => checkSecretPostAccess(p, userId, userRole).ok)
    .map(p => {
      const plain = p.get({ plain: true }) as unknown as {
        id: string;
        title: string;
        boardType: string;
        author: string;
        createdAt: Date;
        board?: { name: string } | null;
      };
      return {
        id: plain.id,
        title: plain.title,
        boardType: plain.boardType,
        boardName: plain.board?.name ?? plain.boardType,
        author: plain.author,
        createdAt: plain.createdAt,
      };
    });
}
