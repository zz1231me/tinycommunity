// server/src/services/postSearch.service.ts
// 전역 검색(⌘K) — 게시글·위키·이벤트·메모를 한 번에 찾는다.
//
// post.service 에서 분리했다: 게시글 CRUD 와 전혀 다른 관심사인데 300줄을 차지해
// 파일을 읽기 어렵게 만들고 있었다. 접근 가능한 게시판 판정은 최근 글 조회와
// 기준이 같아야 하므로 accessibleBoards 로 공유한다.

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

/**
 * 검색 결과 요약(200자). 평문 컬럼(contentText/bodyText)을 받으므로 태그 제거가 필요 없다.
 * 백필과 모델 훅으로 항상 채워지지만, 방어적으로 null 을 허용한다.
 */
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

  // 접근 가능한 게시판 판정은 최근 글 조회와 동일한 기준을 써야 한다(accessibleBoards 공유).
  // 같은 쿼리를 이 함수 안에 복사해 두지 않는다.
  const accessibleBoardTypes = await getAccessibleBoardTypes(userId, userRole);

  if (accessibleBoardTypes.length === 0) {
    return { results: [], count: 0, query: searchTerm };
  }

  // 꺼진 기능은 검색에도 나오면 안 된다.
  //
  // 위키·메모·일정은 각자의 API 가 마운트 지점에서 requireFeature 로 막혀 있다(index.ts).
  // 그런데 전역 검색은 search.global 하나만 통과하면 되므로, 기능을 꺼도 제목과 본문
  // 요약이 그대로 나오고 눌러서 들어가면 403 이 뜬다 — 스위치를 껐는데 내용은 보이는 셈이다.
  const flags = await featureFlagService.getAll();

  // 이벤트 검색 권한 — admin은 항상 허용, 일반 역할은 EventPermission.canRead 확인.
  // (아래 병렬 조회의 유일한 선행 조건이라 먼저 확인한다)
  let canReadEvents = userRole === ROLES.ADMIN;
  if (!canReadEvents) {
    const ep = await EventPermission.findOne({ where: { roleId: userRole } });
    canReadEvents = ep ? ep.canRead : false; // 권한 레코드 없으면 기본 차단
  }
  // 기능이 꺼져 있으면 권한과 무관하게 뺀다
  canReadEvents = canReadEvents && flags['tools.calendar'] !== false;

  // 게시글·위키·이벤트·메모는 서로 독립적인 조회라 병렬로 보낸다.
  //
  // 각 조회는 요약(200자)에 필요한 평문 컬럼만 선택한다. 원본 HTML(content/body)
  // 전체를 가져오면 본문이 큰 게시글이 여러 건 매치될 때 그만큼 낭비된다.
  // contentText/bodyText 는 부팅 시 백필되고 모델 훅이 갱신하므로 항상 채워져 있다.
  const [posts, wikiPages, events, memos] = await Promise.all([
    // 비밀글은 작성자 본인에게만 노출 (secretType='users' 허용 대상 포함 불가 — SQL JSON 검색 복잡도 문제)
    Post.findAll({
      where: {
        boardType: { [Op.in]: accessibleBoardTypes },
        status: 'published', // 초안/보관 게시글 검색 결과 제외
        [Op.and]: [
          {
            [Op.or]: [{ isSecret: false }, { isSecret: true, UserId: userId }],
          },
          {
            // contentText(평문)로 검색 — 원본 HTML에 LIKE를 걸면 서식 태그가 단어 사이에
            // 끼어 "볼드 이탤릭" 같은 구절이 매치되지 않으므로 평문 컬럼을 사용한다.
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
            // contentText(평문) 검색 — 원본 HTML 태그로 인한 매칭 누락 방지
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
            // bodyText(평문) 검색 — 원본 HTML 태그로 인한 매칭 누락 방지
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

    // 메모 검색 (본인 것만) — 메모는 평문 저장이라 content 를 그대로 쓴다.
    // 기능이 꺼져 있으면 조회하지 않는다.
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
