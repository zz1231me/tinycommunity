// server/src/services/attendance.service.ts
// 출퇴근 기록.
//
// 한 사람이 하루에 한 건이다. 출근을 찍을 때 그 시점의 확인 항목을 함께 저장한다.
// 항목은 나중에 관리자가 고칠 수 있으므로, 항목 표를 참조만 해 두면 지난 기록이
// "무엇을 확인하고 출근했는지" 를 잃는다. 그래서 답과 문구를 함께 박아 둔다.

import { Op, UniqueConstraintError } from 'sequelize';
import {
  AttendanceRecord,
  type ChecklistSnapshotEntry,
  type CheckInStatus,
  type CheckOutStatus,
} from '../models/AttendanceRecord';
import { AttendanceChecklistItem } from '../models/AttendanceChecklistItem';
import { AttendancePolicy } from '../models/AttendancePolicy';
import User from '../models/User';
import { BaseService } from './base.service';
import { AppError } from '../middlewares/error.middleware';
// 하루의 경계는 출석 포인트와 같아야 한다 — 같은 함수를 쓴다.
import { today } from './point.service';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MAX_NOTE = 500;
const MAX_LABEL = 200;
const MAX_DESCRIPTION = 500;
/** 인원별 집계에 올릴 사용자 수 상한 */
const SUMMARY_USER_LIMIT = 500;

export interface PolicyView {
  workStartTime: string;
  workEndTime: string;
  graceMinutes: number;
  requireChecklist: boolean;
}

export interface ChecklistItemView {
  id: number;
  label: string;
  description: string;
  required: boolean;
  order: number;
  isActive: boolean;
}

export interface RecordView {
  id: number;
  userId: string;
  userName?: string;
  workDate: string;
  checkInAt: string;
  checkInStatus: CheckInStatus;
  checkOutAt: string | null;
  checkOutStatus: CheckOutStatus | null;
  workMinutes: number | null;
  note: string;
  checklist: ChecklistSnapshotEntry[];
}

export interface UserSummary {
  userId: string;
  userName: string;
  days: number;
  lateDays: number;
  earlyLeaveDays: number;
  totalMinutes: number;
  lastWorkDate: string | null;
}

