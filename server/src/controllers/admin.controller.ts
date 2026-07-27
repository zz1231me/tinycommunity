// src/controllers/admin.controller.ts - Service Layer 완전 적용
import { Response } from 'express';

import XLSX from 'xlsx-js-style';
import { userService } from '../services/user.service';
import { passwordResetRequestService } from '../services/passwordResetRequest.service';
import { boardService } from '../services/board.service';
import { roleService } from '../services/role.service';
import { eventService } from '../services/event.service';
import { Op } from 'sequelize';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { SecurityLog } from '../models/SecurityLog';
import { sendSuccess, sendError } from '../utils/response';
import { logError } from '../utils/logger';
import {
  invalidateCache,
  invalidateUserCache as invalidateUserResponseCache,
} from '../utils/cache';
import { invalidateUserCache, clearAllUserCaches } from '../middlewares/auth.middleware';

// 사용자 상태 변경 시 인증 미들웨어 캐시 + HTTP 응답 캐시(boards 등) 둘 다 무효화한다.
// auth.middleware.invalidateUserCache만 호출하면 cacheMiddleware('boards', 300)에 저장된
// /api/boards/accessible 사용자별 응답이 최대 5분간 stale 상태로 남는다.
const invalidateAllUserCaches = (userId: string): void => {
  invalidateUserCache(userId);
  invalidateUserResponseCache(userId);
};

// 역할 변경/삭제는 다수 사용자에게 영향(역할 비활성화·삭제 시 마이그레이션). 영향 사용자를
// 일일이 열거하지 않고 인증 캐시(roleInfo.isActive/tokenVersion 게이트) + boards 응답 캐시를
// 전체 무효화해, 취소된 권한이 TTL 동안 stale 하게 통과하지 않도록 한다.
const invalidateRoleAffectedCaches = (): void => {
  clearAllUserCaches();
  invalidateCache('boards');
};
import { AuthValidator } from '../validators/auth.validator';
import { FlatRequest as Request, type AuthRequest } from '../types/auth-request';
import { auditLogService } from '../services/auditLog.service';
import type { AuditAction } from '../models/AuditLog';
import { AppError } from '../middlewares/error.middleware';
import { SiteSettings } from '../models/SiteSettings';

function toAppError(err: unknown): AppError | null {
  return err instanceof AppError ? err : null;
}

/** 감사 로그용 관리자 컨텍스트 추출 */
const getAdminCtx = (req: Request) => {
  const authReq = req as unknown as AuthRequest;
  return {
    adminId: authReq.user?.id ?? 'unknown',
    adminName: authReq.user?.name ?? 'unknown',
    ipAddress: req.ip ?? null,
  };
};

/** 감사 로그 fire-and-forget 헬퍼 */
const logAudit = (
  req: Request,
  action: AuditAction,
  opts: {
    targetType: 'user' | 'board' | 'role' | 'event' | 'setting';
    targetId?: string | null;
    targetName?: string | null;
    beforeValue?: unknown;
    afterValue?: unknown;
  }
) => {
  const { adminId, adminName, ipAddress } = getAdminCtx(req);
  auditLogService
    .createAuditLog({ adminId, adminName, action, ipAddress, ...opts })
    .catch(err => logError('감사 로그 기록 실패', err));
};

// ===== 사용자 관리 =====
export const getDeletedUsers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await userService.getDeletedUsers(1000);
    sendSuccess(res, users);
  } catch (error) {
    logError('삭제된 사용자 조회 실패', error);
    sendError(res, 500, '삭제된 사용자 조회 실패');
  }
};

export const getAllUsers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await userService.getAllUsers(true, 1000);
    sendSuccess(res, users);
  } catch (error) {
    logError('사용자 조회 실패', error);
    sendError(res, 500, '사용자 조회 실패');
  }
};

