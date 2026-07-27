import express, { RequestHandler, Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import {
  getUserAccessibleBoards,
  checkUserBoardAccess,
  createPersonalFolder,
  createAllUserPersonalFolders,
  setupDummyData, // ✅ 더미 데이터 설정 API 추가
  updateBoardInfo,
  getBoardManageCapability,
} from '../controllers/board.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { isAdmin } from '../middlewares/isAdmin';
import { cacheMiddleware } from '../utils/cache';
import { AuthRequest } from '../types/auth-request';

const router = express.Router();
const auth = authenticate as RequestHandler;
const admin = isAdmin as RequestHandler;

// 타입 안전한 래퍼 함수 (임시)
const wrapAuthHandler = (handler: (req: AuthRequest, res: Response) => Promise<void>) => {
  return (req: Request, res: Response) => {
    return handler(req as AuthRequest, res);
  };
};

/**
 * @swagger
 * /api/boards/accessible:
 *   get:
 *     summary: 접근 가능한 게시판 목록 조회 (권한 기반)
 *     description: 사용자의 역할에 따라 접근 가능한 일반 게시판과 본인의 개인 폴더만 반환
 *     tags: [Boards]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: 접근 가능한 게시판 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   description:
 *                     type: string
 *                   order:
 *                     type: integer
 *                   isPersonal:
 *                     type: boolean
 *                   permissions:
 *                     type: object
 *                     properties:
 *                       canRead:
 *                         type: boolean
 *                       canWrite:
 *                         type: boolean
 *                       canDelete:
 *                         type: boolean
 */
// ✅ cacheMiddleware는 내부적으로 userId를 포함한 키(boards:userId:originalUrl)를 자동 생성하여 사용자별로 캐시를 분리함
router.get(
  '/accessible',
  auth,
  cacheMiddleware('boards', 300),
  asyncHandler(wrapAuthHandler(getUserAccessibleBoards))
);

/**
 * @swagger
 * /api/boards/check/:boardType:
 *   get:
 *     summary: 특정 게시판 접근 권한 확인
 *     description: 사용자가 특정 게시판에 접근 가능한지 확인 (개인폴더는 소유자만, 일반게시판은 역할 기반)
 *     tags: [Boards]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: boardType
 *         required: true
 *         schema:
 *           type: string
 *         description: 게시판 ID
 *     responses:
 *       200:
 *         description: 접근 권한 정보
 *       403:
 *         description: 접근 권한 없음
 */
router.get('/check/:boardType', auth, asyncHandler(wrapAuthHandler(checkUserBoardAccess)));

// 게시판 내 관리(담당자) — 관리 가능 여부 조회 + 기본정보(이름/설명) 수정
router.get('/:boardType/can-manage', auth, asyncHandler(wrapAuthHandler(getBoardManageCapability)));
router.put('/:boardType/info', auth, asyncHandler(wrapAuthHandler(updateBoardInfo)));

/**
 * @swagger
 * /api/boards/personal/create:
 *   post:
 *     summary: 개인 폴더 수동 생성
 *     description: 사용자의 개인 폴더가 없을 경우 수동으로 생성
 *     tags: [Boards]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: 개인 폴더 생성 완료
 *       400:
 *         description: 이미 개인 폴더 존재
 */
router.post('/personal/create', auth, asyncHandler(wrapAuthHandler(createPersonalFolder)));

/**
 * @swagger
 * /api/boards/personal/create-all:
 *   post:
 *     summary: 모든 사용자 개인 폴더 일괄 생성 (관리자 전용)
 *     description: 개인 폴더가 없는 모든 사용자에게 개인 폴더를 일괄 생성
 *     tags: [Boards]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: 일괄 생성 완료
 *       403:
 *         description: 관리자 권한 필요
 */
router.post(
  '/personal/create-all',
  auth,
  admin,
  asyncHandler(wrapAuthHandler(createAllUserPersonalFolders))
);

/**
 * @swagger
 * /api/boards/setup-dummy:
 *   post:
 *     summary: 더미 데이터 설정 (개발용, 관리자 전용)
 *     description: 개발용 더미 데이터(역할, 게시판, 권한) 자동 생성
 *     tags: [Boards]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: 더미 데이터 설정 완료
 *       403:
 *         description: 관리자 권한 필요
 */
router.post('/setup-dummy', auth, admin, asyncHandler(wrapAuthHandler(setupDummyData)));

export default router;
