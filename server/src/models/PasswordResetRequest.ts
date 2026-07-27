import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/sequelize';

export type PasswordResetRequestStatus = 'pending' | 'approved' | 'rejected';

export interface PasswordResetRequestAttributes {
  id: string;
  userId: string; // 로그인 아이디(User.id)
  status: PasswordResetRequestStatus;
  resolvedBy?: string | null; // 처리한 관리자 id
  resolvedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PasswordResetRequestCreationAttributes extends Optional<
  PasswordResetRequestAttributes,
  'id' | 'status'
> {}

export class PasswordResetRequest
  extends Model<PasswordResetRequestAttributes, PasswordResetRequestCreationAttributes>
  implements PasswordResetRequestAttributes
{
  declare public id: string;
  declare public userId: string;
  declare public status: PasswordResetRequestStatus;
  declare public resolvedBy: string | null | undefined;
  declare public resolvedAt: Date | null | undefined;
  declare public readonly createdAt: Date;
  declare public readonly updatedAt: Date;
}

PasswordResetRequest.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.STRING(50), allowNull: false },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      allowNull: false,
      defaultValue: 'pending',
    },
    resolvedBy: { type: DataTypes.STRING(50), allowNull: true },
    resolvedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'password_reset_requests',
    timestamps: true,
    indexes: [{ fields: ['status'] }, { fields: ['userId'] }, { fields: ['userId', 'status'] }],
  }
);