export const approveUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const user = await userService.approveUser(userId);
    logAudit(req, 'approve_user', {
      targetType: 'user',
      targetId: userId,
      targetName: user.name,
      afterValue: { isActive: true },
    });
    sendSuccess(
      res,
      { userId: user.id, name: user.name, isActive: user.isActive },
      '회원이 승인되었습니다.'
    );
  } catch (error: unknown) {
    const appErr = toAppError(error);
    logError('회원 승인 실패', error);
    sendError(
      res,
      appErr?.statusCode ?? 500,
      appErr?.message ?? '회원 승인 중 오류가 발생했습니다.'
    );
  }
};

export const rejectUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    await userService.rejectUser(userId);
    logAudit(req, 'reject_user', { targetType: 'user', targetId: userId });
    sendSuccess(res, null, '회원 가입 신청이 거부되었습니다.');
  } catch (error: unknown) {
    const appErr = toAppError(error);
    logError('회원 가입 거부 실패', error);
    sendError(
      res,
      appErr?.statusCode ?? 500,
      appErr?.message ?? '회원 가입 거부 중 오류가 발생했습니다.'
    );
  }
};

export const deactivateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const adminId = (req as AuthRequest).user?.id;
    if (userId === adminId) {
      sendError(res, 400, '자기 자신을 비활성화할 수 없습니다.');
      return;
    }
    await userService.deactivateUser(userId);
    invalidateAllUserCaches(userId);
    logAudit(req, 'deactivate_user', {
      targetType: 'user',
      targetId: userId,
      afterValue: { isActive: false },
    });
    sendSuccess(res, null, '회원이 비활성화되었습니다.');
  } catch (error: unknown) {
    logError('회원 비활성화 실패', error);
    sendError(res, 500, toAppError(error)?.message ?? '회원 비활성화 실패');
  }
};

export const restoreUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    await userService.restoreUser(userId);
    invalidateAllUserCaches(userId);
    logAudit(req, 'restore_user', { targetType: 'user', targetId: userId });
    sendSuccess(res, null, '회원이 복구되었습니다.');
  } catch (error: unknown) {
    logError('회원 복구 실패', error);
    sendError(res, 500, toAppError(error)?.message ?? '회원 복구 실패');
  }
};

export const createUser = async (req: Request, res: Response): Promise<void> => {
  const { id, password, name, roleId } = req.body;

  const idValidation = AuthValidator.validateAdminUserId(id);
  if (!idValidation.valid) {
    sendError(res, 400, idValidation.error!);
    return;
  }

  const pwValidation = AuthValidator.validatePassword(password, true);
  if (!pwValidation.valid) {
    sendError(res, 400, pwValidation.error!);
    return;
  }

  const nameValidation = AuthValidator.validateName(name);
  if (!nameValidation.valid) {
    sendError(res, 400, nameValidation.error!);
    return;
  }

  try {
    await userService.createUser({ id, password, name, roleId, isActive: true });
    logAudit(req, 'create_user', {
      targetType: 'user',
      targetId: id,
      targetName: name,
      afterValue: { id, name, roleId, isActive: true },
    });
    sendSuccess(res, null, '사용자 생성 완료', 201);
  } catch (error: unknown) {
    const appErr = toAppError(error);
    logError('사용자 생성 실패', error);
    sendError(res, appErr?.statusCode ?? 500, appErr?.message ?? '사용자 생성 실패');
  }
};

