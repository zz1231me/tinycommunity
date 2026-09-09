import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/sequelize';

export interface ErrorLogAttributes {
  id: string;
  userId?: string | null;
  userName?: string | null;
  userRole?: string | null;
  route: string;
  method: string;
  errorCode: string;
  errorMessage: string;
  errorStack?: string | null;
  severity: 'info' | 'warning' | 'error' | 'critical';
  requestBody?: any;
  createdAt?: Date;
}

export interface ErrorLogCreationAttributes extends Optional<ErrorLogAttributes, 'id'> {}

export class ErrorLog
  extends Model<ErrorLogAttributes, ErrorLogCreationAttributes>
  implements ErrorLogAttributes
{
  declare public id: string;
  declare public userId: string | null | undefined;
  declare public userName: string | null | undefined;
  declare public userRole: string | null | undefined;
  declare public route: string;
  declare public method: string;
  declare public errorCode: string;
  declare public errorMessage: string;
  declare public errorStack: string | null | undefined;
  declare public severity: 'info' | 'warning' | 'error' | 'critical';
  declare public requestBody: any;
  declare public readonly createdAt: Date;
}

ErrorLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.STRING(50), allowNull: true },
    userName: { type: DataTypes.STRING(100), allowNull: true },
    userRole: { type: DataTypes.STRING(50), allowNull: true },
    route: { type: DataTypes.STRING(500), allowNull: false },
    method: { type: DataTypes.STRING(10), allowNull: false },
    errorCode: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'UNKNOWN' },
    errorMessage: { type: DataTypes.TEXT, allowNull: false },
    errorStack: { type: DataTypes.TEXT, allowNull: true },
    severity: {
      type: DataTypes.ENUM('info', 'warning', 'error', 'critical'),
      allowNull: false,
      defaultValue: 'error',
    },
    requestBody: { type: DataTypes.JSON, allowNull: true },
  },
  {
    sequelize,
    tableName: 'error_logs',
    timestamps: true,
    updatedAt: false,
    indexes: [{ fields: ['severity'] }, { fields: ['userId'] }, { fields: ['createdAt'] }],
  }
);
