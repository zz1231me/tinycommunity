// server/src/controllers/post.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import {
  sendSuccess,
  sendError,
  sendNotFound,
  sendForbidden,
  sendValidationError,
  sendServiceError,
} from '../utils/response';
import fs from 'fs/promises';
import { logInfo, logError, logSuccess } from '../utils/logger';
import { postService } from '../services/post.service';
import { securityLogService } from '../services/securityLog.service';
import { auditLogService } from '../services/auditLog.service';
import { renderContentToHTML } from '../utils/contentRenderer';
import { parsePagination } from '../utils/pagination';
import { AppError } from '../middlewares/error.middleware';
import { notifyMentions } from '../services/mention.service';
import { subscriptionService } from '../services/subscription.service';
import { globalSearch as globalSearchPosts } from '../services/postSearch.service';
import { isWorkStatus } from '../config/workStatus';
import { likeService } from '../services/like.service';
import { postScrapService } from '../services/postScrap.service';
import { featureFlagService } from '../services/featureFlag.service';
import { isAdminOrManager } from '../config/constants';
import { User } from '../models/User';

interface PostLike {
  id: string;
  title: string;
  content: string;
  author: string;
  UserId: string;
  boardType: string;
  viewCount: number;
  isPinned: boolean;
  pinnedUntil?: Date | null;
  isSecret: boolean;
  secretType: string | null;
  isEncrypted: boolean;
  secretSalt: string | null;
  createdAt: Date;
  updatedAt: Date;
  user?: { id: string; name: string; avatar: string | null } | null;
  workStatus?: string;
  assignee?: { id: string; name: string; avatar: string | null } | null;
  board?: { id: string; name: string; taskEnabled: boolean } | null;
}

/**
 * 이 글을 보는 사람의 상태 — 좋아요·스크랩·관리 권한.
 *
 * 글과 함께 내려 준다. 따로 물으면 /like, /scrap, /board-managers/check 세 요청이
 * 인증·게시판 권한 검사를 각각 다시 해서 글 하나를 여는 데 왕복이 넷이 된다.
 *
 * 꺼진 기능은 묻지 않는다 — 좋아요를 끈 사이트에서 좋아요 수를 세지 않는다.
 */
async function loadViewerState(
  postId: string,
  userId: string | undefined,
  canManage: boolean
): Promise<{ liked: boolean; likeCount: number; scrapped: boolean; canManage: boolean }> {
  const [likeEnabled, scrapEnabled] = await Promise.all([
    featureFlagService.isEnabled('post.like'),
    featureFlagService.isEnabled('post.scrap'),
  ]);

  const [like, scrapped] = await Promise.all([
    userId && likeEnabled
      ? likeService.getLikeStatus(postId, userId)
      : Promise.resolve({ liked: false, likeCount: 0 }),
    userId && scrapEnabled ? postScrapService.isScrapped(postId, userId) : Promise.resolve(false),
  ]);

  return { liked: like.liked, likeCount: like.likeCount, scrapped, canManage };
}

/**
 * '지정한 사람만' 비밀글의 허용 목록 — 이 글을 고칠 수 있는 사람에게만 준다.
 *
 * 응답에서 빼면 편집 화면의 사람 고르기 칸이 비어 있게 되고, 거기서 한 명을 추가해
 * 저장하면 목록이 그 한 명으로 교체돼 원래 허용됐던 사람들이 빠진다.
 *
 * 누가 이 비공개 글을 읽을 수 있는지는 그 자체로 민감하므로, 이미 그 목록을 바꿀 수 있는
 * 사람(작성자·관리자/매니저·게시판 담당자)에게만 내려준다.
 */
async function loadSecretAllowedUsers(
  post: {
    isSecret: boolean;
    secretType: string | null;
    secretUserIds: string[] | null;
    UserId: string;
  },
  userId: string | undefined,
  userRole: string | undefined,
  canManage: boolean
): Promise<{ id: string; name: string }[] | undefined> {
  if (!post.isSecret || post.secretType !== 'users') return undefined;
  const mayEdit =
    (userId !== undefined && post.UserId === userId) ||
    (userRole !== undefined && isAdminOrManager(userRole)) ||
    canManage;
  if (!mayEdit) return undefined;

  const ids = post.secretUserIds ?? [];
  if (ids.length === 0) return [];
  const users = await User.findAll({ where: { id: ids }, attributes: ['id', 'name'] });
  return users.map(u => ({ id: u.id, name: u.name }));
}