export const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const { roleId } = updateData;
    const adminId = (req as unknown as AuthRequest).user?.id;

    // 관리자가 자기 자신의 역할을 변경하거나 비활성화하는 것을 방지
    if (adminId && adminId === id) {
      if (roleId !== undefined && roleId !== 'admin') {
        sendError(res, 400, '자기 자신의 역할을 변경할 수 없습니다.');
        return;
      }
      if (updateData.isActive === false) {
        sendError(res, 400, '자기 자신의 계정을 비활성화할 수 없습니다.');
        return;
      }
    }

    if (roleId) {
      const role = await Role.findByPk(roleId);
      if (!role) {
        sendError(res, 400, '존재하지 않는 역할입니다.');
        return;
      }
      if (!role.isActive) {
        sendError(res, 400, '비활성화된 역할에는 사용자를 배정할 수 없습니다.');
        return;
      }
    }

    // ✅ name 길이/빈값 검증
    if (updateData.name !== undefined) {
      const trimmedName = String(updateData.name).trim();
      if (!trimmedName || trimmedName.length < 1 || trimmedName.length > 50) {
        sendError(res, 400, '이름은 1자 이상 50자 이하로 입력해주세요.');
        return;
      }
      updateData.name = trimmedName;
    }

    // ✅ email lowercase 정규화
    if (updateData.email !== undefined && updateData.email !== null) {
      updateData.email = String(updateData.email).toLowerCase().trim();
    }

    await userService.updateUser(id, updateData);
    invalidateAllUserCaches(id);
    logAudit(req, 'update_user', {
      targetType: 'user',
      targetId: id,
      afterValue: updateData,
    });
    sendSuccess(res, null, '사용자 정보 수정 완료');
  } catch (error: unknown) {
    const appErr = toAppError(error);
    logError('사용자 수정 실패', error);
    sendError(res, appErr?.statusCode ?? 500, appErr?.message ?? '사용자 수정 실패');
  }
};

export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const adminId = (req as unknown as AuthRequest).user?.id;

    if (adminId && adminId === id) {
      sendError(res, 400, '자기 자신의 계정을 삭제할 수 없습니다.');
      return;
    }

    const result = await userService.deleteUser(id);
    logAudit(req, 'delete_user', { targetType: 'user', targetId: id });
    sendSuccess(res, result);
  } catch (error: unknown) {
    const appErr = toAppError(error);
    logError('사용자 삭제 실패', error);
    sendError(res, appErr?.statusCode ?? 500, appErr?.message ?? '사용자 삭제 실패');
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { tempPassword: rawTemp } = req.body as { tempPassword?: unknown };
    const adminId = (req as unknown as AuthRequest).user?.id;

    // 자기 자신의 비밀번호를 초기화하면 즉시 세션이 무효화되어 로그아웃됨
    // deactivateUser/deleteUser와 일관되게 self-action 차단 (클라이언트도 차단하지만 server-side 방어)
    if (adminId && adminId === id) {
      sendError(
        res,
        400,
        '자기 자신의 비밀번호는 초기화할 수 없습니다. 프로필에서 비밀번호 변경을 이용해주세요.'
      );
      return;
    }

    // 관리자가 입력한 6자리 숫자 임시 비밀번호 (서버에서도 형식 검증 — 클라 신뢰 안 함)
    const tempCode = String(rawTemp ?? '');
    if (!/^\d{6}$/.test(tempCode)) {
      sendError(res, 400, '임시 비밀번호는 6자리 숫자로 입력해주세요.');
      return;
    }

    // 임시 비번 설정 + 강제 변경 플래그
    const tempPassword = await userService.resetPassword(id, tempCode);
    invalidateAllUserCaches(id);
    logAudit(req, 'reset_password', {
      targetType: 'user',
      targetId: id,
      afterValue: { changed: true, mustChangePassword: true },
    });
    sendSuccess(res, { tempPassword }, '비밀번호가 초기화되었습니다.');
  } catch (error: unknown) {
    const appErr = toAppError(error);
    logError('비밀번호 재설정 실패', error);
    sendError(res, appErr?.statusCode ?? 500, appErr?.message ?? '비밀번호 재설정 실패');
  }
};

// ===== 비밀번호 초기화 요청 (사용자 요청 → 관리자 승인) =====

export const getPasswordResetRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = (req.query.status as string) || 'pending';
    const status = (['pending', 'approved', 'rejected'].includes(raw) ? raw : 'pending') as
      | 'pending'
      | 'approved'
      | 'rejected';
    const requests = await passwordResetRequestService.listRequests(status);
    sendSuccess(res, requests);
  } catch (error) {
    logError('비밀번호 초기화 요청 목록 조회 실패', error);
    sendError(res, 500, '요청 목록 조회 실패');
  }
};

