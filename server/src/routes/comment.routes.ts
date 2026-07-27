// src/routes/comment.routes.ts - 권한 기반 댓글 라우팅
import express, { RequestHandler } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  checkReadAccess,
  checkWriteAccess,
  checkDeleteAccess,
} from '../middlewares/boardAccess.middleware';
import {
  createComment,
  getCommentsByPost,
  updateComment,
  deleteComment,
  likeComment,
} from '../controllers/comment.controller';
import { apiLimiter } from '../middlewares/rate-limit.middleware';

const router = express.Router();

/**
 * @swagger
 * /api/comments/{boardType}/{postId}:
 *   get:
 *     summary: 댓글 목록 조회
 *     description: 특정 게시글의 댓글 목록을 조회 (게시판 읽기 권한 필요)
 *     tags: [Comments]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: boardType
 *         required: true
 *         schema:
 *           type: string
 *         description: 게시판 ID
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *         description: 게시글 ID
 *     responses:
 *       200:
 *         description: 댓글 목록
 *       403:
 *         description: 게시판 읽기 권한 없음
 */
router.get(
  '/:boardType/:postId',
  authenticate as RequestHandler,
  checkReadAccess as RequestHandler,
  getCommentsByPost as RequestHandler
);

/**
 * @swagger
 * /api/comments/{boardType}/{postId}:
 *   post:
 *     summary: 댓글 작성
 *     description: 새로운 댓글을 작성 (게시판 쓰기 권한 필요)
 *     tags: [Comments]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: boardType
 *         required: true
 *         schema:
 *           type: string
 *         description: 게시판 ID
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *         description: 게시글 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: 댓글 내용
 *               parentId:
 *                 type: string
 *                 nullable: true
 *                 description: 부모 댓글 ID (대댓글인 경우)
 *             required:
 *               - content
 *     responses:
 *       201:
 *         description: 댓글 작성 완료
 *       403:
 *         description: 게시판 쓰기 권한 없음
 *       400:
 *         description: 잘못된 요청 데이터
 */
router.post(
  '/:boardType/:postId',
  authenticate as RequestHandler,
  checkWriteAccess as RequestHandler,
  createComment as RequestHandler
);

/**
 * @swagger
 * /api/comments/{boardType}/{commentId}:
 *   put:
 *     summary: 댓글 수정
 *     description: 기존 댓글을 수정 (게시판 쓰기 권한 + 작성자/관리 권한 필요)
 *     tags: [Comments]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: boardType
 *         required: true
 *         schema:
 *           type: string
 *         description: 게시판 ID
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *         description: 댓글 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: 수정할 댓글 내용
 *             required:
 *               - content
 *     responses:
 *       200:
 *         description: 댓글 수정 완료
 *       403:
 *         description: 수정 권한 없음
 *       404:
 *         description: 댓글 없음
 */
router.put(
  '/:boardType/:commentId',
  authenticate as RequestHandler,
  checkWriteAccess as RequestHandler,
  updateComment as RequestHandler
);

/**
 * @swagger
 * /api/comments/{boardType}/{commentId}:
 *   delete:
 *     summary: 댓글 삭제
 *     description: 댓글을 삭제 (게시판 쓰기 권한 + 작성자/관리 권한 필요)
 *     tags: [Comments]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: boardType
 *         required: true
 *         schema:
 *           type: string
 *         description: 게시판 ID
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *         description: 댓글 ID
 *     responses:
 *       200:
 *         description: 댓글 삭제 완료
 *       403:
 *         description: 삭제 권한 없음
 *       404:
 *         description: 댓글 없음
 */
router.delete(
  '/:boardType/:commentId',
  authenticate as RequestHandler,
  checkDeleteAccess as RequestHandler,
  deleteComment as RequestHandler
);

/**
 * @swagger
 * /api/comments/{boardType}/{commentId}/like:
 *   post:
 *     summary: 댓글 좋아요 토글
 *     description: 좋아요가 없으면 추가, 있으면 취소 (게시판 읽기 권한 필요)
 *     tags: [Comments]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: boardType
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: '{ liked, likeCount }'
 *       403:
 *         description: 게시판 읽기 권한 없음
 *       404:
 *         description: 댓글 없음
 */
router.post(
  '/:boardType/:commentId/like',
  apiLimiter as RequestHandler,
  authenticate as RequestHandler,
  checkReadAccess as RequestHandler,
  likeComment as RequestHandler
);

export default router;
