import { BaseService } from './base.service';
import { User, UserInstance } from '../models/User';
import { Role } from '../models/Role';
import { AppError } from '../middlewares/error.middleware';
import { processAvatar, deleteAvatarFile } from '../middlewares/upload/avatar';
import { Op, UniqueConstraintError } from 'sequelize';
import { sequelize } from '../config/sequelize';
import { userSessionService } from './userSession.service';

export class UserService extends BaseService {
  async findById(id: string): Promise<UserInstance | null> {
    return User.findByPk(id, {
      paranoid: false, // ✅ deletedAt 컬럼 마이그레이션 전에도 쿼리 가능
      include: [
        {
          model: Role,
          as: 'roleInfo',
          attributes: ['id', 'name', 'description'],
        },
      ],
    });
  }

  async findByIdWithRole(id: string): Promise<UserInstance | null> {
    return User.findByPk(id, {
      paranoid: false, // ✅ deletedAt 컬럼 마이그레이션 전에도 쿼리 가능
      include: [
        {
          model: Role,
          as: 'roleInfo',
          attributes: ['id', 'name', 'description', 'isActive'],
        },
      ],
    });
  }

  async getAllUsers(isAdmin: boolean = false, limit?: number): Promise<UserInstance[]> {
    const whereCondition = isAdmin ? {} : { isDeleted: false };

    return User.findAll({
      where: whereCondition,
      include: [
        {
          model: Role,
          as: 'roleInfo',
          attributes: ['id', 'name', 'description'],
        },
      ],
      attributes: ['id', 'name', 'email', 'roleId', 'isActive', 'createdAt', 'updatedAt'],
      order: [
        ['isActive', 'ASC'],
        ['createdAt', 'DESC'],
      ],
      ...(limit !== undefined ? { limit } : {}),
    });
  }

  async getDeletedUsers(limit?: number): Promise<UserInstance[]> {
    return User.findAll({
      where: {
        deletedAt: { [Op.ne]: null },
      },
      paranoid: false,
      include: [
        {
          model: Role,
          as: 'roleInfo',
          attributes: ['id', 'name'],
        },
      ],
      attributes: ['id', 'name', 'roleId', 'deletedAt', 'anonymizedName'],
      order: [['deletedAt', 'DESC']],
      ...(limit !== undefined ? { limit } : {}),
    });
  }

  async createUser(data: Partial<UserInstance>): Promise<UserInstance> {
    // ID Validation (관리자 생성: 한글/영문/숫자/./@/-/_ 허용, 공백 불허)
    const idRegex = /^[a-zA-Z0-9가-힣._@\-_]+$/;
    if (!data.id || data.id.trim().length === 0 || !idRegex.test(data.id) || /\s/.test(data.id)) {
      throw new AppError(400, '유효하지 않은 사용자 ID 형식입니다.');
    }

    const existing = await User.findByPk(data.id);
    if (existing) {
      throw new AppError(409, '이미 존재하는 사용자 ID입니다.');
    }

    // Role Validation — roleId 미제공 시 'guest' 기본값
    if (!data.roleId) {
      data.roleId = 'guest';
    } else {
      const role = await Role.findByPk(data.roleId);
      if (!role) {
        throw new AppError(400, '존재하지 않는 역할입니다.');
      }
    }

    // ✅ allowlist: 허용된 필드만 생성 (tokenVersion, isDeleted 등 민감 필드 주입 방지)
    // afterCreate 훅이 Board.create를 실행하므로 트랜잭션으로 감싸야 Board 실패 시 User도 롤백됨
    try {
      return await sequelize.transaction(async t => {
        return User.create(
          {
            id: data.id,
            password: data.password,
            name: data.name,
            roleId: data.roleId,
            isActive: data.isActive ?? true,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          { transaction: t }
        );
      });
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw new AppError(409, '이미 존재하는 사용자 ID입니다.');
      }
      throw err;
    }
  }