export const approvePasswordResetRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const adminId = (req as unknown as AuthRequest).user?.id ?? 'unknown';
    // ⚠️ 수락은 곧 신원 검증 — 관리자가 오프라인으로 본인 확인 후 수락해야 한다(클라 UI에 경고 표시).
    const { token, user } = await passwordResetRequestService.approve(id, adminId);
    // (자기 자신 요청 자가승인 차단은 서비스 approve 내부에서 처리)
    logAudit(req, 'approve_password_reset', {
      targetType: 'user',
      targetId: user.id,
      afterValue: { approved: true },
    });
    // 평문 토큰을 관리자에게만 반환 — 관리자가 재설정 링크를 본인에게 전달한다(이메일 인프라 없음).
    sendSuccess(
      res,
      { token, loginId: user.id },
      '요청을 수락했습니다. 재설정 링크를 본인에게 전달하세요.'
    );
  } catch (error) {
    const appErr = toAppError(error);
    logError('비밀번호 초기화 요청 수락 실패', error);
    sendError(res, appErr?.statusCode ?? 500, appErr?.message ?? '요청 수락 실패');
  }
};

export const rejectPasswordResetRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const adminId = (req as unknown as AuthRequest).user?.id ?? 'unknown';
    const { userId } = await passwordResetRequestService.reject(id, adminId);
    logAudit(req, 'reject_password_reset', { targetType: 'user', targetId: userId });
    sendSuccess(res, null, '요청을 거절했습니다.');
  } catch (error) {
    const appErr = toAppError(error);
    logError('비밀번호 초기화 요청 거절 실패', error);
    sendError(res, appErr?.statusCode ?? 500, appErr?.message ?? '요청 거절 실패');
  }
};

// ===== 게시판 관리 =====
export const getAllBoards = async (_req: Request, res: Response): Promise<void> => {
  try {
    const boards = await boardService.getAllBoards();
    sendSuccess(res, boards);
  } catch (error) {
    logError('게시판 조회 실패', error);
    sendError(res, 500, '게시판 조회 실패');
  }
};

export const createBoard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, name, description, order } = req.body;

    if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]{2,50}$/.test(id.trim())) {
      sendError(res, 400, '게시판 ID는 2~50자의 영문/숫자/-/_ 만 허용됩니다.');
      return;
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      sendError(res, 400, '게시판 이름은 필수입니다.');
      return;
    }
    if (name.trim().length > 100) {
      sendError(res, 400, '게시판 이름은 100자를 초과할 수 없습니다.');
      return;
    }
    if (description !== undefined && typeof description === 'string' && description.length > 500) {
      sendError(res, 400, '게시판 설명은 500자를 초과할 수 없습니다.');
      return;
    }

    await boardService.createBoard({ id: id.trim(), name: name.trim(), description, order });
    invalidateCache('boards'); // 사이드바/접근 가능 게시판 목록 즉시 반영
    logAudit(req, 'create_board', {
      targetType: 'board',
      targetId: id.trim(),
      targetName: name.trim(),
    });
    sendSuccess(res, null, '게시판 생성 완료', 201);
  } catch (error: unknown) {
    const appErr = toAppError(error);
    // 중복 ID(409)·예약 ID(400) 등 클라이언트 오류는 해당 상태코드로 전달 (500 오인 방지)
    if (appErr?.statusCode && appErr.statusCode < 500) {
      sendError(res, appErr.statusCode, appErr.message);
      return;
    }
    logError('게시판 생성 실패', error);
    sendError(res, 500, appErr?.message ?? '게시판 생성 실패');
  }
};