/**
 * 이 글에 붙은 태그.
 *
 * 글을 읽을 때 함께 조인해 오므로 상세 화면에서 추가 조회가 없다.
 * 태그 기능이 꺼져 있으면 빈 배열이다(전용 라우트도 같은 스위치로 막혀 있다).
 */
async function pickTags(postData: { tags?: unknown[] }): Promise<unknown[]> {
  if (!(await featureFlagService.isEnabled('post.tags'))) return [];
  return postData.tags ?? [];
}

// 게시글 데이터를 응답 형식으로 변환하는 헬퍼
function formatPostResponse(
  post: PostLike,
  user: PostLike['user'],
  attachments: unknown[],
  htmlContent: string,
  viewer?: Awaited<ReturnType<typeof loadViewerState>>,
  tags?: unknown[],
  secretAllowedUsers?: { id: string; name: string }[]
) {
  return {
    id: post.id,
    title: post.title,
    content: htmlContent,
    rawContent: post.content,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    author: post.user?.name || post.author || 'Unknown',
    UserId: post.UserId,
    boardType: post.boardType,
    viewCount: post.viewCount || 0,
    isPinned: post.isPinned || false,
    // 목록과 마찬가지로 만료 시각도 내려준다. 상세에서 빠지면 기간을 정해 고정해도
    // 글을 열었을 때 남은 기간을 알 수 없다.
    pinnedUntil: post.pinnedUntil ?? null,
    isSecret: post.isSecret || false,
    secretType: post.secretType || null,
    isEncrypted: post.isEncrypted || false,
    // secretSalt는 E2EE 게시글에서만 노출 (일반 게시글에서 유출 방지)
    secretSalt: post.isEncrypted ? post.secretSalt || null : null,
    // 고칠 수 있는 사람에게만 채워진다 (loadSecretAllowedUsers 주석 참고)
    secretAllowedUsers,
    // 업무 상태와 담당자는 글을 열자마자 보여야 한다 — 별도 요청으로 미루면
    // 본문은 떠 있는데 상태 줄만 뒤늦게 나타나 화면이 흔들린다
    workStatus: post.workStatus || 'none',
    assignee: post.assignee
      ? { id: post.assignee.id, name: post.assignee.name, avatar: post.assignee.avatar ?? null }
      : null,
    // 게시판 이름과 용도 — 화면이 게시판 목록을 따로 뒤지지 않아도 되게
    board: post.board
      ? { id: post.board.id, name: post.board.name, taskEnabled: !!post.board.taskEnabled }
      : null,
    attachments,
    user,
    // 보는 사람에 따라 달라지는 값들. 이 응답이 캐시되지 않는 이유이기도 하다.
    ...(viewer ? { viewer } : {}),
    ...(tags ? { tags } : {}),
  };
}

/**
 * 허용 사용자 목록을 읽는다.
 *
 * 글 작성·수정은 첨부 때문에 multipart 로 나가고 multipart 필드는 전부 문자열이라,
 * 화면이 JSON.stringify 로 보낸 배열이 서버에서는 문자열로 도착한다.
 * 그래서 JSON 본문(배열)과 multipart(문자열) 양쪽을 받는다.
 *
 * 형식이 아니면 undefined 로 두어 "건드리지 않음" 이 되게 한다(수정 시 기존 목록 유지).
 */
function parseUserIdList(value: unknown): string[] | undefined {
  const raw = typeof value === 'string' ? safeJsonArray(value) : value;
  if (!Array.isArray(raw)) return undefined;
  const ids = raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return ids;
}

function safeJsonArray(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function toAppError(err: unknown): AppError | null {
  return err instanceof AppError ? err : null;
}

// 글로벌 검색
export const globalSearch = async (req: AuthRequest, res: Response): Promise<void> => {
  const searchTerm = (req.query.q?.toString() ?? '').trim();
  const { id: userId, role: userRole } = req.user;

  try {
    const result = await globalSearchPosts({ userId, userRole, searchTerm });
    logInfo('글로벌 검색 완료', { userId, searchTerm, count: result.count });
    sendSuccess(res, result);
  } catch (err) {
    const appErr = toAppError(err);
    if (appErr?.statusCode === 400) {
      return sendValidationError(res, 'q', appErr.message);
    }
    logError('글로벌 검색 실패', err, { userId, searchTerm });
    sendError(res, 500, '검색 중 오류가 발생했습니다.');
  }
};

// 접근 가능한 게시판들의 최신 게시글 (헤더 드롭다운용)
export const getRecentPosts = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: userId, role: userRole } = req.user;
  try {
    const posts = await postService.getRecentPosts(userId, userRole, 8);
    sendSuccess(res, posts);
  } catch (err) {
    logError('최신 게시물 조회 실패', err, { userId });
    sendError(res, 500, '최신 게시물을 불러오지 못했습니다.');
  }
};