  async updateUser(id: string, data: Partial<UserInstance>): Promise<UserInstance> {
    const user = await User.findByPk(id);
    if (!user) {
      throw new AppError(404, '사용자를 찾을 수 없습니다.');
    }

    if (data.roleId) {
      const role = await Role.findByPk(data.roleId);
      if (!role) throw new AppError(400, '존재하지 않는 역할입니다.');
    }

    // 이메일 변경 시 중복 검사
    if (data.email !== undefined && data.email !== null && data.email !== user.email) {
      const existing = await User.findOne({ where: { email: data.email } });
      if (existing) throw new AppError(409, '이미 사용 중인 이메일입니다.');
    }

    // ✅ allowlist: 허용된 필드만 업데이트 (tokenVersion, password 등 민감 필드 덮어쓰기 방지)
    const allowed: Partial<UserInstance> = {};
    if (data.name !== undefined) allowed.name = data.name;
    if (data.email !== undefined) allowed.email = data.email;
    if (data.roleId !== undefined) allowed.roleId = data.roleId;
    if (data.isActive !== undefined) allowed.isActive = data.isActive;

    // isActive가 true→false로 변경되거나 역할이 변경되면 기존 세션을 즉시 무효화
    if (
      (data.isActive === false && user.isActive) ||
      (data.roleId !== undefined && data.roleId !== user.roleId)
    ) {
      allowed.tokenVersion = (user.tokenVersion ?? 0) + 1;
    }

    await user.update(allowed);
    return user;
  }

  async updateMyName(id: string, name: string): Promise<UserInstance> {
    const user = await User.findByPk(id);
    if (!user) throw new AppError(404, '사용자를 찾을 수 없습니다.');
    if (user.isDeletedAccount()) throw new AppError(400, '삭제된 계정입니다.');

    const trimmed = name.trim();
    if (!trimmed || trimmed.length === 0) throw new AppError(400, '이름은 필수입니다.');
    if (trimmed.length > 50) throw new AppError(400, '이름은 50자 이내여야 합니다.');

    await user.update({ name: trimmed });
    return user;
  }

  async approveUser(id: string): Promise<UserInstance> {
    const user = await User.findByPk(id);
    if (!user) throw new AppError(404, '사용자를 찾을 수 없습니다.');
    if (user.isActive) throw new AppError(400, '이미 승인된 사용자입니다.');

    user.isActive = true;
    await user.save();
    return user;
  }

  async rejectUser(id: string): Promise<void> {
    const user = await User.findByPk(id);
    if (!user) throw new AppError(404, '사용자를 찾을 수 없습니다.');
    if (user.isActive)
      throw new AppError(400, '이미 승인된 사용자는 거부할 수 없습니다. 삭제를 이용해주세요.');

    await user.destroy({ force: true });
  }

  async deactivateUser(id: string): Promise<void> {
    const user = await User.findByPk(id);
    if (!user) throw new AppError(404, '사용자를 찾을 수 없습니다.');

    user.isActive = false;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1; // 기존 액세스 토큰 즉시 무효화
    await user.save();
  }

  async restoreUser(id: string): Promise<void> {
    const user = await User.findByPk(id, { paranoid: false });
    if (!user) throw new AppError(404, '사용자를 찾을 수 없습니다.');

    if (!user.deletedAt) throw new AppError(400, '삭제된 사용자가 아닙니다.');

    await user.restore();
    user.isDeleted = false;
    user.isActive = true;
    await user.save();
  }

