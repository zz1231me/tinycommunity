// 전역 검색(⌘K). 게시글·위키·이벤트·메모를 한 번에 찾는다.

import { Op } from 'sequelize';
import { Post } from '../models/Post';
import { User } from '../models/User';
import Board from '../models/Board';
import Event from '../models/Event';
import EventPermission from '../models/EventPermission';
import { WikiPage } from '../models/WikiPage';
import { Memo } from '../models/Memo';
import { AppError } from '../middlewares/error.middleware';
import { ROLES } from '../config/constants';
import { extractTextFromContent } from '../utils/contentRenderer';
import { getGlobalSearchLimit } from '../utils/settingsCache';
import { featureFlagService } from './featureFlag.service';
import { getAccessibleBoardTypes } from './accessibleBoards';

export interface SearchPostsParams {
  userId: string;
  userRole: string;
  searchTerm: string;
}

/** 검색 결과 요약(200자). 평문 컬럼(contentText/bodyText)을 받으므로 태그 제거가 필요 없다. */
function summarizeSearchText(text: string | null | undefined): string {
  const plain = (text ?? '').trim();
  return plain.length > 200 ? `${plain.slice(0, 200)}...` : plain;
}

export async function globalSearch(params: SearchPostsParams) {
  const { userId, userRole, searchTerm } = params;

  if (searchTerm.length < 2) {
    throw new AppError(400, '검색어를 2자 이상 입력해주세요.');
  }
  if (searchTerm.length > 100) {
    throw new AppError(400, '검색어는 100자 이내로 입력해주세요.');
  }

  const escapedSearchTerm = searchTerm.replace(/[%_\\]/g, '\\$&');

  // 접근 가능한 게시판 판정은 최근 글 조회와 같은 기준이어야 하므로 accessibleBoards 를 공유한다.
  const accessibleBoardTypes = await getAccessibleBoardTypes(userId, userRole);

  if (accessibleBoardTypes.length === 0) {
    return { results: [], count: 0, query: searchTerm };
  }

  // 꺼진 기능은 검색에도 나오면 안 된다. 전역 검색은 search.global 하나만 통과하므로 여기서 걸러야 한다.
  const flags = await featureFlagService.getAll();

  // 이벤트 검색 권한. admin 은 항상 허용, 그 외 역할은 EventPermission.canRead 를 본다.
  let canReadEvents = userRole === ROLES.ADMIN;
  if (!canReadEvents) {
    const ep = await EventPermission.findOne({ where: { roleId: userRole } });
    canReadEvents = ep ? ep.canRead : false; // 권한 레코드 없으면 기본 차단
  }
  // 기능이 꺼져 있으면 권한과 무관하게 뺀다
  canReadEvents = canReadEvents && flags['tools.calendar'] !== false;

  // 서로 독립적인 조회라 병렬로 보낸다. 요약에 필요한 평문 컬럼만 고른다.
  const [posts, wikiPages, events, memos] = await Promise.all([
    // 비밀글은 작성자 본인에게만 노출한다.
    Post.findAll({
      where: {
        boardType: { [Op.in]: accessibleBoardTypes },
        status: 'published', // 초안/보관 게시글 검색 결과 제외
        [Op.and]: [
          {
            [Op.or]: [{ isSecret: false }, { isSecret: true, UserId: userId }],
          },
          {
            // 원본 HTML 에 LIKE 를 걸면 서식 태그가 단어 사이에 끼므로 평문 컬럼으로 검색한다.
            [Op.or]: [
              { title: { [Op.like]: `%${escapedSearchTerm}%` } },
              { contentText: { [Op.like]: `%${escapedSearchTerm}%` } },
            ],
          },
        ],
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'avatar'],
          required: false,
        },
        {
          model: Board,
          as: 'board',
          attributes: ['name', 'isPersonal'],
          required: false,
        },
      ],
      attributes: ['id', 'title', 'contentText', 'boardType', 'createdAt', 'UserId'],
      order: [['createdAt', 'DESC']],
      limit: getGlobalSearchLimit(),
    }),

    // 위키 검색 (발행된 페이지만). 기능이 꺼져 있으면 조회하지 않는다.
    flags['tools.wiki'] === false
      ? Promise.resolve([])
      : WikiPage.findAll({
          where: {
            isPublished: true,
            // 평문 컬럼으로 검색해 태그로 인한 매칭 누락을 막는다.
            [Op.or]: [
              { title: { [Op.like]: `%${escapedSearchTerm}%` } },
              { contentText: { [Op.like]: `%${escapedSearchTerm}%` } },
            ],
          },
          attributes: ['id', 'slug', 'title', 'contentText', 'createdAt'],
          order: [['updatedAt', 'DESC']],
          limit: getGlobalSearchLimit(),
        }),

    canReadEvents
      ? Event.findAll({
          where: {
            // 평문 컬럼으로 검색해 태그로 인한 매칭 누락을 막는다.
            [Op.or]: [
              { title: { [Op.like]: `%${escapedSearchTerm}%` } },
              { bodyText: { [Op.like]: `%${escapedSearchTerm}%` } },
            ],
          },
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'name'],
              required: false,
            },
          ],
          attributes: ['id', 'title', 'bodyText', 'start', 'end', 'createdAt'],
          order: [['start', 'DESC']],
          limit: getGlobalSearchLimit(),
        })
      : Promise.resolve([]),

    // 메모는 본인 것만 본다. 평문 저장이라 content 를 그대로 쓰고, 기능이 꺼져 있으면 조회하지 않는다.
    flags['tools.memo'] === false
      ? Promise.resolve([])
      : Memo.findAll({
          where: {
            UserId: userId,
            [Op.or]: [
              { title: { [Op.like]: `%${escapedSearchTerm}%` } },
              { content: { [Op.like]: `%${escapedSearchTerm}%` } },
            ],
          },
          attributes: ['id', 'title', 'content', 'createdAt'],
          order: [['updatedAt', 'DESC']],
          limit: getGlobalSearchLimit(),
        }),
  ]);

  const postResults = posts.map(post => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plainPost = post.get({ plain: true }) as any;
    const boardName = plainPost.board?.isPersonal
      ? '📁 나의 개인공간'
      : plainPost.board?.name || plainPost.boardType;

    return {
      id: String(plainPost.id),
      type: 'post' as const,
      title: plainPost.title,
      content: summarizeSearchText(plainPost.contentText),
      boardType: plainPost.boardType,
      boardName,
      createdAt: plainPost.createdAt,
      User: plainPost.user,
    };
  });

  const wikiResults = wikiPages.map(page => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plain = page.get({ plain: true }) as any;
    return {
      id: String(plain.id),
      type: 'wiki' as const,
      title: plain.title,
      content: summarizeSearchText(plain.contentText),
      boardType: 'wiki',
      boardName: '📖 위키',
      slug: plain.slug,
      createdAt: plain.createdAt,
      User: undefined,
    };
  });

  const eventResults = events.map(event => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plain = event.get({ plain: true }) as any;
    return {
      id: String(plain.id),
      type: 'event' as const,
      title: plain.title,
      content: summarizeSearchText(plain.bodyText),
      boardType: 'event',
      boardName: '📅 일정',
      start: plain.start,
      end: plain.end,
      createdAt: plain.createdAt,
      User: plain.user,
    };
  });

  const memoResults = memos.map(memo => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plain = memo.get({ plain: true }) as any;
    return {
      id: String(plain.id),
      type: 'memo' as const,
      title: plain.title || '제목 없음',
      content: extractTextFromContent(plain.content || '', 200),
      boardType: 'memo',
      boardName: '📝 메모',
      createdAt: plain.createdAt,
      User: undefined,
    };
  });

  const results = [...postResults, ...wikiResults, ...eventResults, ...memoResults];
  return { results, count: results.length, query: searchTerm };
}
