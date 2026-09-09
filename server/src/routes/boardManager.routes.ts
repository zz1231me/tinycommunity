import { Router, RequestHandler } from 'express';
import asyncHandler from 'express-async-handler';
import { authenticate } from '../middlewares/auth.middleware';
import { requireAnyRole } from '../middlewares/roleCheck.middleware';
import { ROLES } from '../config/constants';
import {
  listAllBoards,
  listByBoard,
  addManager,
  removeManager,
  checkIsManager,
} from '../controllers/boardManager.controller';
import { AuthRequest } from '../types/auth-request';

const router = Router();

// 모든 라우트: 인증 필수
router.use(authenticate as RequestHandler);

// 어드민 전용: 전체 게시판 + 담당자 목록 조회
router.get(
  '/boards',
  requireAnyRole([ROLES.ADMIN]) as RequestHandler,
  asyncHandler((req, res) => listAllBoards(req as AuthRequest, res))
);

// 어드민/매니저: 특정 게시판 담당자 목록
router.get(
  '/boards/:boardId',
  requireAnyRole([ROLES.ADMIN, ROLES.MANAGER]) as RequestHandler,
  asyncHandler((req, res) => listByBoard(req as AuthRequest, res))
);

// 어드민 전용: 담당자 추가
router.post(
  '/boards/:boardId',
  requireAnyRole([ROLES.ADMIN]) as RequestHandler,
  asyncHandler((req, res) => addManager(req as AuthRequest, res))
);

// 어드민 전용: 담당자 삭제
router.delete(
  '/:id',
  requireAnyRole([ROLES.ADMIN]) as RequestHandler,
  asyncHandler((req, res) => removeManager(req as AuthRequest, res))
);

// 인증된 모든 유저: 본인이 특정 게시판의 담당자인지 확인
router.get(
  '/check/:boardType',
  asyncHandler((req, res) => checkIsManager(req as AuthRequest, res))
);

export default router;