export const updateBoard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, order, isActive } = req.body;

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        sendError(res, 400, '게시판 이름은 빈 값으로 변경할 수 없습니다.');
        return;
      }
      if (name.trim().length > 100) {
        sendError(res, 400, '게시판 이름은 100자를 초과할 수 없습니다.');
        return;
      }
    }
    if (description !== undefined && typeof description === 'string' && description.length > 500) {
      sendError(res, 400, '게시판 설명은 500자를 초과할 수 없습니다.');
      return;
    }

    await boardService.updateBoard(id, { name: name?.trim(), description, order, isActive });
    invalidateCache('boards'); // 이름/활성/순서 변경 즉시 반영
    logAudit(req, 'update_board', {
      targetType: 'board',
      targetId: id,
      afterValue: { name, description, order, isActive },
    });
    sendSuccess(res, null, '게시판 수정 완료');
  } catch (error: unknown) {
    const appErr = toAppError(error);
    if (appErr?.statusCode && appErr.statusCode < 500) {
      sendError(res, appErr.statusCode, appErr.message);
      return;
    }
    logError('게시판 수정 실패', error);
    sendError(res, 500, appErr?.message ?? '게시판 수정 실패');
  }
};

export const deleteBoard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await boardService.deleteBoard(id);
    invalidateCache('boards'); // 삭제된 게시판이 사이드바에 잔존하지 않도록
    logAudit(req, 'delete_board', { targetType: 'board', targetId: id });
    sendSuccess(res, null, '게시판 삭제 완료');
  } catch (error: unknown) {
    const appErr = toAppError(error);
    if (appErr?.statusCode && appErr.statusCode < 500) {
      sendError(res, appErr.statusCode, appErr.message);
      return;
    }
    logError('게시판 삭제 실패', error);
    sendError(res, 500, appErr?.message ?? '게시판 삭제 실패');
  }
};

// ===== 역할 관리 =====
export const getAllRoles = async (_req: Request, res: Response): Promise<void> => {
  try {
    const roles = await roleService.getAllRoles();
    sendSuccess(res, roles);
  } catch (error) {
    logError('역할 조회 실패', error);
    sendError(res, 500, '역할 조회 실패');
  }
};

export const createRole = async (req: Request, res: Response): Promise<void> => {
  const { id, name, description } = req.body;
  if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]{2,50}$/.test(id.trim())) {
    sendError(res, 400, '역할 ID는 2~50자의 영문/숫자/-/_ 만 허용됩니다.');
    return;
  }
  if (!name || !String(name).trim()) {
    sendError(res, 400, '역할 이름은 필수입니다.');
    return;
  }
  try {
    await roleService.createRole({ id: id.trim(), name: String(name).trim(), description });
    logAudit(req, 'create_role', {
      targetType: 'role',
      targetId: id.trim(),
      targetName: String(name).trim(),
    });
    sendSuccess(res, null, '역할 생성 완료', 201);
  } catch (error: unknown) {
    const appErr = toAppError(error);
    logError('역할 생성 실패', error);
    sendError(res, appErr?.statusCode ?? 500, appErr?.message ?? '역할 생성 실패');
  }
};

export const updateRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, isActive } = req.body;
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed || trimmed.length > 50) {
        sendError(res, 400, '역할 이름은 1~50자 이내로 입력해주세요.');
        return;
      }
    }
    if (description !== undefined && String(description).length > 500) {
      sendError(res, 400, '역할 설명은 500자 이내로 입력해주세요.');
      return;
    }
    await roleService.updateRole(id, { name, description, isActive });
    invalidateRoleAffectedCaches();
    logAudit(req, 'update_role', {
      targetType: 'role',
      targetId: id,
      afterValue: { name, description, isActive },
    });
    sendSuccess(res, null, '역할 수정 완료');
  } catch (error: unknown) {
    const appErr = toAppError(error);
    logError('역할 수정 실패', error);
    sendError(res, appErr?.statusCode ?? 500, appErr?.message ?? '역할 수정 실패');
  }
};

export const deleteRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await roleService.deleteRole(id);
    invalidateRoleAffectedCaches();
    logAudit(req, 'delete_role', { targetType: 'role', targetId: id });
    sendSuccess(res, null, '역할 삭제 완료');
  } catch (error: unknown) {
    const appErr = toAppError(error);
    logError('역할 삭제 실패', error);
    sendError(res, appErr?.statusCode ?? 500, appErr?.message ?? '역할 삭제 실패');
  }
};