  async deleteUser(id: string): Promise<{ message: string; anonymizedName?: string }> {
    const user = await User.findByPk(id);
    if (!user) throw new AppError(404, '사용자를 찾을 수 없습니다.');

    // 이미 삭제된 계정 체크
    if (user.deletedAt) {
      throw new AppError(400, '이미 삭제된 계정입니다.');
    }

    // 모든 활성 세션 즉시 만료 (삭제된 계정으로 토큰 갱신 방지)
    await userSessionService.expireAllUserSessions(id).catch(() => {});

    // Soft Delete (beforeDestroy 훅에서 anonymizeAccount()가 호출되므로 여기서 직접 호출 불필요)
    await user.destroy();

    return {
      message: '사용자 삭제 완료',
      anonymizedName: user.anonymizedName ?? undefined,
    };
  }

  // 관리자 초기화: 관리자가 입력한 6자리 임시 비밀번호로 설정 + 강제 변경 플래그 + 기존 세션 무효화.
  // 사용자는 임시 비번으로 로그인 후 비밀번호 변경 전까지 다른 동작이 차단된다.
  // (tempPassword 형식 검증은 컨트롤러에서 6자리 숫자로 수행)
  async resetPassword(id: string, tempPassword: string): Promise<string> {
    const user = await User.findByPk(id);
    if (!user) throw new AppError(404, '사용자를 찾을 수 없습니다.');

    // 삭제된 계정 체크
    if (user.isDeletedAccount()) {
      throw new AppError(400, '삭제된 계정의 비밀번호는 변경할 수 없습니다.');
    }

    user.password = tempPassword; // Hook handles hashing
    user.mustChangePassword = true; // 로그인 후 강제 변경
    user.tokenVersion = (user.tokenVersion ?? 0) + 1; // 기존 세션 즉시 무효화
    await user.save();
    return tempPassword;
  }

  async changePassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await User.findByPk(id);
    if (!user) throw new AppError(404, '사용자를 찾을 수 없습니다.');

    if (user.isDeletedAccount()) {
      throw new AppError(400, '삭제된 계정입니다.');
    }

    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) {
      throw new AppError(400, '현재 비밀번호가 틀렸습니다.');
    }

    user.password = newPassword; // Hook handles hashing
    user.mustChangePassword = false; // 강제 변경 완료 → 플래그 해제
    user.tokenVersion = (user.tokenVersion ?? 0) + 1; // 기존 JWT 즉시 무효화
    await user.save();
  }

  async updateTheme(id: string, theme: string): Promise<string> {
    const user = await User.findByPk(id);
    if (!user) throw new AppError(404, '사용자를 찾을 수 없습니다.');

    if (!['light', 'dark', 'system'].includes(theme)) {
      throw new AppError(400, '유효하지 않은 테마입니다.');
    }

    user.theme = theme;
    await user.save();
    return user.theme;
  }

  async updateAvatar(id: string, fileBuffer: Buffer): Promise<string> {
    const user = await User.findByPk(id);
    if (!user) throw new AppError(404, '사용자를 찾을 수 없습니다.');

    // 새 아바타 처리 먼저 (실패 시 기존 아바타 유지)
    const avatarUrl = await processAvatar(fileBuffer, id);

    // DB 업데이트 후 기존 파일 삭제 (DB 실패 시 신규 파일만 고아화되며 기존 아바타는 보존됨)
    const oldAvatar = user.avatar;
    await user.update({ avatar: avatarUrl });

    if (oldAvatar) {
      await deleteAvatarFile(oldAvatar).catch(() => {});
    }

    return avatarUrl;
  }

  async deleteAvatar(id: string): Promise<void> {
    const user = await User.findByPk(id);
    if (!user) throw new AppError(404, '사용자를 찾을 수 없습니다.');
    if (!user.avatar) throw new AppError(400, '삭제할 아바타가 없습니다.');

    // updateAvatar와 동일하게 DB를 먼저 갱신해야 한다.
    // 파일을 먼저 지우면 DB update가 실패할 경우 깨진 URL이 영구적으로 남는다.
    const oldAvatar = user.avatar;
    await user.update({ avatar: null });
    await deleteAvatarFile(oldAvatar).catch(() => {});
  }
}

export const userService = new UserService();
