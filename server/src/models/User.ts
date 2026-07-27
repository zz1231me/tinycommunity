// server/src/models/User.ts - TypeScript 5.8 호환 (override 적용)
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

// 타입 전용 import
import type { PostInstance } from './Post';
import type { RoleInstance } from './Role';

// ✅ User 인터페이스 정의 (익명화 필드 추가)
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

  // ✅ 계정 삭제 관련
  // 이중 소프트 삭제 설계 의도:
  //   - isDeleted: 계정이 익명화(anonymize) 처리됐음을 나타내는 앱 레벨 플래그
  //                (이메일/전화번호 등 민감정보 삭제, 닉네임 '삭제된계정_XXXXXX' 변경)
  //   - deletedAt: Sequelize paranoid 기반 DB 레벨 소프트 삭제 (null이 아니면 쿼리에서 제외)
  // beforeDestroy 훅에서 anonymizeAccount()로 isDeleted=true 설정 후 Sequelize가 deletedAt을 채움.
  // paranoid: false 쿼리 시 isDeleted=true 여부로 익명화 상태를 구분할 수 있음.
  isDeleted: CreationOptional<boolean>;
  anonymizedName: CreationOptional<string | null>;

  // ✅ 보안 필드
  isActive: CreationOptional<boolean>;
  mustChangePassword: CreationOptional<boolean>;
  isEmailVerified: CreationOptional<boolean>;
  emailVerificationToken: CreationOptional<string | null>;
  passwordResetToken: CreationOptional<string | null>;
  passwordResetExpires: CreationOptional<Date | null>;
  failedLoginAttempts: CreationOptional<number>;
  lockUntil: CreationOptional<Date | null>;
  lastLoginAt: CreationOptional<Date | null>;
  lastLoginIp: CreationOptional<string | null>;

  // ✅ 프로필
  avatar: CreationOptional<string | null>;
  bio: CreationOptional<string | null>;
  phoneNumber: CreationOptional<string | null>;

  // ✅ 2FA (Two-Factor Authentication)
  twoFactorEnabled: CreationOptional<boolean>;
  twoFactorSecret: CreationOptional<string | null>;

  // ✅ 토큰 버전 (로그아웃 시 기존 JWT 무효화)
  tokenVersion: CreationOptional<number>;

  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
  deletedAt: CreationOptional<Date | null>;

  // 관계 데이터
  roleInfo?: NonAttribute<RoleInstance>;
  posts?: NonAttribute<PostInstance[]>;
}