// ===== 게시판 권한 관리 =====
export const getBoardAccessPermissions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { boardId } = req.params;
    const permissions = await roleService.getBoardAccessPermissions(boardId);
    sendSuccess(res, permissions);
  } catch (error) {
    logError('권한 조회 실패', error);
    sendError(res, 500, '권한 조회 실패');
  }
};

// 전체 게시판 권한 일괄 조회 (관리자 권한 화면 — 보드별 N요청 대신 1요청)
export const getAllBoardAccessPermissions = async (_req: Request, res: Response): Promise<void> => {
  try {
    const permissions = await roleService.getAllBoardAccessPermissions();
    sendSuccess(res, permissions);
  } catch (error) {
    logError('전체 권한 조회 실패', error);
    sendError(res, 500, '권한 조회 실패');
  }
};

export const setBoardAccessPermissions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { boardId } = req.params;
    const { permissions } = req.body;
    if (!Array.isArray(permissions)) {
      sendError(res, 400, 'permissions는 배열이어야 합니다.');
      return;
    }
    await roleService.setBoardAccessPermissions(boardId, permissions);
    // invalidateCache('boards')는 boards:userId:url 형태의 사용자별 캐시까지 모두 매치하여 무효화한다.
    // 서버 측 권한 enforcement는 boardService.checkPermission이 매 요청 DB를 조회하므로 즉시 반영.
    invalidateCache('boards');
    logAudit(req, 'update_permission', {
      targetType: 'board',
      targetId: boardId,
      afterValue: { permissions },
    });
    sendSuccess(res, null, '권한 설정 완료');
  } catch (error) {
    logError('권한 설정 실패', error);
    sendError(res, 500, '권한 설정 실패');
  }
};

// ===== 이벤트 관리 =====
export const getAllEvents = async (_req: Request, res: Response): Promise<void> => {
  try {
    const events = await eventService.getAllEvents();
    sendSuccess(res, events);
  } catch (error) {
    logError('이벤트 조회 실패', error);
    sendError(res, 500, '이벤트 조회 실패');
  }
};

export const deleteEventAsAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await eventService.deleteEvent(id);
    logAudit(req, 'delete_event', { targetType: 'event', targetId: id });
    sendSuccess(res, null, '이벤트 삭제 완료');
  } catch (error: unknown) {
    const appErr = toAppError(error);
    logError('이벤트 삭제 실패', error);
    sendError(res, appErr?.statusCode ?? 500, appErr?.message ?? '이벤트 삭제 실패');
  }
};

export const updateEventAsAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    // ✅ allowlist: UserId·id 등 민감 필드 덮어쓰기 방지
    const {
      title,
      start,
      end,
      body,
      location,
      color,
      backgroundColor,
      dragBackgroundColor,
      borderColor,
      isAllday,
      recurrenceType,
      recurrenceInterval,
      recurrenceEndDate,
      calendarId,
    } = req.body as Record<string, unknown>;
    if (body && String(body).length > 10000) {
      sendError(res, 400, '내용은 10,000자를 초과할 수 없습니다.');
      return;
    }
    if (location && String(location).length > 500) {
      sendError(res, 400, '장소는 500자를 초과할 수 없습니다.');
      return;
    }

    const event = await eventService.updateEvent(id, {
      title,
      start,
      end,
      body,
      location,
      color,
      backgroundColor,
      dragBackgroundColor,
      borderColor,
      isAllday,
      recurrenceType,
      recurrenceInterval,
      recurrenceEndDate,
      calendarId,
    } as Parameters<typeof eventService.updateEvent>[1]);
    logAudit(req, 'update_event', { targetType: 'event', targetId: id });
    sendSuccess(res, event, '이벤트 수정 완료');
  } catch (error: unknown) {
    const appErr = toAppError(error);
    logError('이벤트 수정 실패', error);
    sendError(res, appErr?.statusCode ?? 500, appErr?.message ?? '이벤트 수정 실패');
  }
};

