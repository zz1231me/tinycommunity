import { BaseService } from './base.service';
import { Role, RoleInstance } from '../models/Role';
import { BoardAccess } from '../models/BoardAccess';
import Board from '../models/Board';
import EventPermission from '../models/EventPermission';
import { User } from '../models/User';
import { AppError } from '../middlewares/error.middleware';
import { sequelize } from '../config/sequelize';
import { UniqueConstraintError, Op } from 'sequelize';

const PROTECTED_ROLES = ['admin', 'manager', 'guest'] as const;

export class RoleService extends BaseService {
  async getAllRoles(): Promise<RoleInstance[]> {
    try {
      return await Role.findAll();
    } catch (_error) {
      throw new AppError(500, '역할 조회 실패');
    }
  }

  async createRole(data: {
    id: string;
    name: string;
    description?: string;
  }): Promise<RoleInstance> {
    // 시스템 보호 역할 id 는 쓸 수 없다
    if ((PROTECTED_ROLES as readonly string[]).includes(data.id.trim())) {
      throw new AppError(400, `'${data.id}' 역할은 시스템 보호 역할로 생성할 수 없습니다.`);
    }

    try {
      return await Role.create({
        ...data,
        isActive: true,
      });
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw new AppError(409, '이미 존재하는 역할입니다.');
      }
      throw new AppError(500, '역할 생성 실패');
    }
  }

  async updateRole(
    id: string,
    data: { name?: string; description?: string; isActive?: boolean }
  ): Promise<RoleInstance> {
    const role = await Role.findByPk(id);
    if (!role) {
      throw new AppError(404, '역할을 찾을 수 없습니다.');
    }

    if ((PROTECTED_ROLES as readonly string[]).includes(id)) {
      if (data.isActive === false) {
        throw new AppError(400, `'${id}' 역할은 시스템 보호 역할로 비활성화할 수 없습니다.`);
      }
      if (data.name !== undefined) {
        throw new AppError(400, `'${id}' 역할은 시스템 보호 역할로 이름을 변경할 수 없습니다.`);
      }
    }

    try {
      if (data.name !== undefined) role.name = data.name;
      if (data.description !== undefined) role.description = data.description;
      if (data.isActive !== undefined) role.isActive = data.isActive;

      await role.save();
      return role;
    } catch (_error) {
      throw new AppError(500, '역할 수정 실패');
    }
  }

  async deleteRole(id: string): Promise<void> {
    if ((PROTECTED_ROLES as readonly string[]).includes(id)) {
      throw new AppError(400, `'${id}' 역할은 시스템 보호 역할로 삭제할 수 없습니다.`);
    }

    try {
      await sequelize.transaction(async t => {
        // 동시 삭제 요청의 TOCTOU 를 막으려고 트랜잭션 안에서 잠그고 읽는다
        const role = await Role.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!role) {
          throw new AppError(404, '역할을 찾을 수 없습니다.');
        }

        // guest 가 비활성이면 옮겨 간 사용자가 로그인할 수 없게 되므로 막는다
        const guestRole = await Role.findByPk('guest', {
          transaction: t,
          lock: t.LOCK.UPDATE,
          attributes: ['id', 'isActive'],
        });
        if (!guestRole || !guestRole.isActive) {
          throw new AppError(
            400,
            'guest 역할이 비활성 상태입니다. 먼저 guest 역할을 활성화한 뒤 다시 삭제하세요.'
          );
        }

        // 사용자를 guest 로 옮기고 tokenVersion 을 올려 기존 JWT 를 무효화한다
        await User.increment('tokenVersion', { where: { roleId: id }, by: 1, transaction: t });
        await User.update({ roleId: 'guest' }, { where: { roleId: id }, transaction: t });
        await BoardAccess.destroy({ where: { roleId: id }, transaction: t });
        await EventPermission.destroy({ where: { roleId: id }, transaction: t });
        await role.destroy({ transaction: t });
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, '역할 삭제 실패');
    }
  }

  async getBoardAccessPermissions(boardId: string) {
    try {
      return await BoardAccess.findAll({
        where: { boardId },
        include: [
          {
            model: Role,
            as: 'role',
            attributes: ['id', 'name'],
          },
        ],
      });
    } catch (_error) {
      throw new AppError(500, '권한 조회 실패');
    }
  }

  // 전체 게시판 권한을 한 요청으로 조회한다. 보드별 fan-out 은 관리자 레이트리밋에 걸린다.
  async getAllBoardAccessPermissions() {
    try {
      return await BoardAccess.findAll({
        include: [
          {
            model: Role,
            as: 'role',
            attributes: ['id', 'name'],
          },
        ],
      });
    } catch (_error) {
      throw new AppError(500, '권한 조회 실패');
    }
  }

  async setBoardAccessPermissions(
    boardId: string,
    permissions: Array<{
      roleId: string;
      canRead?: boolean;
      canWrite?: boolean;
      canDelete?: boolean;
    }>
  ): Promise<void> {
    try {
      await sequelize.transaction(async t => {
        // 존재 검증은 트랜잭션 안에서 잠그고 한다. 밖에서 하면 FK 위반이나 orphan 이 생긴다.
        const board = await Board.findByPk(boardId, {
          attributes: ['id'],
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (!board) {
          throw new AppError(404, `게시판 '${boardId}'을(를) 찾을 수 없습니다.`);
        }

        if (permissions.length > 0) {
          const roleIds = [...new Set(permissions.map(p => p.roleId))];
          const existingRoles = await Role.findAll({
            where: { id: { [Op.in]: roleIds } },
            attributes: ['id'],
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          const existingIds = new Set(existingRoles.map(r => r.id));
          const invalid = roleIds.find(rid => !existingIds.has(rid));
          if (invalid) {
            throw new AppError(400, `역할 '${invalid}'을(를) 찾을 수 없습니다.`);
          }

          // 전달된 roleId 범위로만 지운다. 전체를 지우면 부분 전송 시 다른 역할 권한이 사라진다.
          await BoardAccess.destroy({
            where: { boardId, roleId: { [Op.in]: roleIds } },
            transaction: t,
          });

          await BoardAccess.bulkCreate(
            permissions.map(perm => {
              const canWrite = perm.canWrite ?? false;
              const canDelete = perm.canDelete ?? false;
              // 쓰기/삭제는 읽기를 전제로 한다. canRead 가 false 면 checkPermission 이 전부 거부한다.
              return {
                boardId,
                roleId: perm.roleId,
                canRead: (perm.canRead ?? true) || canWrite || canDelete,
                canWrite,
                canDelete,
              };
            }),
            { transaction: t }
          );
        }
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(500, '권한 설정 실패');
    }
  }
}

export const roleService = new RoleService();
