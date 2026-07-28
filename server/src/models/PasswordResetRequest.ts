import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/sequelize';

// pending: 인증번호 발급됨(진행 중) · completed: 비밀번호 변경 완료 · locked: 3회 오입력으로 잠금
export type PasswordResetRequestStatus = 'pending' | 'completed' | 'locked';

export interface PasswordResetRequestAttributes {
  id: string;
  userId: string; // 로그인 아이디(User.id)
  status: PasswordResetRequestStatus;
  // ⚠️ 인증번호는 평문으로 저장하지 않는다 — AES-256-GCM(secretCrypto)로 at-rest 암호화.
  //    관리자 목록에서만 복호화해 표시하고, 검증은 복호화 후 상수시간 비교로 수행.
  code?: string | null;
  expiresAt?: Date | null; // 인증번호 만료(생성 후 30분)
  attempts: number; // 오입력 횟수(3회 시 잠금)
  lockedUntil?: Date | null; // 3회 오입력 시 잠금 해제 시각(1시간)
  completedAt?: Date | null; // 비밀번호 변경 완료 시각
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PasswordResetRequestCreationAttributes
  extends Optional<PasswordResetRequestAttributes, 'id' | 'status' | 'attempts'> {}

export class PasswordResetRequest
  extends Model<PasswordResetRequestAttributes, PasswordResetRequestCreationAttributes>
  implements PasswordResetRequestAttributes
{
  declare public id: string;
  declare public userId: string;
  declare public status: PasswordResetRequestStatus;
  declare public code: string | null | undefined;
  declare public expiresAt: Date | null | undefined;
  declare public attempts: number;
  declare public lockedUntil: Date | null | undefined;
  declare public completedAt: Date | null | undefined;
  declare public readonly createdAt: Date;
  declare public readonly updatedAt: Date;
}

PasswordResetRequest.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.STRING(50), allowNull: false },
    status: {
      type: DataTypes.ENUM('pending', 'completed', 'locked'),
      allowNull: false,
      defaultValue: 'pending',
    },
    code: { type: DataTypes.STRING(255), allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: true },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lockedUntil: { type: DataTypes.DATE, allowNull: true },
    completedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'password_reset_requests',
    timestamps: true,
    indexes: [{ fields: ['status'] }, { fields: ['userId'] }, { fields: ['userId', 'status'] }],
  }
);
