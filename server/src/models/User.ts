import {
  DataTypes,
  Model,
  HasManyGetAssociationsMixin,
  Association,
  BelongsToGetAssociationMixin,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  NonAttribute,
  Transaction,
} from 'sequelize';
import { sequelize } from '../config/sequelize';
import bcrypt from 'bcryptjs';
import { getBcryptRounds, getSettings, getPasswordResetTokenMs } from '../utils/settingsCache';
import crypto from 'crypto';
import { logInfo, logError, logSuccess } from '../utils/logger';
import { generateRandomId } from '../utils/generateId';

import type { PostInstance } from './Post';
import type { RoleInstance } from './Role';

export interface UserInstance extends Model<
  InferAttributes<UserInstance>,
  InferCreationAttributes<UserInstance>
> {
  id: string;
  password: string;
  name: string;
  email: CreationOptional<string | null>;
  roleId: string;
  theme: CreationOptional<string>;

  // isDeleted 는 익명화 여부(앱 레벨), deletedAt 은 paranoid 소프트 삭제다.
  isDeleted: CreationOptional<boolean>;
  anonymizedName: CreationOptional<string | null>;

  isActive: CreationOptional<boolean>;
  isApproved: CreationOptional<boolean>;
  mustChangePassword: CreationOptional<boolean>;
  passwordResetToken: CreationOptional<string | null>;
  passwordResetExpires: CreationOptional<Date | null>;
  failedLoginAttempts: CreationOptional<number>;
  lockUntil: CreationOptional<Date | null>;
  lastLoginAt: CreationOptional<Date | null>;
  lastLoginIp: CreationOptional<string | null>;

  avatar: CreationOptional<string | null>;

  twoFactorEnabled: CreationOptional<boolean>;
  twoFactorSecret: CreationOptional<string | null>;

  // 로그아웃 시 올려 기존 JWT 를 무효화한다
  tokenVersion: CreationOptional<number>;

  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
  deletedAt: CreationOptional<Date | null>;

  roleInfo?: NonAttribute<RoleInstance>;
  posts?: NonAttribute<PostInstance[]>;
}

