import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth-request';
import { sendUnauthorized, sendNotFound, sendForbidden, sendError } from '../utils/response';
import { logError, logPermission } from '../utils/logger';
import { checkUserBoardPermission } from '../controllers/board.controller';

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

      if (!board) {
        logError('게시판 정보를 찾을 수 없음', null, {
          userId,
          userName,
          userRole,
          boardType,
        });
        return sendNotFound(res, '게시판');
      }

      // checkUserBoardPermission 이 조회한 권한을 재사용한다. admin·개인 게시판은 BoardAccess 레코드가 없다.
      const permissions = permissionCheck.permissions ?? {
        canRead: true,
        canWrite: requiredPermission === 'canWrite' || requiredPermission === 'canDelete',
        canDelete: requiredPermission === 'canDelete',
      };

      req.board = {
        id: board.id,
        name: board.name,
        isPersonal: board.isPersonal,
        permissions,
        // 권한 판정에서 이미 조회했으므로 핸들러가 다시 조회하지 않도록 실어 보낸다.
        canManage: permissionCheck.canManage === true,
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

export const checkReadAccess = checkBoardAccess('canRead');
export const checkWriteAccess = checkBoardAccess('canWrite');
export const checkDeleteAccess = checkBoardAccess('canDelete');

// req.board 타입은 types/auth-request.ts 한 곳에만 둔다. 여기서 Express.Request 를 전역 확장하면 선언이 충돌한다.