// ===== 이벤트 권한 관리 =====
export const getEventPermissionsByRole = async (_req: Request, res: Response): Promise<void> => {
  try {
    const permissions = await eventService.getEventPermissionsByRole();
    sendSuccess(res, permissions);
  } catch (error) {
    logError('이벤트 권한 조회 실패', error);
    sendError(res, 500, '이벤트 권한 조회 실패');
  }
};

export const setEventPermissions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { permissions } = req.body;
    if (!Array.isArray(permissions)) {
      sendError(res, 400, '권한 배열이 필요합니다.');
      return;
    }
    // roleId 존재 검증 (존재하지 않는 role에 권한을 부여하면 조용히 실패)
    const roleIds = (permissions as Array<{ roleId?: unknown }>)
      .map(p => p.roleId)
      .filter((id): id is string => typeof id === 'string');
    const uniqueRoleIds = [...new Set(roleIds)];
    if (uniqueRoleIds.length > 0) {
      const existingRoles = await Role.findAll({
        where: { id: { [Op.in]: uniqueRoleIds } },
        attributes: ['id'],
      });
      if (existingRoles.length !== uniqueRoleIds.length) {
        sendError(res, 400, '존재하지 않는 역할 ID가 포함되어 있습니다.');
        return;
      }
    }
    // 중복 roleId 제거 후 서비스에 전달
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uniquePermissions = (permissions as any[]).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p: any, idx: number, arr: any[]) => arr.findIndex((q: any) => q.roleId === p.roleId) === idx
    );
    await eventService.setEventPermissions(uniquePermissions);
    logAudit(req, 'update_permission', {
      targetType: 'event',
      afterValue: { permissions },
    });
    sendSuccess(res, null, '이벤트 권한 설정 완료');
  } catch (error) {
    logError('이벤트 권한 설정 실패', error);
    sendError(res, 500, '이벤트 권한 설정 실패');
  }
};

// ===== 위키 권한 관리 =====

export const getWikiPermissions = async (_req: Request, res: Response): Promise<void> => {
  try {
    const settings = await SiteSettings.findOne();
    let roles: string[] = ['admin', 'manager'];
    if (settings?.wikiEditRoles) {
      try {
        const parsed = JSON.parse(settings.wikiEditRoles);
        if (Array.isArray(parsed) && parsed.every(r => typeof r === 'string')) {
          roles = parsed;
        }
      } catch {
        // 파싱 실패 시 기본값 유지
      }
    }
    sendSuccess(res, { roles });
  } catch (error) {
    logError('위키 권한 조회 실패', error);
    sendError(res, 500, '위키 권한 조회 실패');
  }
};

export const setWikiPermissions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { roles } = req.body as { roles: unknown };
    if (!Array.isArray(roles) || roles.some(r => typeof r !== 'string')) {
      sendError(res, 400, '역할 배열(문자열)이 필요합니다.');
      return;
    }
    // 중복 역할 제거 (중복 시 existingRoles.length !== roles.length 오탐 방지)
    const uniqueRoles = [...new Set(roles as string[])];
    // ✅ roles가 실제 DB에 존재하는지 검증 (존재하지 않는 roleId는 위키 접근을 영구 차단)
    if (uniqueRoles.length > 0) {
      const existingRoles = await Role.findAll({
        where: { id: { [Op.in]: uniqueRoles } },
        attributes: ['id'],
      });
      if (existingRoles.length !== uniqueRoles.length) {
        sendError(res, 400, '존재하지 않는 역할 ID가 포함되어 있습니다.');
        return;
      }
    }
    const [settings] = await SiteSettings.findOrCreate({ where: {} });
    settings.wikiEditRoles = JSON.stringify(uniqueRoles);
    await settings.save();
    logAudit(req, 'update_permission', {
      targetType: 'setting',
      afterValue: { wikiEditRoles: uniqueRoles },
    });
    sendSuccess(res, { roles }, '위키 편집 권한 설정 완료');
  } catch (error) {
    logError('위키 권한 설정 실패', error);
    sendError(res, 500, '위키 권한 설정 실패');
  }
};

// ===== 엑셀 내보내기 헬퍼 =====

interface SheetColumn {
  label: string;
  key: string;
  width: number;
}