class UserModel
  extends Model<InferAttributes<UserInstance>, InferCreationAttributes<UserInstance>>
  implements UserInstance
{
  declare public id: string;
  declare public password: string;
  declare public name: string;
  declare public email: CreationOptional<string | null>;
  declare public roleId: string;
  declare public theme: CreationOptional<string>;

  declare public isDeleted: CreationOptional<boolean>;
  declare public anonymizedName: CreationOptional<string | null>;

  declare public isActive: CreationOptional<boolean>;
  declare public isApproved: CreationOptional<boolean>;
  declare public mustChangePassword: CreationOptional<boolean>;
  declare public passwordResetToken: CreationOptional<string | null>;
  declare public passwordResetExpires: CreationOptional<Date | null>;
  declare public failedLoginAttempts: CreationOptional<number>;
  declare public lockUntil: CreationOptional<Date | null>;
  declare public lastLoginAt: CreationOptional<Date | null>;
  declare public lastLoginIp: CreationOptional<string | null>;

  declare public avatar: CreationOptional<string | null>;

  declare public twoFactorEnabled: CreationOptional<boolean>;
  declare public twoFactorSecret: CreationOptional<string | null>;

  declare public tokenVersion: CreationOptional<number>;

  declare public readonly createdAt: Date;
  declare public readonly updatedAt: Date;
  declare public deletedAt: CreationOptional<Date | null>;

  declare public roleInfo?: NonAttribute<RoleInstance>;
  declare public posts?: NonAttribute<PostInstance[]>;

  declare public getPosts: HasManyGetAssociationsMixin<PostInstance>;
  declare public getRoleInfo: BelongsToGetAssociationMixin<RoleInstance>;

  // 이미 해싱된 비밀번호를 저장할 때 beforeUpdate 의 재해싱을 건너뛰는 플래그(DB 저장 안 됨)
  public _skipPasswordHash = false;

  public static override associations: {
    posts: Association<UserModel, PostInstance>;
    roleInfo: Association<UserModel, RoleInstance>;
  };

  public async comparePassword(candidatePassword: string): Promise<boolean> {
    return bcrypt.compare(candidatePassword, this.password);
  }

  public isLocked(): boolean {
    return !!(this.lockUntil && this.lockUntil > new Date());
  }

  public isDeletedAccount(): boolean {
    return this.isDeleted === true;
  }

  // 원자적 increment 로 동시 요청 시 카운터 손실을 막는다
  public async incrementFailedAttempts(): Promise<void> {
    await this.increment('failedLoginAttempts');
    await this.reload();

    const { maxLoginAttempts, accountLockMinutes } = getSettings();
    if ((this.failedLoginAttempts || 0) >= maxLoginAttempts) {
      await this.update({ lockUntil: new Date(Date.now() + accountLockMinutes * 60 * 1000) });
    }
  }

  public async resetFailedAttempts(ipAddress: string): Promise<void> {
    this.failedLoginAttempts = 0;
    this.lockUntil = null;
    this.lastLoginAt = new Date();
    this.lastLoginIp = ipAddress;
    await this.save();
  }

  // 재설정 토큰 생성(해시 저장, 평문 반환).
  // transaction 을 받아 같은 트랜잭션에 묶는다. SQLite 는 단일 writer 라 밖에서 save 하면 교착된다.
  public async generatePasswordResetToken(options?: {
    transaction?: Transaction;
  }): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    this.passwordResetToken = hashedToken; // DB에는 해시만 저장
    this.passwordResetExpires = new Date(Date.now() + getPasswordResetTokenMs());
    await this.save({ transaction: options?.transaction });

    return token; // 평문 토큰은 링크로만 전달한다
  }

  // 계정 익명화. externalTransaction 을 받으면 중첩 트랜잭션을 만들지 않는다.
  public async anonymizeAccount(externalTransaction?: any): Promise<string> {
    const anonymizedName = `삭제된계정_${generateRandomId(6)}`;

    const ownTransaction = !externalTransaction;
    const t = externalTransaction ?? (await sequelize.transaction());

    try {
      const { Post } = await import('./Post');
      await Post.update(
        { author: anonymizedName },
        { where: { UserId: this.id }, paranoid: false, transaction: t }
      );

      const { Comment } = await import('./Comment');
      await Comment.update(
        { author: anonymizedName },
        { where: { UserId: this.id }, paranoid: false, transaction: t }
      );

      // 민감 데이터 삭제
      this.email = null;
      this.twoFactorSecret = null;
      this.twoFactorEnabled = false;
      this.passwordResetToken = null;
      this.passwordResetExpires = null;
      this.avatar = null;
      this.anonymizedName = anonymizedName;
      this.isDeleted = true;
      await this.save({ transaction: t });

      // 직접 만든 트랜잭션만 커밋한다
      if (ownTransaction) await t.commit();
    } catch (error) {
      if (ownTransaction) await t.rollback();
      const err = error as Error;
      logError('익명화 처리 실패 (롤백됨)', err, { userId: this.id });
      throw err;
    }

    return anonymizedName;
  }

  public override toJSON(): Partial<UserInstance> {
    const values = { ...this.get() } as any;
    const {
      password: _password,
      twoFactorSecret: _twoFactorSecret,
      passwordResetToken: _passwordResetToken,
      passwordResetExpires: _passwordResetExpires,
      tokenVersion: _tokenVersion,
      failedLoginAttempts: _failedLoginAttempts,
      lockUntil: _lockUntil,
      lastLoginIp: _lastLoginIp,
      ...safeValues
    } = values;
    return safeValues;
  }
}