// 게시글 목록 조회
export const getPosts = async (req: AuthRequest, res: Response): Promise<void> => {
  const boardType = req.params.boardType;
  const { page, limit } = parsePagination(req);
  const search = (req.query.search?.toString() ?? '').trim();
  const userId = req.user?.id;

  // 태그 필터: ?tags=1,2,3 형식으로 전달
  const rawTags = req.query.tags?.toString() ?? '';
  const tagIds = rawTags
    ? rawTags
        .split(',')
        .slice(0, 20)
        .map(t => parseInt(t.trim(), 10))
        .filter(n => Number.isFinite(n) && n > 0)
    : undefined;

  // 업무 상태 필터: ?workStatus=todo,doing
  const rawStatus = req.query.workStatus?.toString() ?? '';
  const workStatuses = rawStatus
    ? rawStatus
        .split(',')
        .map(s => s.trim())
        .filter(isWorkStatus)
    : undefined;

  try {
    const result = await postService.getPosts(
      boardType,
      page,
      limit,
      search,
      userId,
      tagIds,
      workStatuses
    );
    sendSuccess(res, result);
  } catch (err) {
    logError('게시글 목록 조회 실패', err, { boardType, page, limit });
    sendError(res, 500, '게시글 목록 조회 실패');
  }
};

// 게시글 상세 조회
export const getPostById = async (req: AuthRequest, res: Response): Promise<void> => {
  const { boardType, id } = req.params;
  const userId = req.user?.id;
  const userRole = req.user?.role;

  try {
    // boardType을 서비스에 전달 — 조회수 증가 전에 boardType 검증되어 viewCount 인플레이션 차단
    const result = await postService.getPostById(id, userId, false, userRole, boardType);

    if (!result) {
      return sendNotFound(res, '게시글');
    }

    // 비밀글 잠금 상태 (서비스에서 이미 boardType 검증 완료, 방어적 재확인)
    if (result.isLocked) {
      if (result.boardType !== boardType) return sendNotFound(res, '게시글');
      sendSuccess(res, {
        isLocked: true,
        id: result.id,
        title: result.title,
        boardType: result.boardType,
        secretType: result.secretType,
        isEncrypted: result.isEncrypted,
        ...(result.isEncrypted && {
          ciphertext: result.ciphertext,
          secretSalt: result.secretSalt,
        }),
      });
      return;
    }

    if (result.post.boardType !== boardType) return sendNotFound(res, '게시글');

    let htmlContent = '';
    // E2EE 암호화 게시글은 서버가 복호화 불가 — HTML 변환 없이 암호문 그대로 반환
    if (result.post.isEncrypted) {
      htmlContent = result.post.content;
    } else {
      try {
        htmlContent = renderContentToHTML(result.post.content);
      } catch (error) {
        logError('JSON → HTML 변환 실패', error, { postId: id });
        htmlContent = '<p>콘텐츠를 표시할 수 없습니다.</p>';
      }
    }

    sendSuccess(
      res,
      formatPostResponse(
        result.post as PostLike,
        result.postData.user,
        result.attachments,
        htmlContent,
        ...(await Promise.all([
          loadViewerState(id, userId, req.board?.canManage === true),
          pickTags(result.postData),
          loadSecretAllowedUsers(
            result.post as unknown as Parameters<typeof loadSecretAllowedUsers>[0],
            userId,
            userRole,
            req.board?.canManage === true
          ),
        ]))
      )
    );
  } catch (err) {
    const appErr = toAppError(err);
    if (appErr?.statusCode === 403) return sendForbidden(res, appErr.message);
    logError('게시글 조회 실패', err, { postId: id });
    sendError(res, 500, '게시글 조회 실패');
  }
};

