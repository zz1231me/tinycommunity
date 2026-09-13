// server/src/services/attendance.service.ts
// 출퇴근 기록.
//
// 한 사람이 하루에 한 건이다. 출근을 찍을 때 그 시점의 확인 항목을 함께 저장한다.
// 항목은 나중에 관리자가 고칠 수 있으므로, 항목 표를 참조만 해 두면 지난 기록이
// "무엇을 확인하고 출근했는지" 를 잃는다. 그래서 답과 문구를 함께 박아 둔다.
//
// 지각·조기 퇴근 같은 판정은 하지 않는다. 남기는 것은 찍은 시각과 그 사이의 시간뿐이다.

import { Op, UniqueConstraintError } from 'sequelize';
import { AttendanceRecord, type ChecklistSnapshotEntry } from '../models/AttendanceRecord';
import { AttendanceChecklistItem } from '../models/AttendanceChecklistItem';
import { AttendancePolicy } from '../models/AttendancePolicy';
import User from '../models/User';
import { BaseService } from './base.service';
import { AppError } from '../middlewares/error.middleware';
// 하루의 경계는 출석 포인트와 같아야 한다 — 같은 함수를 쓴다.
import { today } from './point.service';

const MAX_NOTE = 500;
const MAX_LABEL = 200;
const MAX_DESCRIPTION = 500;
/** 명단에 올릴 사용자 수 상한 */
const USER_LIMIT = 500;

export interface PolicyView {
  standardWorkMinutes: number;
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
  checkOutAt: string | null;
  workMinutes: number | null;
  note: string;
  checklist: ChecklistSnapshotEntry[];
}

export interface UserSummary {
  userId: string;
  userName: string;
  days: number;
  totalMinutes: number;
  /** 퇴근까지 찍은 날의 평균. 근무 중인 날은 빼고 센다. */
  averageMinutes: number;
  /** 아직 퇴근을 찍지 않은 날 수 */
  openDays: number;
  lastWorkDate: string | null;
}

export interface TodayRow {
  userId: string;
  userName: string;
  state: 'working' | 'done' | 'absent';
  checkInAt: string | null;
  checkOutAt: string | null;
  /** 퇴근 전이면 지금까지 흐른 시간 */
  minutes: number | null;
  checkedCount: number;
  checklistCount: number;
}

