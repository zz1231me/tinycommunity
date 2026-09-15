import { Response } from 'express';
import { AuthRequest } from '../types/auth-request';
import { sendSuccess, sendError, sendValidationError, sendUnauthorized } from '../utils/response';
import { logError } from '../utils/logger';
import { attendanceService } from '../services/attendance.service';
import { auditLogService } from '../services/auditLog.service';
import { AppError } from '../middlewares/error.middleware';

/** 컨트롤러마다 같은 모양으로 반복되던 오류 처리 */
async function run(
  res: Response,
  label: string,
  context: Record<string, unknown>,
  work: () => Promise<void>
): Promise<void> {
  try {
    await work();
  } catch (err) {
    if (err instanceof AppError) return sendError(res, err.statusCode, err.message);
    logError(`${label} 실패`, err, context);
    sendError(res, 500, `${label} 중 오류가 발생했습니다.`);
  }
}

function requireUser(req: AuthRequest, res: Response): string | null {
  const userId = req.user?.id;
  if (!userId) {
    sendUnauthorized(res, '로그인이 필요합니다.');
    return null;
  }
  return userId;
}

/**
 * 확인 항목·근무 설정 변경을 감사 로그에 남긴다.
 *
 * 확인 항목이 곧 기록의 근거라, 누가 언제 바꿨는지가 없으면 지난 기록을 믿을 수 없다.
 */
function recordSettingChange(
  req: AuthRequest,
  targetName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  values: { before?: any; after?: any }
): void {
  void auditLogService
    .createAuditLog({
      adminId: req.user?.id ?? 'unknown',
      adminName: req.user?.name ?? 'unknown',
      action: 'update_attendance_settings',
      targetType: 'attendance',
      targetName,
      beforeValue: values.before,
      afterValue: values.after,
      ipAddress: req.ip ?? null,
    })
    .catch(err => logError('감사 로그 기록 실패 (출퇴근 설정)', err));
}

function parseId(value: string, res: Response): number | null {
  const id = Number.parseInt(value, 10);
  if (Number.isNaN(id)) {
    sendValidationError(res, 'id', '잘못된 항목 ID입니다.');
    return null;
  }
  return id;
}

// ── 본인 ──────────────────────────────────────────────────────────────────

export const getMyAttendance = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  await run(res, '출퇴근 현황 조회', { userId }, async () => {
    sendSuccess(res, await attendanceService.getMyStatus(userId));
  });
};

export const checkIn = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const { responses, note } = req.body;
  await run(res, '출근 기록', { userId }, async () => {
    const record = await attendanceService.checkIn(userId, {
      responses: Array.isArray(responses) ? responses : [],
      note,
    });
    sendSuccess(res, record, '출근이 기록되었습니다.', 201);
  });
};

export const checkOut = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  await run(res, '퇴근 기록', { userId }, async () => {
    sendSuccess(res, await attendanceService.checkOut(userId), '퇴근이 기록되었습니다.');
  });
};

export const getMyAttendanceHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const month = typeof req.query.month === 'string' ? req.query.month : '';
  await run(res, '출퇴근 기록 조회', { userId }, async () => {
    sendSuccess(res, await attendanceService.getMyHistory(userId, month));
  });
};

// ── 관리자 ────────────────────────────────────────────────────────────────

const asText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

export const getAttendanceRecords = async (req: AuthRequest, res: Response): Promise<void> => {
  await run(res, '출퇴근 기록 조회', {}, async () => {
    sendSuccess(
      res,
      await attendanceService.listRecords({
        from: asText(req.query.from),
        to: asText(req.query.to),
        userId: asText(req.query.userId),
        page: Number.parseInt(String(req.query.page ?? '1'), 10) || 1,
        limit: Number.parseInt(String(req.query.limit ?? '30'), 10) || 30,
      })
    );
  });
};

export const getAttendanceSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  await run(res, '출퇴근 집계 조회', {}, async () => {
    sendSuccess(
      res,
      await attendanceService.listSummary({
        from: asText(req.query.from),
        to: asText(req.query.to),
      })
    );
  });
};

export const getAttendanceSettings = async (_req: AuthRequest, res: Response): Promise<void> => {
  await run(res, '출퇴근 설정 조회', {}, async () => {
    const [checklist, policy] = await Promise.all([
      attendanceService.listChecklist(),
      attendanceService.getPolicy(),
    ]);
    sendSuccess(res, {
      checklist,
      policy: {
        standardWorkMinutes: policy.standardWorkMinutes,
        requireChecklist: policy.requireChecklist,
        noticeText: policy.noticeText,
      },
    });
  });
};

export const createAttendanceChecklistItem = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { label, description, required } = req.body;
  await run(res, '확인 항목 추가', {}, async () => {
    const item = await attendanceService.createChecklistItem({ label, description, required });
    recordSettingChange(req, `확인 항목 추가: ${item.label}`, { after: item });
    sendSuccess(res, item, '확인 항목이 추가되었습니다.', 201);
  });
};

export const updateAttendanceChecklistItem = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const id = parseId(req.params.id, res);
  if (id === null) return;
  const { label, description, required, isActive, order } = req.body;
  await run(res, '확인 항목 수정', { itemId: id }, async () => {
    const before = await attendanceService.getChecklistItem(id);
    const item = await attendanceService.updateChecklistItem(id, {
      label,
      description,
      required,
      isActive,
      order,
    });
    recordSettingChange(req, `확인 항목 수정: ${item.label}`, { before, after: item });
    sendSuccess(res, item);
  });
};

export const deleteAttendanceChecklistItem = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const id = parseId(req.params.id, res);
  if (id === null) return;
  await run(res, '확인 항목 삭제', { itemId: id }, async () => {
    const before = await attendanceService.getChecklistItem(id);
    await attendanceService.deleteChecklistItem(id);
    recordSettingChange(req, `확인 항목 삭제: ${before?.label ?? id}`, { before });
    sendSuccess(res, null, '확인 항목이 삭제되었습니다.');
  });
};

export const updateAttendancePolicy = async (req: AuthRequest, res: Response): Promise<void> => {
  const { standardWorkMinutes, requireChecklist, noticeText } = req.body;
  await run(res, '출퇴근 설정 저장', {}, async () => {
    const before = await attendanceService.getPolicyView();
    const after = await attendanceService.updatePolicy({
      standardWorkMinutes,
      requireChecklist,
      noticeText,
    });
    recordSettingChange(req, '근무 설정', { before, after });
    sendSuccess(res, after, '설정이 저장되었습니다.');
  });
};

export const getAttendanceToday = async (_req: AuthRequest, res: Response): Promise<void> => {
  await run(res, '오늘 출근 현황 조회', {}, async () => {
    sendSuccess(res, await attendanceService.getTodayBoard());
  });
};

export const reorderAttendanceChecklist = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { ids } = req.body;
  await run(res, '확인 항목 순서 저장', {}, async () => {
    const items = await attendanceService.reorderChecklist(ids);
    recordSettingChange(req, '확인 항목 순서', { after: items.map(i => i.label) });
    sendSuccess(res, items);
  });
};
