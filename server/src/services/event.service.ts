import { logError } from '../utils/logger';
import { BaseService } from './base.service';
import { Event, EventInstance } from '../models/Event';
import { EventPermission } from '../models/EventPermission';
import { User } from '../models/User';
import { Role } from '../models/Role';
import { AppError } from '../middlewares/error.middleware';
import { sequelize } from '../config/sequelize';

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
        limit: 2000, // 사용자 대면 getEvents와 동일한 상한 (관리자 전체 조회)
      });
    } catch (error) {
      logError('이벤트 조회 실패', error);
      throw new AppError(500, '이벤트 조회 실패');
    }
  }

  async deleteEvent(id: string): Promise<void> {
    try {
      // findByPk를 트랜잭션 내 LOCK.UPDATE로 이동 — 동시 삭제 요청의 TOCTOU 방지
      await sequelize.transaction(async t => {
        const event = await Event.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!event) {
          throw new AppError(404, '이벤트를 찾을 수 없습니다.');
        }
        // 반복 이벤트 자식 인스턴스까지 원자적으로 삭제 (고아화 방지).
        //
        // ⚠️ 같은 소유자의 자식만 지운다. parentEventId 는 검증 없이 본문으로 설정할 수
        // 있어서, 범위를 두지 않으면 남이 이 이벤트를 부모로 걸어 둔 경우 그 사람의
        // 이벤트까지 함께 사라진다. 사용자 경로(event.controller)는 이미 이렇게 막아
        // 두었는데, 관리자 삭제가 지나는 이 경로만 빠져 있었다.
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

  async updateEvent(id: string, data: Partial<EventInstance>): Promise<EventInstance> {
    try {
      return await sequelize.transaction(async t => {
        const event = await Event.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!event) {
          throw new AppError(404, '이벤트를 찾을 수 없습니다.');
        }
        await event.update(data, { transaction: t });
        return event;
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, '이벤트 수정 실패');
    }
  }

  async getEventPermissionsByRole() {
    try {
      // 1. 모든 역할 조회
      const roles = await Role.findAll();

      // 2. 설정된 권한 조회
      const existingPermissions = await EventPermission.findAll();

      // 3. 모든 역할에 대해 권한 매핑 (없으면 기본값)
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
            canCreate: false, // 기본값: 미설정 역할은 미들웨어와 동일하게 생성 불허
            canRead: true, // 기본값
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
      // Promise.all 대신 순차 처리 — 동일 트랜잭션 내 병렬 findOrCreate는 데드락 유발
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
