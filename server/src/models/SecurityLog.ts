import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../config/sequelize';

export interface SecurityLogAttributes {
  id: string;
  userId?: string | null;
  ipAddress: string | null;
  action: string;
  method: string;
  route: string;
  userAgent: string;
  status: string;
  details?: any;
  createdAt?: Date;
}

export interface SecurityLogCreationAttributes extends Optional<SecurityLogAttributes, 'id'> {}

export class SecurityLog
  extends Model<SecurityLogAttributes, SecurityLogCreationAttributes>
  implements SecurityLogAttributes
{
  declare public id: string;
  declare public userId: string | null | undefined;
  declare public ipAddress: string | null;
  declare public action: string;
  declare public method: string;
  declare public route: string;
  declare public userAgent: string;
  declare public status: string;
  declare public details: any;
  declare public readonly createdAt: Date;
}

SecurityLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    // 명시적 길이 지정 — 기본 STRING(VARCHAR 255)이면 긴 URL(route)/UA 문자열이 MySQL·PG
    // strict 모드에서 잘리거나 INSERT 에러가 난다. LoginHistory와 동일한 길이 기준으로 통일.
    userId: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    ipAddress: {
      type: DataTypes.STRING(45), // IPv6 최대 길이
      allowNull: true, // 내부 시스템 이벤트 등 IP가 없는 경우 허용
      defaultValue: null,
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    method: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    route: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    userAgent: {
      type: DataTypes.STRING(500),
      allowNull: true,
      defaultValue: 'Unknown',
    },
    status: {
      type: DataTypes.STRING(20), // ENUM('SUCCESS', 'FAILURE') -> STRING to support 'WARNING', 'CRITICAL' etc.
      defaultValue: 'SUCCESS',
    },
    details: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'security_logs',
    timestamps: true,
    updatedAt: false, // 로그는 수정되지 않음
    indexes: [
      { fields: ['createdAt'] },
      { fields: ['userId'] },
      { fields: ['action'] },
      { fields: ['status'] },
    ],
  }
);
