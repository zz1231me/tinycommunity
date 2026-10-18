import { CreationAttributes, Op } from 'sequelize';
import { logError } from '../utils/logger';
import { BaseService } from './base.service';
import { Event, EventInstance } from '../models/Event';
import { expandOccurrences } from './eventRecurrence';
import { EventPermission } from '../models/EventPermission';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { AppError } from '../middlewares/error.middleware';
import { ROLES } from '../config/constants';
import { sanitizeHtmlContent } from '../utils/contentRenderer';
import { sequelize } from '../config/sequelize';

/**
 * 컨트롤러가 요청 몸통에서 뽑아 낸 값들. 여기 적힌 것만 저장된다 —
 * UserId·id 는 서비스가 정하므로 몸통으로 밀어 넣을 수 없다(주입 방지).
 * 값 검사(날짜 모양·반복 규칙)는 400 을 내야 해서 컨트롤러가 맡는다.
 */
export interface NewEventInput {
  calendarId: string;
  title: string;
  body?: string;
  isAllday: boolean;
  start: Date | string;
  end: Date | string;
  category?: string;
  location?: string;
  attendees?: unknown;
  state?: string;
  isReadOnly?: boolean;
  color?: string;
  backgroundColor?: string;
  dragBackgroundColor?: string;
  borderColor?: string;
  customStyle?: unknown;
  recurrenceType?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurrenceInterval?: number;
  recurrenceDays?: number[] | null;
  recurrenceEndDate?: Date | string | null;
  parentEventId?: number | null;
}

/** 한 번에 내려 줄 수 있는 일정 수 */
const LIST_LIMIT = 2000;
/** 펼치기 전에 읽어 둘 반복 규칙 수 */
const RECURRING_LIMIT = 200;