// 비밀글 비밀번호 검증
export const verifySecretPost = async (req: AuthRequest, res: Response): Promise<void> => {
  const { boardType, id } = req.params;
  const { password } = req.body;
  const userId = req.user?.id;
  // req.ip 만 쓴다. x-forwarded-for 를 직접 파싱하면 클라이언트가 헤더를 붙여
  // 기록될 IP 를 스스로 정할 수 있다 — 비밀번호를 맞혀 보는 쪽이 정작 자기 주소를
  // 지운 감사 기록을 남기게 된다. (시도 횟수 제한은 이미 req.ip 로 세고 있어,
  //  위조로 이득을 보는 곳이 '기록' 하나뿐이었다.)
  // Express 는 trust proxy 설정(운영: 첫 프록시만 신뢰)을 거친 값을 req.ip 로 준다.
  const ipAddress = req.ip || 'unknown';

  if (typeof password !== 'string' || !password) {
    return sendValidationError(res, 'password', '비밀번호를 입력해주세요.');
  }

  try {
    const result = await postService.verifySecretPost(id, password, boardType, userId);

    // 비밀글 인증 성공 보안 로그
    securityLogService
      .createLog({
        userId,
        ipAddress,
        action: 'SECRET_POST_ACCESS',
        method: 'POST',
        route: req.originalUrl,
        userAgent: req.headers['user-agent'],
        status: 'SUCCESS',
        details: { postId: id, boardType },
      })
      .catch(() => {});

    // E2EE 암호화 게시글은 HTML 변환 불필요 — 암호문 그대로 반환
    let htmlContent = '';
    if (result.post.isEncrypted) {
      htmlContent = result.post.content;
    } else {
      try {
        htmlContent = renderContentToHTML(result.post.content);
      } catch (_error) {
        htmlContent = '<p>콘텐츠를 표시할 수 없습니다.</p>';
      }
    }

    sendSuccess(
      res,
      formatPostResponse(
        result.post as PostLike,
        result.postData.user,
        result.attachments,
        htmlContent,
        ...(await Promise.all([
          loadViewerState(id, userId, req.board?.canManage === true),
          pickTags(result.postData),
        ]))
      )
    );
  } catch (err) {
    const appErr = toAppError(err);
    if (appErr?.statusCode === 404) return sendNotFound(res, '게시글');
    if (appErr?.statusCode === 401) {
      // 비밀번호 틀림 보안 로그
      securityLogService
        .createLog({
          userId,
          ipAddress,
          action: 'SECRET_POST_ACCESS',
          method: 'POST',
          route: req.originalUrl,
          userAgent: req.headers['user-agent'],
          status: 'FAILURE',
          details: { postId: id, boardType, reason: 'wrong_password' },
        })
        .catch(() => {});
      sendError(res, 401, appErr.message);
      return;
    }
    if (appErr?.statusCode === 400) {
      return sendValidationError(res, 'password', appErr.message);
    }
    logError('비밀글 검증 실패', err, { postId: id });
    sendError(res, 500, '비밀글 검증 실패');
  }
};

// 게시글 생성
export const createPost = async (req: AuthRequest, res: Response): Promise<void> => {
  const {
    title,
    content,
    originalFilenames,
    isSecret,
    secretType,
    secretPassword,
    secretUserIds,
    isEncrypted,
    secretSalt,
  } = req.body;
  const boardType = req.params.boardType;
  const files = req.files as Express.Multer.File[];
  const { id: userId, name: userName } = req.user;

  // 타입 방어: title/content가 문자열이 아니면(배열/객체 주입 등) 서비스의 .trim()에서
  // 크래시(500)가 나므로 400으로 차단한다.
  if (typeof title !== 'string' || typeof content !== 'string') {
    // 이미 디스크에 기록된 업로드 파일을 정리(early-return이 try/catch 정리 경로를 우회하므로)
    if (files?.length) await Promise.all(files.map(f => fs.unlink(f.path).catch(() => {})));
    return sendValidationError(res, 'title', '제목과 내용은 문자열이어야 합니다.');
  }

  try {
    const post = await postService.createPost({
      title,
      content,
      boardType,
      authorName: userName,
      userId,
      files,
      originalFilenames,
      isSecret: isSecret === true || isSecret === 'true',
      secretType,
      secretPassword,
      secretUserIds: parseUserIdList(secretUserIds),
      isEncrypted: isEncrypted === true || isEncrypted === 'true',
      secretSalt: typeof secretSalt === 'string' ? secretSalt : undefined,
    });

    logSuccess('게시글 생성 완료', { userId, postId: post.id, boardType });

    // 본문에서 @멘션된 사용자에게 알림 (fire-and-forget — 실패해도 게시글 생성은 성공)
    void notifyMentions({
      content,
      actorId: userId,
      actorName: userName,
      boardType,
      post,
      message: name => `${name}님이 "${post.title}" 게시글에서 회원님을 언급했습니다.`,
      link: `/dashboard/posts/${boardType}/${post.id}`,
      relatedId: post.id,
    });

    // 이 게시판을 구독했거나 작성자를 팔로우한 사람에게 알림
    // (멘션과 같이 fire-and-forget — 알림이 안 갔다고 올라간 글을 무르지 않는다)
    void subscriptionService.notifyNewPost({
      id: post.id,
      title: post.title,
      boardType,
      authorId: userId,
      authorName: userName,
      isSecret: !!post.isSecret,
    });

    // 응답에서 secretUserIds/secretPassword/secretSalt 등 민감 필드 제외 (최소 정보만 반환)
    sendSuccess(
      res,
      {
        id: post.id,
        title: post.title,
        boardType: post.boardType,
        isSecret: post.isSecret,
        secretType: post.secretType,
        isPinned: post.isPinned,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      },
      '게시글이 생성되었습니다.',
      201
    );
  } catch (err) {
    // DB/서비스 실패 시 업로드된 파일 정리 (고아 파일 방지)
    if (files && files.length > 0) {
      await Promise.all(files.map(f => fs.unlink(f.path).catch(() => {})));
    }
    const appErr = toAppError(err);
    if (appErr?.statusCode === 400) {
      return sendValidationError(res, 'content', appErr.message);
    }
    logError('게시글 생성 실패', err, { userId, boardType });
    sendError(res, 500, '게시글 생성 실패');
  }
};

