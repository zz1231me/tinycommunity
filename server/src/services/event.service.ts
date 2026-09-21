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
        limit: 2000, // getEvents 와 같은 상한
      });
    } catch (error) {
      logError('이벤트 조회 실패', error);
      throw new AppError(500, '이벤트 조회 실패');
    }
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
