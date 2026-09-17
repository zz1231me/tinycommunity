import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/sequelize';

export interface UserSessionAttributes {
  id: string;
  userId: string;
  sessionToken: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  lastActiveAt: Date;
  expiresAt: Date;
  isActive: boolean;
  createdAt?: Date;
}

export interface UserSessionCreationAttributes extends Optional<UserSessionAttributes, 'id'> {}

export class UserSession
  extends Model<UserSessionAttributes, UserSessionCreationAttributes>
  implements UserSessionAttributes
{
  declare public id: string;
  declare public userId: string;
  declare public sessionToken: string;
  declare public ipAddress: string | null | undefined;
  declare public userAgent: string | null | undefined;
  declare public lastActiveAt: Date;
  declare public expiresAt: Date;
  declare public isActive: boolean;
  declare public readonly createdAt: Date;
}

UserSession.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.STRING(50), allowNull: false },
    sessionToken: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    ipAddress: { type: DataTypes.STRING(45), allowNull: true },
    userAgent: { type: DataTypes.STRING(500), allowNull: true },
    lastActiveAt: { type: DataTypes.DATE, allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    sequelize,
    tableName: 'user_sessions',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['userId'] },
      // sessionToken 은 컬럼에 unique: true 가 붙어 있어 DB 가 이미 유니크 인덱스를 만든다.
      // 여기에 또 적으면 같은 컬럼에 인덱스가 두 벌 생겨 쓰기 비용만 늘어난다.
      { fields: ['isActive'] },
      { fields: ['userId', 'isActive'] },
      { fields: ['expiresAt'] },
    ],
  }
);

export default UserSession;