export class EventService extends BaseService {
  async getAllEvents(): Promise<EventInstance[]> {
    try {
      return await Event.findAll({
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name'],
            include: [
              {
                model: Role,
                as: 'roleInfo',
                attributes: ['id', 'name'],
              },
            ],
          },
        ],
        order: [['start', 'DESC']],
        limit: 2000, // getEvents 와 같은 상한
      });
    } catch (error) {
      logError('이벤트 조회 실패', error);
      throw new AppError(500, '이벤트 조회 실패');
    }
  }

  /**
   * 보는 범위에 걸치는 일정. 반복은 규칙 한 줄로 저장돼 있어 여기서 펼친다.
   *
   * 반복은 범위 조건을 따로 쓴다 — 평소 조건(start<=끝, end>=시작)을 그대로 걸면
   * 작년에 시작한 '매주 회의' 가 통째로 빠진다. 처음 일정이 범위보다 앞서 있어도
   * 이 범위에 번째가 설 수 있다.
   */
  async listEventsInRange(start?: string, end?: string): Promise<Array<Record<string, unknown>>> {
    try {
      const plainWhere = {
        recurrenceType: 'none',
        ...(start && end ? { start: { [Op.lte]: end }, end: { [Op.gte]: start } } : {}),
      };
      const recurringWhere = {
        recurrenceType: { [Op.ne]: 'none' },
        ...(start && end
          ? {
              start: { [Op.lte]: end },
              [Op.or]: [{ recurrenceEndDate: null }, { recurrenceEndDate: { [Op.gte]: start } }],
            }
          : {}),
      };

      const include = [{ model: User, as: 'user', attributes: ['id', 'name'] }];
      const [plain, recurring] = await Promise.all([
        Event.findAll({ where: plainWhere, include, order: [['start', 'ASC']], limit: LIST_LIMIT }),
        Event.findAll({
          where: recurringWhere,
          include,
          order: [['start', 'ASC']],
          limit: RECURRING_LIMIT,
        }),
      ]);

      const rangeStart = start ? new Date(start) : new Date(0);
      const rangeEnd = end ? new Date(end) : new Date('2100-01-01');
      const expanded = recurring.flatMap(event => {
        const json = event.toJSON() as Record<string, unknown>;
        return expandOccurrences(
          {
            start: new Date(event.start),
            end: new Date(event.end),
            recurrenceType: event.recurrenceType,
            recurrenceInterval: event.recurrenceInterval,
            recurrenceDays: event.recurrenceDays ?? null,
            recurrenceEndDate: event.recurrenceEndDate ?? null,
            recurrenceExcept: event.recurrenceExcept ?? null,
          },
          rangeStart,
          rangeEnd
        ).map(occ => ({
          ...json,
          start: occ.start,
          end: occ.end,
          /** 이 번째의 날짜. 하루만 쉬게 할 때 이 값으로 집는다. */
          occurrenceDate: occ.date,
          isRecurringOccurrence: true,
        }));
      });

      return [...plain.map(e => e.toJSON() as Record<string, unknown>), ...expanded]
        .sort(
          (a, b) =>
            new Date(a.start as string | Date).getTime() -
            new Date(b.start as string | Date).getTime()
        )
        .slice(0, LIST_LIMIT);
    } catch (error) {
      logError('이벤트 목록 조회 실패', error);
      throw new AppError(500, '이벤트 조회 실패');
    }
  }

  /** 일정을 만들 수 있는 역할인가. 관리자는 늘 가능하다. */
  async assertCanCreate(userRole?: string): Promise<void> {
    if (userRole === ROLES.ADMIN) return;
    const permission = await EventPermission.findOne({ where: { roleId: userRole } });
    if (!permission?.canCreate) {
      throw new AppError(403, '이벤트를 생성할 권한이 없습니다.');
    }
  }

  /**
   * 일정을 만든다. 본문은 저장 전에 씻는다 — 글 본문과 같은 규칙이고,
   * 씻는 자리를 저장하는 쪽에 두어야 다른 호출부가 생겨도 빠지지 않는다.
   */
  async createEvent(input: NewEventInput, userId: string): Promise<EventInstance | null> {
    const created = await Event.create({
      ...input,
      ...(input.body ? { body: sanitizeHtmlContent(String(input.body)) } : {}),
      UserId: userId,
      // start·end 는 컨트롤러가 이미 날짜로 검사했다(문자열이면 Sequelize 가 변환한다).
    } as unknown as CreationAttributes<EventInstance>);
    return Event.findByPk(created.id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
    });
  }

  /**
   * 이 사람이 이 일정을 손댈 수 있는가. 주인이거나 관리자이거나, 역할에 권한이 켜져 있어야 한다.
   * 컨트롤러 세 곳(수정·삭제·하루 건너뛰기)이 같은 규칙을 각자 적고 있었다.
   */
  async assertCanManage(event: EventInstance, userId: string, userRole?: string): Promise<void> {
    await this.assertRolePermission(
      event,
      userId,
      userRole,
      'canDelete',
      '다른 사용자의 일정을 처리할 권한이 없습니다.'
    );
  }

  /** 고치는 쪽은 지우는 쪽과 다른 칸(canUpdate)을 본다. */
  async assertCanEdit(event: EventInstance, userId: string, userRole?: string): Promise<void> {
    await this.assertRolePermission(
      event,
      userId,
      userRole,
      'canUpdate',
      '다른 사용자의 일정을 수정할 권한이 없습니다.'
    );
  }

  private async assertRolePermission(
    event: EventInstance,
    userId: string,
    userRole: string | undefined,
    field: 'canUpdate' | 'canDelete',
    message: string
  ): Promise<void> {
    if (event.UserId === userId) return;
    if (userRole === ROLES.ADMIN) return;

    const permission = await EventPermission.findOne({ where: { roleId: userRole } });
    if (!permission?.[field]) {
      throw new AppError(403, message);
    }
  }

  /** 하나 집어 온다. 없으면 404 — 컨트롤러가 검증에 쓸 '지금 값' 이기도 하다. */
  async loadEvent(id: string): Promise<EventInstance> {
    const event = await Event.findByPk(id);
    if (!event) throw new AppError(404, '이벤트를 찾을 수 없습니다.');
    return event;
  }

  /** 글쓴이까지 붙여 돌려준다. 수정·생성 응답이 쓰는 모양. */
  async findWithUser(id: string | number): Promise<EventInstance | null> {
    return Event.findByPk(id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
    });
  }

  /** 주인·관리자·권한 있는 역할만. 반복의 자식 인스턴스도 함께 지운다. */
  async deleteOwnEvent(id: string, userId: string, userRole?: string): Promise<void> {
    const event = await Event.findByPk(id);
    if (!event) throw new AppError(404, '이벤트를 찾을 수 없습니다.');
    await this.assertCanManage(event, userId, userRole);

    // 부모를 지울 때 자식 인스턴스도 같은 트랜잭션에서 지운다.
    // 같은 주인의 자식만 지운다 — parentEventId 는 임의로 넣을 수 있어 남의 일정이 딸려 갈 수 있다.
    let deleted = 0;
    await sequelize.transaction(async t => {
      await Event.destroy({
        where: { parentEventId: id, UserId: event.UserId },
        transaction: t,
      });
      deleted = await Event.destroy({ where: { id }, transaction: t });
    });
    if (deleted === 0) throw new AppError(404, '이벤트를 찾을 수 없습니다.');
  }

  /**
   * 반복 중 그 날 하루만 건너뛴다. 규칙은 그대로 두고 건너뛸 날짜만 더한다 —
   * 한 번 쉬려고 반복을 통째로 지우지 않게.
   */
  async skipOccurrence(
    id: string,
    date: string,
    userId: string,
    userRole?: string
  ): Promise<string[]> {
    const event = await Event.findByPk(id);
    if (!event) throw new AppError(404, '이벤트를 찾을 수 없습니다.');
    if (!event.recurrenceType || event.recurrenceType === 'none') {
      throw new AppError(400, '반복 일정이 아닙니다.');
    }
    await this.assertCanManage(event, userId, userRole);

    const except = new Set(event.recurrenceExcept ?? []);
    except.add(date);
    event.recurrenceExcept = [...except].sort();
    await event.save();
    return event.recurrenceExcept;
  }

  async deleteEvent(id: string): Promise<void> {
    try {
      // 동시 삭제 요청의 TOCTOU 를 막으려고 트랜잭션 안에서 LOCK.UPDATE 로 읽는다.
      await sequelize.transaction(async t => {
        const event = await Event.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!event) {
          throw new AppError(404, '이벤트를 찾을 수 없습니다.');
        }
        // 같은 소유자의 자식만 지운다. parentEventId 는 검증 없이 설정할 수 있어 남의 이벤트까지 지워진다.
        await Event.destroy({
          where: { parentEventId: id, UserId: event.UserId },
          transaction: t,
        });
        await event.destroy({ transaction: t });
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      logError('이벤트 삭제 실패', error);
      throw new AppError(500, '이벤트 삭제 실패');
    }
  }

  /**
   * 보낸 칸만 바꾼다(undefined 는 Sequelize 가 건너뛴다).
   * 본문은 여기서 씻는다 — 관리자 화면·사용자 화면이 각자 씻던 것을 한 자리로 모았다.
   * 빈 문자열은 '본문을 비운다' 는 뜻이라 그대로 둔다.
   */
  async updateEvent(id: string, data: Partial<EventInstance>): Promise<EventInstance> {
    const patch = {
      ...data,
      ...(data.body !== undefined
        ? { body: data.body ? sanitizeHtmlContent(String(data.body)) : data.body }
        : {}),
    };
    try {
      return await sequelize.transaction(async t => {
        const event = await Event.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!event) {
          throw new AppError(404, '이벤트를 찾을 수 없습니다.');
        }
        await event.update(patch, { transaction: t });
        return event;
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, '이벤트 수정 실패');
    }
  }

  async getEventPermissionsByRole() {
    try {
      const roles = await Role.findAll();

      const existingPermissions = await EventPermission.findAll();

      const result = roles.map(role => {
        const existing = existingPermissions.find(p => p.roleId === role.id);
        if (existing) {
          return {
            ...existing.toJSON(),
            role: { id: role.id, name: role.name },
          };
        } else {
          return {
            roleId: role.id,
            canCreate: false, // 미설정 역할은 미들웨어와 같이 생성 불허
            canRead: true,
            canUpdate: false,
            canDelete: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            role: { id: role.id, name: role.name },
          };
        }
      });

      return result;
    } catch (error) {
      logError('이벤트 권한 조회 에러', error);
      throw new AppError(500, '이벤트 권한 조회 실패');
    }
  }

  async setEventPermissions(
    permissions: Array<{
      roleId: string;
      canCreate?: boolean;
      canRead?: boolean;
      canUpdate?: boolean;
      canDelete?: boolean;
    }>
  ): Promise<void> {
    const t = await sequelize.transaction();
    try {
      // 같은 트랜잭션에서 병렬 findOrCreate 는 데드락이 나므로 순차 처리한다.
      for (const perm of permissions) {
        const [permission, created] = await EventPermission.findOrCreate({
          where: { roleId: perm.roleId },
          defaults: {
            roleId: perm.roleId,
            canCreate: perm.canCreate ?? true,
            canRead: perm.canRead ?? true,
            canUpdate: perm.canUpdate ?? false,
            canDelete: perm.canDelete ?? false,
          },
          transaction: t,
        });

        if (!created) {
          await permission.update(
            {
              canCreate: perm.canCreate ?? permission.canCreate,
              canRead: perm.canRead ?? permission.canRead,
              canUpdate: perm.canUpdate ?? permission.canUpdate,
              canDelete: perm.canDelete ?? permission.canDelete,
            },
            { transaction: t }
          );
        }
      }
      await t.commit();
    } catch (error) {
      await t.rollback();
      logError('이벤트 권한 설정 실패', error);
      throw new AppError(500, '이벤트 권한 설정 실패');
    }
  }
}

export const eventService = new EventService();