// 게시글 수정
// 주의: boardAccess 미들웨어(checkWriteAccess)가 이미 게시판 쓰기 권한을 확인함
export const updatePost = async (req: AuthRequest, res: Response): Promise<void> => {
  const body = req.body;
  const files = req.files as Express.Multer.File[];
  const { boardType, id } = req.params;
  const { id: userId, role: userRole } = req.user;

  // 타입 방어: title/content가 문자열이 아니면 서비스의 .trim()에서 크래시(500) → 400 차단
  if (typeof body.title !== 'string' || typeof body.content !== 'string') {
    // 이미 디스크에 기록된 업로드 파일을 정리(early-return이 try/catch 정리 경로를 우회하므로)
    if (files?.length) await Promise.all(files.map(f => fs.unlink(f.path).catch(() => {})));
    return sendValidationError(res, 'title', '제목과 내용은 문자열이어야 합니다.');
  }

  try {
    const updatedPost = await postService.updatePost({
      postId: id,
      expectedBoardType: boardType,
      targetBoardType:
        typeof body.targetBoardType === 'string' && body.targetBoardType.trim()
          ? body.targetBoardType.trim()
          : undefined,
      title: body.title,
      content: body.content,
      userId,
      userRole,
      files,
      keepExistingFiles: body.keepExistingFiles,
      originalFilenames: body.originalFilenames,
      deletedFileNames: body.deletedFileNames,
      isSecret:
        body.isSecret === true || body.isSecret === 'true'
          ? true
          : body.isSecret === false || body.isSecret === 'false'
            ? false
            : undefined,
      secretType: body.secretType,
      secretPassword: body.secretPassword,
      secretUserIds: parseUserIdList(body.secretUserIds),
      isEncrypted: body.isEncrypted === true || body.isEncrypted === 'true',
      secretSalt: typeof body.secretSalt === 'string' ? body.secretSalt : undefined,
    });

    logSuccess('게시글 수정 완료', { userId, postId: id });
    // 응답에서 secretUserIds/secretPassword/secretSalt 등 민감 필드 제외
    sendSuccess(
      res,
      {
        id: updatedPost.id,
        title: updatedPost.title,
        boardType: updatedPost.boardType,
        isSecret: updatedPost.isSecret,
        secretType: updatedPost.secretType,
        isPinned: updatedPost.isPinned,
        updatedAt: updatedPost.updatedAt,
      },
      '게시글이 수정되었습니다.'
    );
  } catch (err) {
    // DB/서비스 실패 시 새로 업로드된 파일 정리 (고아 파일 방지)
    if (files && files.length > 0) {
      await Promise.all(files.map(f => fs.unlink(f.path).catch(() => {})));
    }
    const appErr = toAppError(err);
    if (appErr?.statusCode === 404) return sendNotFound(res, '게시글');
    if (appErr?.statusCode === 403) return sendForbidden(res, appErr.message);
    if (appErr?.statusCode === 409) {
      sendError(res, 409, appErr.message);
      return;
    }
    if (appErr?.statusCode === 400) return sendValidationError(res, 'content', appErr.message);
    logError('게시글 수정 실패', err, { userId, postId: id });
    sendError(res, 500, '게시글 수정 실패');
  }
};

