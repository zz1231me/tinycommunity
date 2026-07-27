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
  verifySecretPost,
  togglePin,
} from '../controllers/post.controller';
import { toggleLike, getLikeStatus } from '../controllers/like.controller';
import { markAsRead } from '../controllers/postRead.controller';
import { addPostTags, getPostTags } from '../controllers/tag.controller';
import { authenticate } from '../middlewares/auth.middleware';
import {
  checkReadAccess,
  checkWriteAccess,
  checkDeleteAccess,
} from '../middlewares/boardAccess.middleware';
import { AuthRequest } from '../types/auth-request';
import { uploadFiles } from '../middlewares/upload/file';
import { validateUploadedFile } from '../middlewares/upload/validator';
import { secretPostLimiter, apiLimiter, uploadLimiter } from '../middlewares/rate-limit.middleware';

const router = Router();

/**
 * @swagger
 * /api/posts/search/global:
 *   get:
 *     summary: 글로벌 검색
 */
router.get(
  '/search/global',
  apiLimiter as RequestHandler,
  authenticate as RequestHandler,
  asyncHandler((req, res) => globalSearch(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/posts/{boardType}:
 *   get:
 *     summary: 게시글 목록 조회
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
 */
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
 */
router.post(
  '/:boardType',
  authenticate as RequestHandler,
  checkWriteAccess as RequestHandler,
  uploadLimiter as RequestHandler,
  uploadFiles.array('files'), // 개수 상한은 multer limits.files(=maxFileCount 설정)로 동적 적용
  validateUploadedFile({ validateContent: false }) as RequestHandler, // 첨부=다운로드 전용: 내용검증 생략, chmod만
  asyncHandler((req, res) => createPost(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/posts/{boardType}/{id}:
 *   put:
 *     summary: 게시글 수정
 */
router.put(
  '/:boardType/:id',
  authenticate as RequestHandler,
  checkWriteAccess as RequestHandler,
  uploadLimiter as RequestHandler,
  uploadFiles.array('files'), // 개수 상한은 multer limits.files(=maxFileCount 설정)로 동적 적용
  validateUploadedFile({ validateContent: false }) as RequestHandler, // 첨부=다운로드 전용: 내용검증 생략, chmod만
  asyncHandler((req, res) => updatePost(req as AuthRequest, res))
);

/**
 * @swagger
 * /api/posts/{boardType}/{id}:
 *   delete:
 *     summary: 게시글 삭제
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
  checkReadAccess as RequestHandler,
  asyncHandler((req, res) => getLikeStatus(req as AuthRequest, res))
);
router.post(
  '/:boardType/:id/like',
  apiLimiter as RequestHandler,
  authenticate as RequestHandler,
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

// 게시글 태그
router.get(
  '/:boardType/:id/tags',
  authenticate as RequestHandler,
  checkReadAccess as RequestHandler,
  asyncHandler((req, res) => getPostTags(req as AuthRequest, res))
);
router.post(
  '/:boardType/:id/tags',
  authenticate as RequestHandler,
  checkWriteAccess as RequestHandler,
  asyncHandler((req, res) => addPostTags(req as AuthRequest, res))
);

export default router;
