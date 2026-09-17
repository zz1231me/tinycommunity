// server/src/routes/post.routes.ts - 통합 업로드 미들웨어 사용
import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import {
  createPost,
  getPosts,
  getPostById,
  updatePost,
  deletePost,
  globalSearch,
  getRecentPosts,
  verifySecretPost,
  togglePin,
  getPostRevisions,
  getAttachmentVersions,
} from '../controllers/post.controller';
import { toggleLike, getLikeStatus } from '../controllers/like.controller';
import {
  getPopularPosts,
  getRelatedPosts,
  toggleScrap,
  getScrapStatus,
  getMyScraps,
} from '../controllers/discovery.controller';
import { markAsRead } from '../controllers/postRead.controller';
import { addPostTags, getPostTags } from '../controllers/tag.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { secretPostLimiter } from '../middlewares/bruteForceGuard';
import {
  checkReadAccess,
  checkWriteAccess,
  checkDeleteAccess,
} from '../middlewares/boardAccess.middleware';
import { AuthRequest } from '../types/auth-request';
import { uploadFiles } from '../middlewares/upload/file';
import { validateUploadedFile } from '../middlewares/upload/validator';
import {
  requireFeature,
  rejectAttachmentsWhenDisabled,
} from '../middlewares/featureGate.middleware';
import {
  changeTask,
  getMyTasks,
  getReaders,
  getActivity,
  getWorkStatuses,
} from '../controllers/postTask.controller';

const router = Router();

/**
 * @swagger
 * /api/posts/search/global:
 *   get:
 *     summary: 글로벌 검색
 *     tags: [Posts]
 */
router.get(
  '/search/global',
  authenticate as RequestHandler,
  requireFeature('search.global'),
  asyncHandler((req, res) => globalSearch(req as AuthRequest, res))
);

