import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth-request';
import { Role } from '../models/Role';
import EventPermission from '../models/EventPermission';
import { logInfo, logWarning, logError } from '../utils/logger';
import { sendUnauthorized, sendForbidden, sendError } from '../utils/response';
import { ROLES } from '../config/constants';

export const checkEventPermission = (action: 'create' | 'read' | 'update' | 'delete') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;
      const userRole = authReq.user?.role;

      logInfo('이벤트 권한 체크 시작', { userRole, action });

      if (!userRole) {
        logWarning('이벤트 권한 체크: 사용자 역할 없음');
        sendUnauthorized(res, '로그인이 필요합니다.');
        return;
      }

      // 관리자는 모든 이벤트 권한 허용
      if (userRole === ROLES.ADMIN) {
        next();
        return;
      }

      // 역할 정보 확인
      const role = await Role.findByPk(userRole);
      if (!role || !role.isActive) {
        logWarning('이벤트 권한 체크: 역할 없거나 비활성화됨', { userRole });
        sendForbidden(res, '유효하지 않은 권한입니다.');
        return;
      }

      // EventPermission 조회
      const eventPermission = await EventPermission.findOne({
        where: { roleId: userRole },
      });

      logInfo('EventPermission 조회 결과', { found: !!eventPermission });

      if (!eventPermission) {
        // ✅ 기본 권한 적용 - 읽기만 허용
        if (action === 'read') {
          logInfo('기본 권한으로 이벤트 조회 허용', { userRole });
          next();
          return;
        } else {
          logWarning('이벤트 권한 설정 없음', { userRole, action });
          sendForbidden(
            res,
            `${getActionName(action)} 권한이 설정되지 않았습니다. 관리자에게 문의하세요.`
          );
          return;
        }
      }

      // ✅ 권한 체크
      const hasPermission = checkPermissionByAction(eventPermission, action);
      logInfo('이벤트 액션 권한 체크 결과', { action, hasPermission });

      if (!hasPermission) {
        logWarning('이벤트 권한 거부', { userRole, action });
        sendForbidden(res, `${getActionName(action)} 권한이 없습니다.`);
        return;
      }

      logInfo('이벤트 권한 허용', { userRole, action });
      next();
    } catch (error) {
      logError('이벤트 권한 체크 오류', error);
      sendError(res, 500, '권한 확인 중 오류가 발생했습니다.');
    }
  };
};

// ✅ 권한 체크 로직
function checkPermissionByAction(permission: EventPermission, action: string): boolean {
  switch (action) {
    case 'create':
      return permission.canCreate;
    case 'read':
      return permission.canRead;
    case 'update':
      return permission.canUpdate;
    case 'delete':
      return permission.canDelete;
    default:
      return false;
  }
}

function getActionName(action: string): string {
  const actionNames: Record<string, string> = {
    create: '일정 생성',
    read: '일정 조회',
    update: '일정 수정',
    delete: '일정 삭제',
  };
  return actionNames[action] || action;
}
