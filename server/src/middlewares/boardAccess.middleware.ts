// server/src/middlewares/boardAccess.middleware.ts - 최적화된 권한 확인 미들웨어
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth-request';
import { sendUnauthorized, sendNotFound, sendForbidden, sendError } from '../utils/response';
import { logError, logPermission } from '../utils/logger';
import { checkUserBoardPermission } from '../controllers/board.controller';

// ✅ 게시판 접근 권한 확인 미들웨어 (최적화된 버전)
export const checkBoardAccess = (
  requiredPermission: 'canRead' | 'canWrite' | 'canDelete' = 'canRead'
) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { boardType } = req.params;
      const { id: userId, role: userRole, name: userName } = req.user || {};

      if (!userId || !userRole) {
        return sendUnauthorized(res);
      }

      if (!boardType) {
        return sendNotFound(res, '게시판 ID');
      }

      // 권한 확인 (최적화된 함수 사용)
      const permissionCheck = await checkUserBoardPermission(
        userId,
        userRole,
        boardType,
        requiredPermission
      );

      if (!permissionCheck.hasAccess) {
        logPermission('게시판 접근', false, {
          userId,
          userName,
          userRole,
          boardType,
          permission: requiredPermission,
          reason: permissionCheck.reason,
        });
        return sendForbidden(res, permissionCheck.reason || '권한이 없습니다.');
      }

      logPermission('게시판 접근', true, {
        userId,
        userName,
        userRole,
        boardType,
        permission: requiredPermission,
      });

      const board = permissionCheck.board;

      // board가 undefined인 경우 처리
      if (!board) {
        logError('게시판 정보를 찾을 수 없음', null, {
          userId,
          userName,
          userRole,
          boardType,
        });
        return sendNotFound(res, '게시판');
      }

      // 권한 정보: checkUserBoardPermission에서 이미 BoardAccess를 조회했으므로 재사용
      // (이중 DB 쿼리 방지)
      // permissions가 없는 경우는 admin/개인 게시판처럼 BoardAccess 레코드가 없는 정상 케이스
      const permissions = permissionCheck.permissions ?? {
        canRead: true,
        canWrite: requiredPermission === 'canWrite' || requiredPermission === 'canDelete',
        canDelete: requiredPermission === 'canDelete',
      };

      // 요청 객체에 게시판 정보 추가
      req.board = {
        id: board.id,
        name: board.name,
        isPersonal: board.isPersonal,
        permissions,
      };

      next();
    } catch (error) {
      logError('게시판 접근 권한 확인 중 오류', error, {
        userId: req.user?.id,
        boardType: req.params.boardType,
      });
      sendError(res, 500, '게시판 접근 권한 확인 중 오류가 발생했습니다.');
    }
  };
};

// ✅ 편의 함수들
export const checkReadAccess = checkBoardAccess('canRead');
export const checkWriteAccess = checkBoardAccess('canWrite');
export const checkDeleteAccess = checkBoardAccess('canDelete');

// ✅ TypeScript 타입 확장
declare global {
  namespace Express {
    interface Request {
      board?: {
        id: string;
        name: string;
        isPersonal: boolean;
        permissions: {
          canRead: boolean;
          canWrite: boolean;
          canDelete: boolean;
        };
      };
    }
  }
}