UserModel.init(
  {
    id: {
      type: DataTypes.STRING(50),
      primaryKey: true,
      allowNull: false,
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        len: [1, 50],
      },
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    roleId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'role',
      references: {
        model: 'roles',
        key: 'id',
      },
    },
    theme: {
      // ENUM 대신 문자열. 값이 늘어도 ALTER 가 필요 없고 허용값은 user.service 가 검사한다.
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'system',
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '계정 삭제 여부 (소프트 삭제 전 플래그)',
    },
    anonymizedName: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: '익명화된 이름 (예: 삭제된계정_ABC123)',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: '계정 활성화 상태(로그인 가능 여부)',
    },
    isApproved: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: '관리자 승인 완료 여부. false=가입 후 승인 대기, true=승인됨(비활성화돼도 유지)',
    },
    mustChangePassword: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'must_change_password',
      comment: '관리자 초기화 후 강제 비밀번호 변경 필요 여부',
    },
    passwordResetToken: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    passwordResetExpires: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    failedLoginAttempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    lockUntil: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '계정 잠금 해제 시간',
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastLoginIp: {
      type: DataTypes.STRING(45),
      allowNull: true,
      comment: 'IPv4/IPv6 주소',
    },
    avatar: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: '프로필 이미지 URL',
    },
    twoFactorEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    twoFactorSecret: {
      type: DataTypes.STRING(64), // speakeasy 등 라이브러리 시크릿은 최대 64자
      allowNull: true,
    },
    tokenVersion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '로그아웃 시 증가하여 기존 JWT 토큰을 무효화',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'users',
    modelName: 'User',
    timestamps: true,
    paranoid: true,
    underscored: false,
    freezeTableName: true,
    indexes: [{ fields: ['role'] }, { fields: ['isActive'] }, { fields: ['lastLoginAt'] }],
    hooks: {
      beforeCreate: async user => {
        if (user.password) {
          user.password = await bcrypt.hash(user.password, getBcryptRounds());
        }
      },
      beforeUpdate: async user => {
        // 이미 해싱된 값이면 재해싱을 건너뛴다
        if (user.changed('password') && !user._skipPasswordHash) {
          user.password = await bcrypt.hash(user.password, getBcryptRounds());
        }
        user._skipPasswordHash = false;
      },
      afterCreate: async (user, options) => {
        try {
          const { default: Board } = await import('./Board');
          logInfo(`[User Hook] ${user.name}님의 개인 폴더 생성 시작`);

          const t = options?.transaction;

          const personalBoardId = `personal_${crypto.randomUUID().split('-').join('')}`;

          const personalBoard = await Board.create(
            {
              id: personalBoardId,
              name: `${user.name}님의 개인공간`,
              description: '본인만 접근 가능한 개인 공간입니다.',
              isPersonal: true,
              ownerId: user.id,
              isActive: true,
              order: 999,
            },
            { transaction: t }
          );

          logSuccess(`[User Hook] 개인 폴더 생성 완료`, { boardId: personalBoard.id });
        } catch (error) {
          logError('[User Hook] 개인 폴더 생성 실패', error, { userId: user.id });
          // throw 해서 트랜잭션 전체를 롤백한다
          throw error;
        }
      },
      beforeDestroy: async (user, options) => {
        try {
          logInfo(`[User Hook] ${user.name}님 계정 삭제 시작`);

          const { default: Board } = await import('./Board');
          const { Post } = await import('./Post');

          const personalBoard = await Board.findOne({
            where: {
              isPersonal: true,
              ownerId: user.id,
            },
            transaction: options?.transaction,
          });

          if (personalBoard) {
            logInfo('[User Hook] 개인 폴더 발견', { boardId: personalBoard.id });

            const deletedPosts = await Post.destroy({
              where: { boardType: personalBoard.id },
              force: true,
              transaction: options?.transaction,
            });

            await personalBoard.destroy({
              force: true,
              transaction: options?.transaction,
            });
            logSuccess(`[User Hook] 개인 폴더 삭제 완료`, { deletedPosts });
          }

          if (!user.isDeleted) {
            // 중첩 트랜잭션을 만들지 않도록 전달한다
            await user.anonymizeAccount(options?.transaction);
          }

          logSuccess(`[User Hook] 계정 삭제 완료`, { userId: user.anonymizedName || user.name });
        } catch (error) {
          logError('[User Hook] 계정 삭제 실패', error, { userId: user.id });
          throw error;
        }
      },
    },
  }
);

export const User = UserModel;
export type User = UserModel;
export default UserModel;