function xlsxHeaderCell(value: string, rgb: string): XLSX.CellObject {
  return {
    v: value,
    t: 's',
    s: {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb } },
    },
  };
}

// CSV/XLSX injection 방지: =, +, -, @, TAB, CR 로 시작하는 셀 값은 앞에 `'`를 붙여
// Excel/Sheets가 수식으로 해석하지 못하도록 한다.
function sanitizeCellValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  const s = String(value);
  if (s.length === 0) return s;
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function buildXlsxSheet(
  columns: SheetColumn[],
  rows: Record<string, string>[],
  headerRgb: string
): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};

  columns.forEach(({ label }, ci) => {
    ws[XLSX.utils.encode_cell({ r: 0, c: ci })] = xlsxHeaderCell(label, headerRgb);
  });

  rows.forEach((row, ri) => {
    columns.forEach(({ key }, ci) => {
      ws[XLSX.utils.encode_cell({ r: ri + 1, c: ci })] = {
        v: sanitizeCellValue(row[key]),
        t: 's',
      };
    });
  });

  ws['!cols'] = columns.map(({ width }) => ({ wch: width }));
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: rows.length, c: columns.length - 1 },
  });

  return ws;
}

function sendXlsx(res: Response, ws: XLSX.WorkSheet, sheetName: string, filename: string): void {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buf);
}

// ===== 엑셀 내보내기 =====
export const exportUsersExcel = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await User.findAll({
      where: { isDeleted: false },
      attributes: ['id', 'name', 'email', 'roleId', 'isActive', 'lastLoginAt', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 10000,
    });

    const columns: SheetColumn[] = [
      { label: 'ID', key: 'id', width: 15 },
      { label: '이름', key: 'name', width: 20 },
      { label: '이메일', key: 'email', width: 30 },
      { label: '역할', key: 'roleId', width: 12 },
      { label: '활성', key: 'isActive', width: 8 },
      { label: '마지막 로그인', key: 'lastLoginAt', width: 22 },
      { label: '가입일', key: 'createdAt', width: 22 },
    ];

    const rows = users.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email ?? '-',
      roleId: user.roleId,
      isActive: user.isActive ? '활성' : '비활성',
      lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('ko-KR') : '-',
      createdAt: new Date(user.createdAt).toLocaleString('ko-KR'),
    }));

    const ws = buildXlsxSheet(columns, rows, '4F46E5');
    sendXlsx(res, ws, '사용자 목록', `users-${Date.now()}.xlsx`);
  } catch (err) {
    logError('사용자 엑셀 내보내기 실패', err);
    sendError(res, 500, '엑셀 내보내기 실패');
  }
};

export const exportSecurityLogsExcel = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const logs = await SecurityLog.findAll({
      order: [['createdAt', 'DESC']],
      limit: 10000,
    });

    const columns: SheetColumn[] = [
      { label: 'ID', key: 'id', width: 36 },
      { label: '사용자 ID', key: 'userId', width: 15 },
      { label: 'IP 주소', key: 'ipAddress', width: 18 },
      { label: '액션', key: 'action', width: 20 },
      { label: '메서드', key: 'method', width: 10 },
      { label: '경로', key: 'route', width: 40 },
      { label: '상태', key: 'status', width: 12 },
      { label: '일시', key: 'createdAt', width: 22 },
    ];

    const rows = logs.map(log => ({
      id: log.id,
      userId: log.userId ?? '-',
      ipAddress: log.ipAddress ?? '-',
      action: log.action,
      method: log.method,
      route: log.route,
      status: log.status,
      createdAt: log.createdAt ? new Date(log.createdAt).toLocaleString('ko-KR') : '-',
    }));

    const ws = buildXlsxSheet(columns, rows, '1E40AF');
    sendXlsx(res, ws, '보안 로그', `security-logs-${Date.now()}.xlsx`);
  } catch (err) {
    logError('보안 로그 엑셀 내보내기 실패', err);
    sendError(res, 500, '엑셀 내보내기 실패');
  }
};
