// server/src/controllers/report.controller.ts - 콘텐츠 신고 컨트롤러
import { Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import { reportService } from '../services/report.service';
import {
  sendSuccess,
  sendError,
  sendNotFound,
  sendValidationError,
  sendForbidden,
} from '../utils/response';
import { logInfo, logError } from '../utils/logger';
import { isAdminOrManager } from '../config/constants';
import type { ReportTargetType, ReportReason, ReportStatus } from '../models/Report';

const VALID_REASONS: ReportReason[] = [
  'spam',
  'abuse',
  'illegal',
  'privacy',
  'misinformation',
  'other',
];
const VALID_TARGET_TYPES: ReportTargetType[] = ['post', 'comment'];

// 신고 제출 (일반 사용자)
export const createReport = async (req: AuthRequest, res: Response): Promise<void> => {
  const { targetType, targetId, reason, description } = req.body as {
    targetType: string;
    targetId: string;
    reason: string;
    description?: string;
  };
  const reporterId = req.user.id;

  if (!VALID_TARGET_TYPES.includes(targetType as ReportTargetType)) {
    sendValidationError(res, 'targetType', '유효하지 않은 대상 타입입니다.');
    return;
  }
  if (!VALID_REASONS.includes(reason as ReportReason)) {
    sendValidationError(res, 'reason', '유효하지 않은 신고 사유입니다.');
    return;
  }
  if (!targetId || typeof targetId !== 'string' || targetId.trim().length === 0) {
    sendValidationError(res, 'targetId', '유효하지 않은 대상 ID입니다.');
    return;
  }
  if (description && description.length > 500) {
    sendValidationError(res, 'description', '설명은 500자 이내로 입력해주세요.');
    return;
  }

  try {
    const report = await reportService.createReport({
      reporterId,
      reporterRole: req.user.role,
      targetType: targetType as ReportTargetType,
      targetId,
      reason: reason as ReportReason,
      description,
    });
    logInfo('신고 접수', { reporterId, targetType, targetId, reason });
    sendSuccess(res, { id: report.id }, '신고가 접수되었습니다.', 201);
  } catch (err: unknown) {
    const appErr = err as { statusCode?: number; message?: string };
    if (appErr.statusCode === 404) {
      sendNotFound(res, '대상');
      return;
    }
    if (appErr.statusCode === 400) {
      sendError(res, 400, appErr.message ?? '잘못된 요청입니다.');
      return;
    }
    if (appErr.statusCode === 409) {
      sendError(res, 409, appErr.message ?? '이미 신고한 콘텐츠입니다.');
      return;
    }
    if (appErr.statusCode === 403) {
      sendForbidden(res, appErr.message ?? '신고 권한이 없습니다.');
      return;
    }
    logError('신고 접수 실패', err, { reporterId, targetType, targetId });
    sendError(res, 500, '신고 접수 중 오류가 발생했습니다.');
  }
};

// 신고 목록 조회 (관리자/매니저)
export const getReports = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!isAdminOrManager(req.user.role)) {
    sendForbidden(res, '권한이 없습니다.');
    return;
  }

  const status = req.query.status as ReportStatus | undefined;
  const targetType = req.query.targetType as ReportTargetType | undefined;
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20), 100);

  try {
    const result = await reportService.getReports({ status, targetType, page, limit });
    sendSuccess(res, result);
  } catch (err) {
    logError('신고 목록 조회 실패', err);
    sendError(res, 500, '신고 목록 조회 중 오류가 발생했습니다.');
  }
};

// 신고 처리 (관리자/매니저)
export const reviewReport = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!isAdminOrManager(req.user.role)) {
    sendForbidden(res, '권한이 없습니다.');
    return;
  }

  const reportId = parseInt(req.params.id, 10);
  if (isNaN(reportId)) {
    sendValidationError(res, 'id', '유효하지 않은 신고 ID입니다.');
    return;
  }

  const { status, reviewNote } = req.body as { status?: string; reviewNote?: string };
  const validStatuses = ['reviewed', 'dismissed', 'action_taken'];
  if (!status || !validStatuses.includes(status)) {
    sendValidationError(res, 'status', '유효하지 않은 처리 상태입니다.');
    return;
  }
  if (reviewNote && reviewNote.length > 1000) {
    sendValidationError(res, 'reviewNote', '처리 메모는 1,000자를 초과할 수 없습니다.');
    return;
  }

  try {
    const report = await reportService.reviewReport({
      reportId,
      reviewerId: req.user.id,
      status: status as 'reviewed' | 'dismissed' | 'action_taken',
      reviewNote,
    });
    logInfo('신고 처리 완료', { reportId, status, reviewerId: req.user.id });
    sendSuccess(res, report, '신고가 처리되었습니다.');
  } catch (err: unknown) {
    const appErr = err as { statusCode?: number; message?: string };
    if (appErr.statusCode === 404) {
      sendNotFound(res, '신고');
      return;
    }
    if (appErr.statusCode === 400) {
      sendError(res, 400, appErr.message ?? '이미 처리된 신고입니다.');
      return;
    }
    logError('신고 처리 실패', err, { reportId });
    sendError(res, 500, '신고 처리 중 오류가 발생했습니다.');
  }
};

// 신고 통계 (관리자/매니저)
export const getReportStats = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!isAdminOrManager(req.user.role)) {
    sendForbidden(res, '권한이 없습니다.');
    return;
  }

  try {
    const stats = await reportService.getReportStats();
    sendSuccess(res, stats);
  } catch (err) {
    logError('신고 통계 조회 실패', err);
    sendError(res, 500, '신고 통계 조회 중 오류가 발생했습니다.');
  }
};