// ✅ User 클래스 정의 (익명화 메서드 추가)
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
  declare public mustChangePassword: CreationOptional<boolean>;
  declare public isEmailVerified: CreationOptional<boolean>;
  declare public emailVerificationToken: CreationOptional<string | null>;
  declare public passwordResetToken: CreationOptional<string | null>;
  declare public passwordResetExpires: CreationOptional<Date | null>;
  declare public failedLoginAttempts: CreationOptional<number>;
  declare public lockUntil: CreationOptional<Date | null>;
  declare public lastLoginAt: CreationOptional<Date | null>;
  declare public lastLoginIp: CreationOptional<string | null>;

  declare public avatar: CreationOptional<string | null>;
  declare public bio: CreationOptional<string | null>;
  declare public phoneNumber: CreationOptional<string | null>;

  declare public twoFactorEnabled: CreationOptional<boolean>;
  declare public twoFactorSecret: CreationOptional<string | null>;

  declare public tokenVersion: CreationOptional<number>;

  declare public readonly createdAt: Date;
  declare public readonly updatedAt: Date;
  declare public deletedAt: CreationOptional<Date | null>;

  // 관계 데이터
  declare public roleInfo?: NonAttribute<RoleInstance>;
  declare public posts?: NonAttribute<PostInstance[]>;

  // 관계 메서드 정의
  declare public getPosts: HasManyGetAssociationsMixin<PostInstance>;
  declare public getRoleInfo: BelongsToGetAssociationMixin<RoleInstance>;

  // ✅ 이미 해싱된 비밀번호를 저장할 때 beforeUpdate 훅이 재해싱하지 않도록 하는 플래그 (DB에 저장 안됨)
  public _skipPasswordHash = false;

  // ✅ TypeScript 5.8: override 추가
  public static override associations: {
    posts: Association<UserModel, PostInstance>;
    roleInfo: Association<UserModel, RoleInstance>;
  };

  // ✅ 비밀번호 검증
  public async comparePassword(candidatePassword: string): Promise<boolean> {
    return bcrypt.compare(candidatePassword, this.password);
  }

  // ✅ 계정 잠금 확인
  public isLocked(): boolean {
    return !!(this.lockUntil && this.lockUntil > new Date());
  }

  // ✅ 삭제된 계정인지 확인
  public isDeletedAccount(): boolean {
    return this.isDeleted === true;
  }

  // ✅ 로그인 시도 증가 (원자적 increment → race condition 방지)
  public async incrementFailedAttempts(): Promise<void> {
    // DB 레벨 원자적 증가 — 동시 요청 시 카운터 손실 없음
    await this.increment('failedLoginAttempts');
    // increment 후 최신 값 반영
    await this.reload();

    const { maxLoginAttempts, accountLockMinutes } = getSettings();
    if ((this.failedLoginAttempts || 0) >= maxLoginAttempts) {
      await this.update({ lockUntil: new Date(Date.now() + accountLockMinutes * 60 * 1000) });
    }
  }

  // ✅ 로그인 성공 처리
  public async resetFailedAttempts(ipAddress: string): Promise<void> {
    this.failedLoginAttempts = 0;
    this.lockUntil = null;
    this.lastLoginAt = new Date();
    this.lastLoginIp = ipAddress;
    await this.save();
  }

  // ✅ 비밀번호 재설정 토큰 생성 (SHA-256 해시 저장, 평문 반환)
  // transaction 옵션을 받아 save를 같은 트랜잭션에 묶을 수 있다. SQLite는 단일 writer라,
  // 호출부가 트랜잭션을 잡은 상태에서 트랜잭션 밖 save를 하면 SQLITE_BUSY로 교착된다.
  public async generatePasswordResetToken(options?: {
    transaction?: Transaction;
  }): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    this.passwordResetToken = hashedToken; // DB에는 해시만 저장
    this.passwordResetExpires = new Date(Date.now() + getPasswordResetTokenMs());
    await this.save({ transaction: options?.transaction });

    return token; // 평문 토큰은 관리자 승인 시 발급(링크로 전달)
  }

  // ✅ 계정 익명화 (게시글/댓글 작성자명 변경용)
  // externalTransaction: beforeDestroy 훅처럼 이미 트랜잭션이 있는 경우 전달해 중첩 트랜잭션 방지
  public async anonymizeAccount(externalTransaction?: any): Promise<string> {
    const anonymizedName = `삭제된계정_${generateRandomId(6)}`;

    // 외부 트랜잭션이 있으면 재사용, 없으면 새로 생성
    const ownTransaction = !externalTransaction;
    const t = externalTransaction ?? (await sequelize.transaction());

    try {
      // 게시글 작성자명 업데이트
      const { Post } = await import('./Post');
      await Post.update(
        { author: anonymizedName },
        { where: { UserId: this.id }, paranoid: false, transaction: t }
      );

      // 댓글 작성자명 업데이트
      const { Comment } = await import('./Comment');
      await Comment.update(
        { author: anonymizedName },
        { where: { UserId: this.id }, paranoid: false, transaction: t }
      );

      // 민감 데이터 삭제 (GDPR)
      this.email = null;
      this.phoneNumber = null;
      this.twoFactorSecret = null;
      this.twoFactorEnabled = false;
      this.passwordResetToken = null;
      this.passwordResetExpires = null;
      this.emailVerificationToken = null;
      this.bio = null;
      this.avatar = null;
      this.anonymizedName = anonymizedName;
      this.isDeleted = true;
      await this.save({ transaction: t });

      // 직접 생성한 트랜잭션만 커밋 (외부 트랜잭션은 호출자가 커밋)
      if (ownTransaction) await t.commit();
    } catch (error) {
      if (ownTransaction) await t.rollback();
      const err = error as Error;
      logError('익명화 처리 실패 (롤백됨)', err, { userId: this.id });
      throw err;
    }

    return anonymizedName;
  }

  // ✅ TypeScript 5.8: override 추가
  public override toJSON(): Partial<UserInstance> {
    const values = { ...this.get() } as any;
    const {
      password: _password,
      twoFactorSecret: _twoFactorSecret,
      passwordResetToken: _passwordResetToken,
      passwordResetExpires: _passwordResetExpires,
      emailVerificationToken: _emailVerificationToken,
      tokenVersion: _tokenVersion,
      failedLoginAttempts: _failedLoginAttempts,
      lockUntil: _lockUntil,
      lastLoginIp: _lastLoginIp,
      ...safeValues
    } = values;
    return safeValues;
  }
}

// 모델 초기화
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
      type: DataTypes.ENUM('light', 'dark', 'system'),
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
      comment: '계정 활성화 상태',
    },
    mustChangePassword: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'must_change_password',
      comment: '관리자 초기화 후 강제 비밀번호 변경 필요 여부',
    },
    isEmailVerified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '이메일 인증 여부',
    },
    emailVerificationToken: {
      type: DataTypes.STRING(64),
      allowNull: true,
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
    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
      validate: {
        len: [0, 500],
      },
    },
    phoneNumber: {
      type: DataTypes.STRING(20),
      allowNull: true,
      validate: {
        is: /^[0-9\-\+\(\)\s]+$/,
      },
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
        // _skipPasswordHash 플래그가 있으면 이미 해싱된 값이므로 재해싱 건너뜀
        if (user.changed('password') && !user._skipPasswordHash) {
          user.password = await bcrypt.hash(user.password, getBcryptRounds());
        }
        user._skipPasswordHash = false; // 사용 후 리셋
      },
      afterCreate: async (user, options) => {
        try {
          const { default: Board } = await import('./Board');
          logInfo(`[User Hook] ${user.name}님의 개인 폴더 생성 시작`);

          // options.transaction이 있으면 같은 트랜잭션 사용
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
          // 에러를 throw해서 트랜잭션 전체를 롤백시킴
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
            transaction: options?.transaction, // ✅ transaction 전달
          });

          if (personalBoard) {
            logInfo('[User Hook] 개인 폴더 발견', { boardId: personalBoard.id });

            const deletedPosts = await Post.destroy({
              where: { boardType: personalBoard.id },
              force: true,
              transaction: options?.transaction, // ✅ 외부 트랜잭션 롤백 시 데이터 손실 방지
            });

            await personalBoard.destroy({
              force: true,
              transaction: options?.transaction, // ✅ 외부 트랜잭션 롤백 시 데이터 손실 방지
            });
            logSuccess(`[User Hook] 개인 폴더 삭제 완료`, { deletedPosts });
          }

          if (!user.isDeleted) {
            // options.transaction을 전달해 중첩 트랜잭션 방지
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
