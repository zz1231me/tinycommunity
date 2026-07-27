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
    // 시스템 보호 역할 ID 사용 차단
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
        // findByPk를 트랜잭션 내 LOCK.UPDATE로 이동 — 동시 삭제 요청의 TOCTOU 방지
        const role = await Role.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
        if (!role) {
          throw new AppError(404, '역할을 찾을 수 없습니다.');
        }

        // ✅ guest 역할이 비활성화 상태면 마이그레이션 대상 사용자가 로그인 불가가 되므로 차단
        //   (admin이 'guest'를 비활성화한 뒤 다른 역할을 삭제하면 사용자 셀프 락아웃 발생)
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

        // 해당 역할 유저를 guest로 마이그레이션 + tokenVersion 증가 (기존 JWT 즉시 무효화)
        // literal() 대신 dialect-aware increment 사용 (MySQL/PG/SQLite 공통)
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

  // 전체 게시판 권한을 한 번에 조회 — 관리자 권한 화면이 보드별 N개 요청 대신 1요청으로 받도록
  // (보드별 fan-out이 adminLimiter에 걸려 일부 보드가 빈 상태로 로드되던 문제 예방).
  // 단일 조회와 동일한 행 shape(BoardAccess + role)를 반환하고, 클라가 boardId로 그룹핑한다.
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
        // ✅ boardId/roleId 존재 검증을 트랜잭션 내부로 이동 + LOCK.UPDATE 적용.
        //    트랜잭션 밖에서 검증하면 다른 admin이 동시에 게시판/역할을 삭제할 때
        //    FK 위반 또는 orphan BoardAccess 가능.
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

          // ⚠️ 전달된 역할의 권한만 교체하고, payload에 없는 역할의 권한은 보존한다.
          //    예전엔 보드의 모든 BoardAccess를 destroy 후 재생성해서, 관리자 UI가 권한 로드
          //    실패(429/네트워크) 등으로 부분 매트릭스를 보내면 다른 역할 권한이 통째로 사라졌다
          //    ("권한을 줘도 새로고침하면 안 들어가는" 버그). 전달된 roleId만 scoped destroy.
          await BoardAccess.destroy({
            where: { boardId, roleId: { [Op.in]: roleIds } },
            transaction: t,
          });

          await BoardAccess.bulkCreate(
            permissions.map(perm => {
              const canWrite = perm.canWrite ?? false;
              const canDelete = perm.canDelete ?? false;
              // 쓰기/삭제 권한은 읽기를 전제로 한다. 권한 해석(checkPermission)은 canRead가
              // false면 canWrite가 true여도 전부 거부하므로, read 없이 write/delete만 저장하면
              // 관리자가 부여한 권한이 조용히 무력화된다. 저장 시 정규화해 이 footgun을 막는다.
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