// 게시글 삭제
// 주의: boardAccess 미들웨어(checkDeleteAccess)가 이미 게시판 삭제 권한을 확인함
export const deletePost = async (req: AuthRequest, res: Response): Promise<void> => {
  const { boardType, id } = req.params;
  const { id: userId, role: userRole } = req.user;

  try {
    const deleted = await postService.deletePost(id, userId, userRole, boardType);
    logSuccess('게시글 삭제 완료', { userId, postId: id });

    // 되돌릴 수 없는 삭제라 누가 무엇을 지웠는지 남긴다. 제목은 지운 뒤에는 알 수 없으므로
    // 서비스가 돌려준 값을 쓴다. 기록 실패가 삭제를 되돌리지는 않으므로 기다리지 않는다.
    auditLogService
      .createAuditLog({
        actorId: userId,
        actorName: req.user.name ?? userId,
        action: 'delete_post',
        targetType: 'post',
        targetId: deleted.id,
        targetName: deleted.title,
        ipAddress: req.ip ?? null,
      })
      .catch(err => logError('게시글 삭제 감사 기록 실패', err));

    sendSuccess(res, null, '게시글이 삭제되었습니다.');
  } catch (err) {
    const appErr = toAppError(err);
    if (appErr?.statusCode === 404) return sendNotFound(res, '게시글');
    if (appErr?.statusCode === 403) return sendForbidden(res, appErr.message);
    logError('게시글 삭제 실패', err, { userId, postId: id });
    sendError(res, 500, '게시글 삭제 실패');
  }
};

// 게시글 고정/해제 (admin 또는 해당 게시판 담당자)
export const togglePin = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id: postId } = req.params;
  const { id: userId, role: userRole } = req.user;

  // 고정 기간(선택). 없으면 무기한 고정이다.
  const rawUntil = (req.body as { pinnedUntil?: unknown } | undefined)?.pinnedUntil;
  let pinnedUntil: Date | null = null;
  if (rawUntil !== undefined && rawUntil !== null && rawUntil !== '') {
    const parsed = new Date(String(rawUntil));
    if (Number.isNaN(parsed.getTime())) {
      sendError(res, 400, '고정 기간이 올바르지 않습니다.');
      return;
    }
    // 이미 지난 시각으로 고정하면 다음 목록 조회에서 곧바로 풀린다 — 실수로 보고 막는다
    if (parsed.getTime() <= Date.now()) {
      sendError(res, 400, '고정 기간은 현재 시각보다 뒤여야 합니다.');
      return;
    }
    pinnedUntil = parsed;
  }

  try {
    const result = await postService.togglePin(postId, userId, userRole, pinnedUntil);
    sendSuccess(res, result);
  } catch (err) {
    const appErr = toAppError(err);
    if (appErr?.statusCode === 404) return sendNotFound(res, '게시글');
    if (appErr?.statusCode === 403) return sendForbidden(res, appErr.message);
    logError('게시글 고정 실패', err);
    sendError(res, 500, '게시글 고정 처리 중 오류가 발생했습니다.');
  }
};

// GET /api/posts/:boardType/:id/attachment-versions — 첨부의 이전 버전
export const getAttachmentVersions = async (req: AuthRequest, res: Response): Promise<void> => {
  const { boardType, id } = req.params;
  const { id: userId, role } = req.user;

  try {
    sendSuccess(res, await postService.getAttachmentVersions(id, boardType, userId, role));
  } catch (err) {
    sendServiceError(res, err, '첨부 이력을 불러오지 못했습니다.', { userId, postId: id });
  }
};

// GET /api/posts/:boardType/:id/revisions — 게시글 수정 이력
export const getPostRevisions = async (req: AuthRequest, res: Response): Promise<void> => {
  const { boardType, id } = req.params;
  const { id: userId, role } = req.user;

  try {
    const revisions = await postService.getPostRevisions(id, boardType, userId, role);
    sendSuccess(res, { revisions });
  } catch (err) {
    if (err instanceof AppError) return sendError(res, err.statusCode, err.message);
    logError('게시글 이력 조회 실패', err, { userId, postId: id });
    sendError(res, 500, '게시글 이력 조회 중 오류가 발생했습니다.');
  }
};