function parseTimeToMinutes(hhmm: string): number {
  const m = TIME_PATTERN.exec(hhmm);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

function minutesOfDay(at: Date): number {
  return at.getHours() * 60 + at.getMinutes();
}

function parseChecklist(raw: string): ChecklistSnapshotEntry[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toRecordView(record: AttendanceRecord, userName?: string): RecordView {
  return {
    id: record.id,
    userId: record.UserId,
    userName,
    workDate: record.workDate,
    checkInAt: record.checkInAt.toISOString(),
    checkInStatus: record.checkInStatus,
    checkOutAt: record.checkOutAt ? record.checkOutAt.toISOString() : null,
    checkOutStatus: record.checkOutStatus ?? null,
    workMinutes: record.workMinutes ?? null,
    note: record.note ?? '',
    checklist: parseChecklist(record.checklist),
  };
}

function toItemView(item: AttendanceChecklistItem): ChecklistItemView {
  return {
    id: item.id,
    label: item.label,
    description: item.description ?? '',
    required: item.required,
    order: item.order,
    isActive: item.isActive,
  };
}

function toPolicyView(policy: AttendancePolicy): PolicyView {
  return {
    workStartTime: policy.workStartTime,
    workEndTime: policy.workEndTime,
    graceMinutes: policy.graceMinutes,
    requireChecklist: policy.requireChecklist,
  };
}

/** YYYY-MM-DD 인지 — 잘못된 값이 그대로 쿼리에 들어가면 조용히 빈 결과가 된다 */
function isDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export class AttendanceService extends BaseService {
  /** 판정 기준은 한 행만 둔다. 없으면 기본값으로 만든다. */
  async getPolicy(): Promise<AttendancePolicy> {
    const existing = await AttendancePolicy.findOne({ order: [['id', 'ASC']] });
    if (existing) return existing;
    return AttendancePolicy.create({});
  }

  async getActiveChecklist(): Promise<AttendanceChecklistItem[]> {
    return AttendanceChecklistItem.findAll({
      where: { isActive: true },
      order: [
        ['order', 'ASC'],
        ['id', 'ASC'],
      ],
    });
  }

  /** 오늘 내 상태 — 화면이 출근/퇴근 중 무엇을 보여줄지 정하는 데 쓴다 */
  async getMyStatus(userId: string): Promise<{
    workDate: string;
    record: RecordView | null;
    checklist: ChecklistItemView[];
    policy: PolicyView;
  }> {
    const workDate = today();
    const [record, items, policy] = await Promise.all([
      AttendanceRecord.findOne({ where: { UserId: userId, workDate } }),
      this.getActiveChecklist(),
      this.getPolicy(),
    ]);
    return {
      workDate,
      record: record ? toRecordView(record) : null,
      checklist: items.map(toItemView),
      policy: toPolicyView(policy),
    };
  }

  async checkIn(
    userId: string,
    input: { responses: Array<{ itemId: number; checked: boolean }>; note?: string }
  ): Promise<RecordView> {
    const [items, policy] = await Promise.all([this.getActiveChecklist(), this.getPolicy()]);

    const answered = new Map<number, boolean>();
    for (const r of input.responses) answered.set(r.itemId, r.checked === true);

    if (policy.requireChecklist) {
      const missing = items.filter(i => i.required && answered.get(i.id) !== true);
      if (missing.length > 0) {
        throw new AppError(400, `확인하지 않은 항목이 있습니다: ${missing[0].label}`);
      }
    }

    const checklist: ChecklistSnapshotEntry[] = items.map(i => ({
      itemId: i.id,
      label: i.label,
      required: i.required,
      checked: answered.get(i.id) === true,
    }));

    const now = new Date();
    const limit = parseTimeToMinutes(policy.workStartTime) + policy.graceMinutes;
    const checkInStatus: CheckInStatus = minutesOfDay(now) > limit ? 'late' : 'normal';

    try {
      const record = await AttendanceRecord.create({
        UserId: userId,
        workDate: today(now),
        checkInAt: now,
        checkInStatus,
        note: (input.note ?? '').slice(0, MAX_NOTE),
        checklist: JSON.stringify(checklist),
      });
      return toRecordView(record);
    } catch (err) {
      // 하루 한 건은 유니크 인덱스가 지킨다. 버튼을 두 번 눌러도 여기서 걸린다.
      if (err instanceof UniqueConstraintError) {
        throw new AppError(409, '오늘 출근은 이미 기록되어 있습니다.');
      }
      throw err;
    }
  }

  async checkOut(userId: string): Promise<RecordView> {
    const workDate = today();
    const record = await AttendanceRecord.findOne({ where: { UserId: userId, workDate } });
    if (!record) throw new AppError(400, '오늘 출근 기록이 없습니다. 출근을 먼저 눌러주세요.');
    if (record.checkOutAt) throw new AppError(409, '오늘 퇴근은 이미 기록되어 있습니다.');

    const policy = await this.getPolicy();
    const now = new Date();
    const workMinutes = Math.max(0, Math.round((now.getTime() - record.checkInAt.getTime()) / 60000));
    const checkOutStatus: CheckOutStatus =
      minutesOfDay(now) < parseTimeToMinutes(policy.workEndTime) ? 'early' : 'normal';

    // 두 번 눌렀을 때 뒤에 온 요청이 시각을 덮어쓰지 않도록 조건부로 갱신한다.
    const [affected] = await AttendanceRecord.update(
      { checkOutAt: now, checkOutStatus, workMinutes },
      { where: { id: record.id, checkOutAt: null } }
    );
    if (affected === 0) throw new AppError(409, '오늘 퇴근은 이미 기록되어 있습니다.');

    await record.reload();
    return toRecordView(record);
  }

  /** 내 기록 — month 는 YYYY-MM */
  async getMyHistory(
    userId: string,
    month: string
  ): Promise<{ month: string; records: RecordView[]; summary: Omit<UserSummary, 'userId' | 'userName'> }> {
    const target = /^\d{4}-\d{2}$/.test(month) ? month : today().slice(0, 7);
    const records = await AttendanceRecord.findAll({
      where: { UserId: userId, workDate: { [Op.between]: [`${target}-01`, `${target}-31`] } },
      order: [['workDate', 'DESC']],
    });

    return {
      month: target,
      records: records.map(r => toRecordView(r)),
      summary: {
        days: records.length,
        lateDays: records.filter(r => r.checkInStatus === 'late').length,
        earlyLeaveDays: records.filter(r => r.checkOutStatus === 'early').length,
        totalMinutes: records.reduce((sum, r) => sum + (r.workMinutes ?? 0), 0),
        lastWorkDate: records[0]?.workDate ?? null,
      },
    };
  }

  // ── 관리자 ────────────────────────────────────────────────────────────────

  async listRecords(params: {
    from?: string;
    to?: string;
    userId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ records: RecordView[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 30), 100);

    const where: Record<string, unknown> = {};
    if (params.userId) where.UserId = params.userId;
    const range = this.dayRangeFilter(params.from, params.to);
    if (range) where.workDate = range;

    const { rows, count } = await AttendanceRecord.findAndCountAll({
      where,
      include: [{ model: User, as: 'user', attributes: ['id', 'name'], required: false }],
      // 같은 날짜가 여러 건이므로 id 로 확정 순서를 준다.
      // (MySQL/MariaDB 는 동점일 때 LIMIT/OFFSET 페이지 사이에 같은 행을 흘린다)
      order: [
        ['workDate', 'DESC'],
        ['id', 'DESC'],
      ],
      limit,
      offset: (page - 1) * limit,
    });

    return {
      records: rows.map(r => {
        const user = (r as AttendanceRecord & { user?: { name?: string } }).user;
        return toRecordView(r, user?.name);
      }),
      total: count,
      page,
      totalPages: Math.max(1, Math.ceil(count / limit)),
    };
  }

  /**
   * 인원별 집계. 기간 안에 한 번도 안 찍은 사람도 0 으로 넣는다 —
   * 명단에서 빠지면 "안 찍은 사람" 을 찾을 수 없다.
   */
  async listSummary(params: { from?: string; to?: string }): Promise<UserSummary[]> {
    const where: Record<string, unknown> = {};
    const range = this.dayRangeFilter(params.from, params.to);
    if (range) where.workDate = range;

    const [users, records] = await Promise.all([
      User.findAll({
        where: { isActive: true },
        attributes: ['id', 'name'],
        order: [['name', 'ASC']],
        limit: SUMMARY_USER_LIMIT,
      }),
      AttendanceRecord.findAll({ where }),
    ]);

    const byUser = new Map<string, UserSummary>();
    for (const u of users) {
      byUser.set(u.id, {
        userId: u.id,
        userName: u.name,
        days: 0,
        lateDays: 0,
        earlyLeaveDays: 0,
        totalMinutes: 0,
        lastWorkDate: null,
      });
    }

    for (const r of records) {
      const row = byUser.get(r.UserId);
      // 명단 상한을 넘거나 비활성으로 바뀐 사람의 기록은 집계에 올리지 않는다.
      if (!row) continue;
      row.days += 1;
      if (r.checkInStatus === 'late') row.lateDays += 1;
      if (r.checkOutStatus === 'early') row.earlyLeaveDays += 1;
      row.totalMinutes += r.workMinutes ?? 0;
      if (!row.lastWorkDate || r.workDate > row.lastWorkDate) row.lastWorkDate = r.workDate;
    }

    return [...byUser.values()];
  }

  async listChecklist(): Promise<ChecklistItemView[]> {
    const items = await AttendanceChecklistItem.findAll({
      order: [
        ['order', 'ASC'],
        ['id', 'ASC'],
      ],
    });
    return items.map(toItemView);
  }

  async createChecklistItem(data: {
    label: string;
    description?: string;
    required?: boolean;
  }): Promise<ChecklistItemView> {
    const label = data.label.trim();
    if (!label) throw new AppError(400, '항목 내용을 입력해주세요.');

    const maxOrder = (await AttendanceChecklistItem.max('order')) as number | null;
    const item = await AttendanceChecklistItem.create({
      label: label.slice(0, MAX_LABEL),
      description: (data.description ?? '').trim().slice(0, MAX_DESCRIPTION),
      required: data.required !== false,
      order: (maxOrder ?? 0) + 1,
    });
    return toItemView(item);
  }

  async updateChecklistItem(
    id: number,
    data: {
      label?: string;
      description?: string;
      required?: boolean;
      isActive?: boolean;
      order?: number;
    }
  ): Promise<ChecklistItemView> {
    const item = await AttendanceChecklistItem.findByPk(id);
    if (!item) throw new AppError(404, '확인 항목을 찾을 수 없습니다.');

    if (data.label !== undefined) {
      const label = data.label.trim();
      if (!label) throw new AppError(400, '항목 내용을 입력해주세요.');
      item.label = label.slice(0, MAX_LABEL);
    }
    if (data.description !== undefined) {
      item.description = data.description.trim().slice(0, MAX_DESCRIPTION);
    }
    if (data.required !== undefined) item.required = data.required;
    if (data.isActive !== undefined) item.isActive = data.isActive;
    if (data.order !== undefined) item.order = data.order;

    await item.save();
    return toItemView(item);
  }

  async deleteChecklistItem(id: number): Promise<void> {
    const removed = await AttendanceChecklistItem.destroy({ where: { id } });
    if (removed === 0) throw new AppError(404, '확인 항목을 찾을 수 없습니다.');
  }

  async updatePolicy(data: Partial<PolicyView>): Promise<PolicyView> {
    const policy = await this.getPolicy();

    if (data.workStartTime !== undefined) {
      if (!TIME_PATTERN.test(data.workStartTime)) {
        throw new AppError(400, '출근 기준 시각은 HH:MM 형식이어야 합니다.');
      }
      policy.workStartTime = data.workStartTime;
    }
    if (data.workEndTime !== undefined) {
      if (!TIME_PATTERN.test(data.workEndTime)) {
        throw new AppError(400, '퇴근 기준 시각은 HH:MM 형식이어야 합니다.');
      }
      policy.workEndTime = data.workEndTime;
    }
    if (data.graceMinutes !== undefined) {
      if (!Number.isInteger(data.graceMinutes) || data.graceMinutes < 0 || data.graceMinutes > 240) {
        throw new AppError(400, '지각 유예는 0~240분 사이의 정수여야 합니다.');
      }
      policy.graceMinutes = data.graceMinutes;
    }
    if (data.requireChecklist !== undefined) policy.requireChecklist = data.requireChecklist;

    await policy.save();
    return toPolicyView(policy);
  }

  /** from/to 를 workDate 조건으로. 형식이 어긋난 값은 없는 것으로 본다. */
  private dayRangeFilter(from?: string, to?: string): Record<symbol, unknown> | null {
    const start = from && isDay(from) ? from : null;
    const end = to && isDay(to) ? to : null;
    if (start && end) return { [Op.between]: [start, end] };
    if (start) return { [Op.gte]: start };
    if (end) return { [Op.lte]: end };
    return null;
  }
}

export const attendanceService = new AttendanceService();
