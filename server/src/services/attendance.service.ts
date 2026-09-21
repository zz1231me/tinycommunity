// 출퇴근 기록. 확인 항목 답변은 문구째로 저장한다(항목 표를 참조만 하면 지난 기록의 뜻이 바뀐다).

import { Op, UniqueConstraintError } from 'sequelize';
import { sequelize } from '../config/sequelize';
import { AttendanceRecord, type ChecklistSnapshotEntry } from '../models/AttendanceRecord';
import { AttendanceChecklistItem } from '../models/AttendanceChecklistItem';
import { AttendancePolicy } from '../models/AttendancePolicy';
import User from '../models/User';
import { BaseService } from './base.service';
import { AppError } from '../middlewares/error.middleware';
import { logWarning } from '../utils/logger';
// 하루 경계는 출석 포인트와 같아야 하므로 같은 함수를 쓴다.
import { today } from './point.service';

const MAX_NOTE = 500;
const MAX_LABEL = 200;
const MAX_DESCRIPTION = 500;
/** 명단에 올릴 사용자 수 상한 */
const USER_LIMIT = 500;

/** 퇴근 취소 허용 시간(분). 퇴근 시각은 분 단위로 잘려 저장된다. */
export const CHECKOUT_UNDO_MINUTES = 10;

/** 명단이 상한에서 잘렸으면 경고 로그를 남긴다. */
function warnIfUserListTruncated(count: number, where: string): void {
  // 호출부가 USER_LIMIT + 1 건을 읽으므로 초과일 때만 경고한다.
  if (count <= USER_LIMIT) return;
  logWarning(`${where}: 명단이 ${USER_LIMIT}명에서 잘렸습니다 — 이름순 뒤쪽 인원이 빠집니다.`, {
    limit: USER_LIMIT,
  });
}
/** 집계 기간 상한(일). 기간을 안 주면 표 전체를 읽으므로 기본값은 이번 달이다. */
const MAX_RANGE_DAYS = 366;

export interface PolicyView {
  standardWorkMinutes: number;
  requireChecklist: boolean;
  noticeText: string;
  /** 출근 시각을 이만큼(분) 앞당겨 기록한다. 0 이면 누른 그대로. */
  checkInGraceMinutes: number;
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
  /** 이 줄이 가리키는 기록의 근무일. 오늘이 아니면 자정을 넘겨 이어 일하는 중이다. */
  workDate: string | null;
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

/** 출근 시각을 보정만큼 앞당긴다. 근무일 자정보다 앞으로는 가지 않는다. */
function withGrace(pressedAt: Date, graceMinutes: number, workDate: string): Date {
  if (graceMinutes <= 0) return pressedAt;
  const shifted = new Date(pressedAt.getTime() - graceMinutes * 60_000);
  const midnight = new Date(`${workDate}T00:00:00`);
  return shifted < midnight ? midnight : shifted;
}

/** 초를 버려 분 단위로 맞춘다. 출근·퇴근 양쪽에 적용해야 간격 반올림이 어긋나지 않는다. */
function atMinute(d: Date): Date {
  const copy = new Date(d);
  copy.setSeconds(0, 0);
  return copy;
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
    noticeText: policy.noticeText,
    checkInGraceMinutes: policy.checkInGraceMinutes,
  };
}

/** 실제로 있는 YYYY-MM-DD 인지. 모양만 검사하면 2026-02-30 이 통과한다. */
function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** 날짜가 아니면 거절 */
function requireDay(value: string, label: string): string {
  if (!isDay(value)) throw new AppError(400, `${label}이 올바른 날짜가 아닙니다.`);
  return value;
}

/** 값이 없으면 기본값, 있는데 날짜가 아니면 거절 (다른 기간을 조용히 보여 주지 않는다) */
function dayOrDefault(value: string | undefined, fallback: string, label: string): string {
  if (value === undefined || value === '') return fallback;
  if (!isDay(value)) throw new AppError(400, `${label}이 올바른 날짜가 아닙니다.`);
  return value;
}