// 최신 게시물 (헤더 드롭다운). '/:boardType' catch-all보다 먼저 선언.
router.get(
  '/recent',
  authenticate as RequestHandler,
  asyncHandler((req, res) => getRecentPosts(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/posts/popular:
 *   get:
 *     summary: 인기글
 *     description: 좋아요·댓글·조회수를 가중 합산한 점수 순. 읽을 수 있는 게시판만 집계한다.
 *     tags: [Posts]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [week, month, all], default: week }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 30 }
 *     responses:
 *       200: { description: '{ period, posts }' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get(
  '/popular',
  authenticate as RequestHandler,
  requireFeature('discovery.popular'),
  asyncHandler((req, res) => getPopularPosts(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/posts/tasks/mine:
 *   get:
 *     summary: 내가 담당인 글
 *     description: 기본은 아직 끝나지 않은 것(todo,doing). status=done 처럼 지정할 수 있다.
 *     tags: [Posts]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 담당 중인 글 목록 }
 */
router.get(
  '/tasks/mine',
  authenticate as RequestHandler,
  requireFeature('post.tasks'),
  asyncHandler((req, res) => getMyTasks(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/posts/tasks/statuses:
 *   get:
 *     summary: 업무 상태 목록
 *     tags: [Posts]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: '[{ key, label, description }]' }
 */
router.get(
  '/tasks/statuses',
  authenticate as RequestHandler,
  requireFeature('post.tasks'),
  asyncHandler((req, res) => getWorkStatuses(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/posts/scraps/mine:
 *   get:
 *     summary: 내 스크랩 목록
 *     description: 스크랩한 뒤 권한이 바뀐 글은 목록에서 제외된다.
 *     tags: [Posts]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: '{ posts, pagination }' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get(
  '/scraps/mine',
  authenticate as RequestHandler,
  requireFeature('post.scrap'),
  asyncHandler((req, res) => getMyScraps(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/posts/{boardType}:
 *   get:
 *     summary: 게시글 목록 조회
 *     tags: [Posts]
 */
router.get(
  '/:boardType',
  authenticate as RequestHandler,
  checkReadAccess as RequestHandler,
  asyncHandler((req, res) => getPosts(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/posts/{boardType}/{id}:
 *   get:
 *     summary: 게시글 상세 조회
 *     tags: [Posts]
 */
router.get(
  '/:boardType/:id',
  authenticate as RequestHandler,
  checkReadAccess as RequestHandler,
  asyncHandler((req, res) => getPostById(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/posts/{boardType}/{id}/verify:
 *   post:
 *     summary: 비밀글 비밀번호 검증
 *     tags: [Posts]
 */
/**
 * @swagger
 * /api/posts/{boardType}/{id}/revisions:
 *   get:
 *     summary: 게시글 수정 이력
 *     description: |
 *       최신순 최대 100건. 각 항목은 "그 수정이 일어나기 직전"의 제목·본문 스냅샷이며,
 *       현재 버전은 게시글 본문 조회 API 로 얻는다.
 *       접근 권한은 게시글 본문과 동일하다 — 잠긴 비밀글은 이력도 볼 수 없다.
 *     tags: [Posts]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: boardType
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: 수정 이력 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 revisions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       title: { type: string }
 *                       content: { type: string, description: 'HTML 원문' }
 *                       createdAt: { type: string, format: date-time }
 *                       editor:
 *                         type: object
 *                         nullable: true
 *                         description: '탈퇴한 사용자면 null'
 *                         properties:
 *                           id: { type: string }
 *                           name: { type: string }
 *       403: { description: 잠긴 비밀글이거나 게시판 읽기 권한 없음 }
 *       404: { description: 게시글 없음 }
 */
router.get(
  '/:boardType/:id/revisions',
  authenticate as RequestHandler,
  requireFeature('post.revisions'),
  checkReadAccess as RequestHandler,
  asyncHandler((req, res) => getPostRevisions(req as AuthRequest, res))
);
/**
 * @swagger
 * /api/posts/{boardType}/{id}/attachment-versions:
 *   get:
 *     summary: 첨부의 이전 버전
 *     description: 같은 이름으로 다시 올려 밀려난 파일들. 파일 이름별로 묶어 최신순으로 준다.
 *     tags: [Posts]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: '[{ originalName, versions }]' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get(
  '/:boardType/:id/attachment-versions',
  authenticate as RequestHandler,
  requireFeature('post.attachments'),
  checkReadAccess as RequestHandler,
  asyncHandler((req, res) => getAttachmentVersions(req as AuthRequest, res))
);

router.post(
  '/:boardType/:id/verify',
  authenticate as RequestHandler,
  checkReadAccess as RequestHandler,
  secretPostLimiter as RequestHandler, // 비밀번호 brute-force 방지 (5분에 5회)
  asyncHandler((req, res) => verifySecretPost(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/posts/{boardType}:
 *   post:
 *     summary: 게시글 생성
 *     tags: [Posts]
 */
router.post(
  '/:boardType',
  authenticate as RequestHandler,
  checkWriteAccess as RequestHandler,
  uploadFiles.array('files'), // 개수 상한은 multer limits.files(=maxFileCount 설정)로 동적 적용
  validateUploadedFile({ validateContent: false }) as RequestHandler, // 첨부=다운로드 전용: 내용검증 생략, chmod만
  rejectAttachmentsWhenDisabled,
  asyncHandler((req, res) => createPost(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/posts/{boardType}/{id}:
 *   put:
 *     summary: 게시글 수정
 *     tags: [Posts]
 */
router.put(
  '/:boardType/:id',
  authenticate as RequestHandler,
  checkWriteAccess as RequestHandler,
  uploadFiles.array('files'), // 개수 상한은 multer limits.files(=maxFileCount 설정)로 동적 적용
  validateUploadedFile({ validateContent: false }) as RequestHandler, // 첨부=다운로드 전용: 내용검증 생략, chmod만
  rejectAttachmentsWhenDisabled,
  asyncHandler((req, res) => updatePost(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/posts/{boardType}/{id}:
 *   delete:
 *     summary: 게시글 삭제
 *     tags: [Posts]
 */
router.delete(
  '/:boardType/:id',
  authenticate as RequestHandler,
  checkDeleteAccess as RequestHandler,
  asyncHandler((req, res) => deletePost(req as AuthRequest, res))
);

// 좋아요
router.get(
  '/:boardType/:id/like',
  authenticate as RequestHandler,
  requireFeature('post.like'),
  checkReadAccess as RequestHandler,
  asyncHandler((req, res) => getLikeStatus(req as AuthRequest, res))
);
router.post(
  '/:boardType/:id/like',
  authenticate as RequestHandler,
  requireFeature('post.like'),
  checkReadAccess as RequestHandler,
  asyncHandler((req, res) => toggleLike(req as AuthRequest, res))
);

// 읽음 처리
router.post(
  '/:boardType/:id/read',
  authenticate as RequestHandler,
  checkReadAccess as RequestHandler,
  asyncHandler((req, res) => markAsRead(req as AuthRequest, res))
);

// 게시글 고정 (쓰기 권한 이상 필요)
router.patch(
  '/:boardType/:id/pin',
  authenticate as RequestHandler,
  checkWriteAccess as RequestHandler,
  asyncHandler((req, res) => togglePin(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/posts/{boardType}/{id}/related:
 *   get:
 *     summary: 관련 글
 *     description: 태그가 겹치는 글 우선, 모자라면 같은 게시판의 최근 글로 채운다.
 *     tags: [Posts]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: 관련 글 목록 }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get(
  '/:boardType/:id/related',
  authenticate as RequestHandler,
  requireFeature('discovery.related'),
  checkReadAccess as RequestHandler,
  asyncHandler((req, res) => getRelatedPosts(req as AuthRequest, res))
);

// 스크랩(나중에 보기) — 개인 서랍이라 작성자에게 알림이 가지 않는다
router.get(
  '/:boardType/:id/scrap',
  authenticate as RequestHandler,
  requireFeature('post.scrap'),
  checkReadAccess as RequestHandler,
  asyncHandler((req, res) => getScrapStatus(req as AuthRequest, res))
);
router.post(
  '/:boardType/:id/scrap',
  authenticate as RequestHandler,
  requireFeature('post.scrap'),
  checkReadAccess as RequestHandler,
  asyncHandler((req, res) => toggleScrap(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/posts/{boardType}/{id}/task:
 *   patch:
 *     summary: 담당자·업무 상태 변경
 *     description: 작성자·담당자 본인·게시판 담당자·관리자만 바꿀 수 있다.
 *     tags: [Posts]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               assigneeId: { type: string, nullable: true }
 *               workStatus: { type: string, enum: [none, todo, doing, done] }
 *     responses:
 *       200: { description: '{ workStatus, assignee }' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.patch(
  '/:boardType/:id/task',
  authenticate as RequestHandler,
  requireFeature('post.tasks'),
  checkReadAccess as RequestHandler,
  asyncHandler((req, res) => changeTask(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/posts/{boardType}/{id}/readers:
 *   get:
 *     summary: 누가 읽었는지
 *     description: 작성자와 게시판 담당자만 볼 수 있다. 작성자 본인은 대상에서 뺀다.
 *     tags: [Posts]
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: '{ total, readCount, readers, unread }' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
/**
 * @openapi
 * /api/posts/{boardType}/{id}/activity:
 *   get:
 *     tags: [Posts]
 *     summary: 글 활동 기록 (작성·수정·첨부 교체·상태·담당자 변경)
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: '시간순(최신 먼저) 기록 배열' }
 */
router.get(
  '/:boardType/:id/activity',
  authenticate as RequestHandler,
  requireFeature('post.tasks'),
  checkReadAccess as RequestHandler,
  asyncHandler((req, res) => getActivity(req as AuthRequest, res))
);

router.get(
  '/:boardType/:id/readers',
  authenticate as RequestHandler,
  requireFeature('post.readReceipts'),
  checkReadAccess as RequestHandler,
  asyncHandler((req, res) => getReaders(req as AuthRequest, res))
);

// 게시글 태그 — /api/tags 와 같은 스위치를 건다.
// 한쪽만 막으면 관리 화면에서는 태그가 사라졌는데 글에는 계속 붙는 상태가 된다.
router.get(
  '/:boardType/:id/tags',
  authenticate as RequestHandler,
  requireFeature('post.tags'),
  checkReadAccess as RequestHandler,
  asyncHandler((req, res) => getPostTags(req as AuthRequest, res))
);
router.post(
  '/:boardType/:id/tags',
  authenticate as RequestHandler,
  requireFeature('post.tags'),
  checkWriteAccess as RequestHandler,
  asyncHandler((req, res) => addPostTags(req as AuthRequest, res))
);

export default router;