function parseChecklist(raw: string): ChecklistSnapshotEntry[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function elapsedMinutes(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
}

function toRecordView(record: AttendanceRecord, userName?: string): RecordView {
  return {
    id: record.id,
    userId: record.UserId,
    userName,
    workDate: record.workDate,
    checkInAt: record.checkInAt.toISOString(),
    checkOutAt: record.checkOutAt ? record.checkOutAt.toISOString() : null,
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
    standardWorkMinutes: policy.standardWorkMinutes,
    requireChecklist: policy.requireChecklist,
  };
}

/** YYYY-MM-DD 인지 — 잘못된 값이 그대로 쿼리에 들어가면 조용히 빈 결과가 된다 */
function isDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export class AttendanceService extends BaseService {
  /** 설정은 한 행만 둔다. 없으면 기본값으로 만든다. */
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

    try {
      const record = await AttendanceRecord.create({
        UserId: userId,
        workDate: today(now),
        checkInAt: now,
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

    const now = new Date();

    // 두 번 눌렀을 때 뒤에 온 요청이 시각을 덮어쓰지 않도록 조건부로 갱신한다.
    const [affected] = await AttendanceRecord.update(
      { checkOutAt: now, workMinutes: elapsedMinutes(record.checkInAt, now) },
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
  ): Promise<{
    month: string;
    records: RecordView[];
    summary: Omit<UserSummary, 'userId' | 'userName'>;
    policy: PolicyView;
  }> {
    const target = /^\d{4}-\d{2}$/.test(month) ? month : today().slice(0, 7);
    const [records, policy] = await Promise.all([
      AttendanceRecord.findAll({
        where: { UserId: userId, workDate: { [Op.between]: [`${target}-01`, `${target}-31`] } },
        order: [['workDate', 'DESC']],
      }),
      this.getPolicy(),
    ]);

    return {
      month: target,
      records: records.map(r => toRecordView(r)),
      summary: summarize(records),
      policy: toPolicyView(policy),
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
   * 오늘 누가 나왔는지. 안 찍은 사람이 보여야 쓸모가 있으므로 명단 전체를 준다.
   */
  async getTodayBoard(): Promise<{ workDate: string; rows: TodayRow[] }> {
    const workDate = today();
    const now = new Date();
    const [users, records] = await Promise.all([
      User.findAll({
        where: { isActive: true },
        attributes: ['id', 'name'],
        order: [['name', 'ASC']],
        limit: USER_LIMIT,
      }),
      AttendanceRecord.findAll({ where: { workDate } }),
    ]);

    const byUser = new Map(records.map(r => [r.UserId, r]));
    const rows = users.map<TodayRow>(u => {
      const record = byUser.get(u.id);
      if (!record) {
        return {
          userId: u.id,
          userName: u.name,
          state: 'absent',
          checkInAt: null,
          checkOutAt: null,
          minutes: null,
          checkedCount: 0,
          checklistCount: 0,
        };
      }
      const checklist = parseChecklist(record.checklist);
      return {
        userId: u.id,
        userName: u.name,
        state: record.checkOutAt ? 'done' : 'working',
        checkInAt: record.checkInAt.toISOString(),
        checkOutAt: record.checkOutAt ? record.checkOutAt.toISOString() : null,
        // 퇴근 전이면 지금까지 흐른 시간을 보여 준다
        minutes: record.checkOutAt
          ? (record.workMinutes ?? 0)
          : elapsedMinutes(record.checkInAt, now),
        checkedCount: checklist.filter(c => c.checked).length,
        checklistCount: checklist.length,
      };
    });

    return { workDate, rows };
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
        limit: USER_LIMIT,
      }),
      AttendanceRecord.findAll({ where }),
    ]);

    const grouped = new Map<string, AttendanceRecord[]>();
    for (const r of records) {
      // 명단 상한을 넘거나 비활성으로 바뀐 사람의 기록은 집계에 올리지 않는다.
      const bucket = grouped.get(r.UserId);
      if (bucket) bucket.push(r);
      else grouped.set(r.UserId, [r]);
    }

    return users.map(u => ({
      userId: u.id,
      userName: u.name,
      ...summarize(grouped.get(u.id) ?? []),
    }));
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

  /** 순서 바꾸기 — 넘어온 순서대로 다시 매긴다 */
  async reorderChecklist(ids: number[]): Promise<ChecklistItemView[]> {
    const items = await AttendanceChecklistItem.findAll();
    const known = new Set(items.map(i => i.id));
    if (ids.length !== known.size || ids.some(id => !known.has(id))) {
      throw new AppError(400, '순서 목록이 확인 항목과 맞지 않습니다.');
    }
    await Promise.all(
      ids.map((id, index) => AttendanceChecklistItem.update({ order: index + 1 }, { where: { id } }))
    );
    return this.listChecklist();
  }

  async deleteChecklistItem(id: number): Promise<void> {
    const removed = await AttendanceChecklistItem.destroy({ where: { id } });
    if (removed === 0) throw new AppError(404, '확인 항목을 찾을 수 없습니다.');
  }

  async updatePolicy(data: Partial<PolicyView>): Promise<PolicyView> {
    const policy = await this.getPolicy();

    if (data.standardWorkMinutes !== undefined) {
      const minutes = data.standardWorkMinutes;
      if (!Number.isInteger(minutes) || minutes < 30 || minutes > 1440) {
        throw new AppError(400, '기준 근무 시간은 30~1440분 사이의 정수여야 합니다.');
      }
      policy.standardWorkMinutes = minutes;
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

/** 기록 묶음을 요약한다. 평균은 퇴근까지 찍힌 날만 센다 — 근무 중인 날을 섞으면 평균이 내려간다. */
function summarize(records: AttendanceRecord[]): Omit<UserSummary, 'userId' | 'userName'> {
  const closed = records.filter(r => r.workMinutes !== null);
  const totalMinutes = closed.reduce((sum, r) => sum + (r.workMinutes ?? 0), 0);
  const dates = records.map(r => r.workDate).sort();

  return {
    days: records.length,
    totalMinutes,
    averageMinutes: closed.length > 0 ? Math.round(totalMinutes / closed.length) : 0,
    openDays: records.length - closed.length,
    lastWorkDate: dates.length > 0 ? dates[dates.length - 1] : null,
  };
}

export const attendanceService = new AttendanceService();