export class AttendanceService extends BaseService {
  /** 설정은 한 행만 둔다. 동시 요청이 행을 둘 만들지 않도록 id 를 못 박아 findOrCreate 한다. */
  async getPolicy(): Promise<AttendancePolicy> {
    const [policy] = await AttendancePolicy.findOrCreate({
      where: { id: 1 },
      defaults: { id: 1 },
    });
    return policy;
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

  async getMyStatus(userId: string): Promise<{
    workDate: string;
    record: RecordView | null;
    /** 자정을 넘겨 아직 안 닫힌 어제 기록. 퇴근을 누르면 이것이 닫힌다. */
    openPrevious: RecordView | null;
    checklist: ChecklistItemView[];
    policy: PolicyView;
    undoCheckOutUntil: string | null;
  }> {
    const workDate = today();
    const [record, items, policy] = await Promise.all([
      AttendanceRecord.findOne({ where: { UserId: userId, workDate } }),
      this.getActiveChecklist(),
      this.getPolicy(),
    ]);

    // checkOut 이 닫는 대상과 같은 기준으로 고른다. 오늘 것이 있으면 어제 것은 내보내지 않는다.
    const openPrevious = record ? null : await findOpenPreviousDay(userId, workDate);

    const undoable = await findUndoableCheckOut(userId);

    return {
      workDate,
      record: record ? toRecordView(record) : null,
      openPrevious: openPrevious ? toRecordView(openPrevious) : null,
      checklist: items.map(toItemView),
      policy: toPolicyView(policy),
      /** 방금 누른 퇴근을 이 시각까지 되돌릴 수 있다 (없으면 null) */
      undoCheckOutUntil: undoable ? undoDeadline(undoable).toISOString() : null,
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

    // 근무일은 누른 순간으로 정한다. 보정된 시각으로 정하면 자정 직후 출근이 어제로 넘어간다.
    const pressedAt = new Date();
    const workDate = today(pressedAt);
    const checkInAt = atMinute(withGrace(pressedAt, policy.checkInGraceMinutes, workDate));

    try {
      const record = await AttendanceRecord.create({
        UserId: userId,
        workDate,
        checkInAt,
        note: (input.note ?? '').slice(0, MAX_NOTE),
        checklist: JSON.stringify(checklist),
      });
      return toRecordView(record);
    } catch (err) {
      // 하루 한 건은 유니크 인덱스가 지킨다.
      if (err instanceof UniqueConstraintError) {
        throw new AppError(409, '오늘 출근은 이미 기록되어 있습니다.');
      }
      throw err;
    }
  }

  async checkOut(userId: string): Promise<RecordView> {
    const workDate = today();
    // 오늘 것이 없으면 자정을 넘겨 안 닫힌 어제 건을 닫는다.
    const record =
      (await AttendanceRecord.findOne({ where: { UserId: userId, workDate } })) ??
      (await findOpenPreviousDay(userId, workDate));

    if (!record) throw new AppError(400, '출근 기록이 없습니다. 출근을 먼저 눌러주세요.');
    if (record.checkOutAt) throw new AppError(409, '오늘 퇴근은 이미 기록되어 있습니다.');

    const now = atMinute(new Date());

    // 두 번 눌렀을 때 뒤에 온 요청이 시각을 덮어쓰지 않도록 조건부로 갱신한다.
    const [affected] = await AttendanceRecord.update(
      { checkOutAt: now, workMinutes: elapsedMinutes(record.checkInAt, now) },
      { where: { id: record.id, checkOutAt: null } }
    );
    if (affected === 0) throw new AppError(409, '오늘 퇴근은 이미 기록되어 있습니다.');

    await record.reload();
    return toRecordView(record);
  }

  /** 방금 누른 퇴근을 되돌린다. 가장 최근에 닫은 기록 하나만, CHECKOUT_UNDO_MINUTES 안에만 된다. */
  async undoCheckOut(userId: string): Promise<RecordView> {
    const record = await findUndoableCheckOut(userId);
    if (!record) {
      throw new AppError(
        409,
        `퇴근은 누른 뒤 ${CHECKOUT_UNDO_MINUTES}분 안에만 취소할 수 있습니다.`
      );
    }
    // 동시에 여러 번 눌러도 한 번만 되돌린다.
    const [affected] = await AttendanceRecord.update(
      { checkOutAt: null, workMinutes: null },
      { where: { id: record.id, checkOutAt: record.checkOutAt } }
    );
    if (affected === 0)
      throw new AppError(409, '이미 바뀐 기록입니다. 새로고침 후 다시 시도해주세요.');
    await record.reload();
    return toRecordView(record);
  }

  /** 내 기록. month 는 YYYY-MM */
  async getMyHistory(
    userId: string,
    month: string
  ): Promise<{
    month: string;
    records: RecordView[];
    summary: Omit<UserSummary, 'userId' | 'userName'>;
    policy: PolicyView;
  }> {
    // 달 값까지 검사한다. 모양만 보면 '2026-13' 이 통과해 빈 목록이 된다.
    const wellFormed =
      /^\d{4}-\d{2}$/.test(month) &&
      Number(month.slice(5, 7)) >= 1 &&
      Number(month.slice(5, 7)) <= 12;
    const target = wellFormed ? month : today().slice(0, 7);
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

  async listRecords(params: {
    from?: string;
    to?: string;
    userId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ records: RecordView[]; total: number; page: number; totalPages: number }> {
    // 아주 큰 page 는 offset 이 지수 표기가 되어 DB 가 거절한다.
    const page = Math.min(1000, Math.max(1, params.page ?? 1));
    // 한 사람 조회는 하루 한 건이라 기간 상한만큼, 전체 조회는 100 건으로 묶는다.
    const cap = params.userId ? MAX_RANGE_DAYS : 100;
    const limit = Math.min(Math.max(1, params.limit ?? 30), cap);

    const where: Record<string, unknown> = {};
    if (params.userId) where.UserId = params.userId;
    const range = this.dayRangeFilter(params.from, params.to);
    if (range) where.workDate = range;

    const { rows, count } = await AttendanceRecord.findAndCountAll({
      where,
      include: [{ model: User, as: 'user', attributes: ['id', 'name'], required: false }],
      // 동점이면 페이지 사이로 행이 새므로 id 로 확정 순서를 준다.
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

  /** 오늘 누가 나왔는지. 안 찍은 사람도 보여야 하므로 명단 전체를 준다. */
  async getTodayBoard(): Promise<{ workDate: string; rows: TodayRow[] }> {
    const workDate = today();
    const yesterday = shiftDay(workDate, -1);
    const now = new Date();
    const [users, records] = await Promise.all([
      User.findAll({
        where: { isActive: true },
        attributes: ['id', 'name'],
        order: [['name', 'ASC']],
        limit: USER_LIMIT + 1,
      }),
      // 자정을 넘겨 일하는 사람 때문에 어제 것도 함께 읽는다.
      AttendanceRecord.findAll({ where: { workDate: { [Op.in]: [workDate, yesterday] } } }),
    ]);
    warnIfUserListTruncated(users.length, '오늘 출근 현황');
    users.splice(USER_LIMIT);

    // 오늘 것이 우선이고, 없을 때만 어제 안 닫힌 건을 쓴다 (퇴근이 닫는 대상과 같다).
    const todays = new Map(records.filter(r => r.workDate === workDate).map(r => [r.UserId, r]));
    const carried = new Map(
      records.filter(r => r.workDate === yesterday && !r.checkOutAt).map(r => [r.UserId, r])
    );
    const byUser = new Map([...carried, ...todays]);
    const rows = users.map<TodayRow>(u => {
      const record = byUser.get(u.id);
      if (!record) {
        return {
          userId: u.id,
          userName: u.name,
          state: 'absent',
          workDate: null,
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
        workDate: record.workDate,
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

  /** 인원별 집계. 기간 안에 한 번도 안 찍은 사람도 0 으로 넣는다. */
  async listSummary(params: { from?: string; to?: string }): Promise<UserSummary[]> {
    const { from, to } = this.boundedRange(params.from, params.to);

    const [users, records] = await Promise.all([
      User.findAll({
        where: { isActive: true },
        attributes: ['id', 'name'],
        order: [['name', 'ASC']],
        limit: USER_LIMIT + 1,
      }),
      // 집계에 쓰는 칸만 읽는다. 확인 항목 스냅샷까지 끌어오면 기간이 길수록 무겁다.
      AttendanceRecord.findAll({
        where: { workDate: { [Op.between]: [from, to] } },
        attributes: ['UserId', 'workDate', 'workMinutes'],
      }),
    ]);
    warnIfUserListTruncated(users.length, '출퇴근 집계');
    users.splice(USER_LIMIT);

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

  /** 감사 로그에 바뀌기 전 값을 남기기 위한 단건 조회 */
  async getChecklistItem(id: number): Promise<ChecklistItemView | null> {
    const item = await AttendanceChecklistItem.findByPk(id);
    return item ? toItemView(item) : null;
  }

  async getPolicyView(): Promise<PolicyView> {
    return toPolicyView(await this.getPolicy());
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

  /** 넘어온 순서대로 다시 매긴다 */
  async reorderChecklist(ids: number[]): Promise<ChecklistItemView[]> {
    const items = await AttendanceChecklistItem.findAll();
    const known = new Set(items.map(i => i.id));
    // 같은 id 가 두 번 들어오면 개수만 맞고 빠진 항목이 생겨 순서가 겹친다.
    const unique = new Set(ids);
    if (
      unique.size !== ids.length ||
      unique.size !== known.size ||
      ids.some(id => !known.has(id))
    ) {
      throw new AppError(400, '순서 목록이 확인 항목과 맞지 않습니다.');
    }
    // 중간에 실패하면 순서가 반쯤 바뀐 채로 남는다
    await sequelize.transaction(async t =>
      Promise.all(
        ids.map((id, index) =>
          AttendanceChecklistItem.update({ order: index + 1 }, { where: { id }, transaction: t })
        )
      )
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
    if (data.checkInGraceMinutes !== undefined) {
      const grace = data.checkInGraceMinutes;
      // 보정 상한은 60분.
      if (!Number.isInteger(grace) || grace < 0 || grace > 60) {
        throw new AppError(400, '출근 시각 보정은 0~60분 사이의 정수여야 합니다.');
      }
      policy.checkInGraceMinutes = grace;
    }
    if (data.requireChecklist !== undefined) policy.requireChecklist = data.requireChecklist;
    if (data.noticeText !== undefined) {
      // 빈 안내는 머리글이 비어 보이므로 기본 문구로 되돌린다
      const text = data.noticeText.trim().slice(0, 300);
      policy.noticeText = text || '출퇴근을 기록합니다. 전체 기록은 관리자만 봅니다.';
    }

    await policy.save();
    return toPolicyView(policy);
  }

  /** 집계용 기간. 값이 없거나 형식이 어긋나면 이번 달로 채운다. */
  private boundedRange(from?: string, to?: string): { from: string; to: string } {
    const day = today();
    const start = dayOrDefault(from, `${day.slice(0, 7)}-01`, '시작일');
    const end = dayOrDefault(to, day, '종료일');
    if (start > end) throw new AppError(400, '시작일이 종료일보다 뒤입니다.');

    const span = Math.round(
      (new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86_400_000
    );
    if (span + 1 > MAX_RANGE_DAYS) {
      throw new AppError(400, `조회 기간은 최대 ${MAX_RANGE_DAYS}일까지입니다.`);
    }
    return { from: start, to: end };
  }

  /** from/to 를 workDate 조건으로. 날짜가 아니면 거절한다. */
  private dayRangeFilter(from?: string, to?: string): Record<symbol, unknown> | null {
    const start = from === undefined || from === '' ? null : requireDay(from, '시작일');
    const end = to === undefined || to === '' ? null : requireDay(to, '종료일');
    if (start && end && start > end) throw new AppError(400, '시작일이 종료일보다 뒤입니다.');
    if (start && end) return { [Op.between]: [start, end] };
    if (start) return { [Op.gte]: start };
    if (end) return { [Op.lte]: end };
    return null;
  }
}

/** 하루 앞뒤로 옮긴 날짜 (YYYY-MM-DD) */
function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 퇴근 취소 마감. 분 단위로 잘린 1분을 더 쳐 준다. */
function undoDeadline(record: AttendanceRecord): Date {
  return new Date(record.checkOutAt!.getTime() + (CHECKOUT_UNDO_MINUTES + 1) * 60_000);
}

/** 되돌릴 수 있는 퇴근. 열린 기록이 있으면 막는다(퇴근은 오늘 것만 닫는다). */
async function findUndoableCheckOut(userId: string): Promise<AttendanceRecord | null> {
  const last = await AttendanceRecord.findOne({
    where: { UserId: userId, checkOutAt: { [Op.ne]: null } },
    order: [
      ['checkOutAt', 'DESC'],
      ['id', 'DESC'],
    ],
  });
  if (!last || undoDeadline(last).getTime() <= Date.now()) return null;
  const open = await AttendanceRecord.findOne({
    where: { UserId: userId, checkOutAt: null },
    attributes: ['id'],
  });
  return open ? null : last;
}

async function findOpenPreviousDay(userId: string, workDate: string) {
  return AttendanceRecord.findOne({
    where: { UserId: userId, workDate: shiftDay(workDate, -1), checkOutAt: null },
  });
}

/** 기록 묶음 요약. 평균은 퇴근까지 찍힌 날만 센다. */
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
