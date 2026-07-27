import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/sequelize';

export type AuditAction =
  | 'create_user'
  | 'update_user'
  | 'delete_user'
  | 'restore_user'
  | 'approve_user'
  | 'reject_user'
  | 'deactivate_user'
  | 'reset_password'
  | 'approve_password_reset'
  | 'reject_password_reset'
  | 'change_role'
  | 'create_board'
  | 'update_board'
  | 'delete_board'
  | 'create_role'
  | 'update_role'
  | 'delete_role'
  | 'update_permission'
  | 'delete_event'
  | 'update_event'
  | 'update_site_settings'
  | 'force_logout'
  | 'delete_security_log'
  | 'delete_error_log'
  | 'create_ip_rule'
  | 'update_ip_rule'
  | 'delete_ip_rule';

export type AuditTargetType =
  | 'user'
  | 'board'
  | 'role'
  | 'event'
  | 'setting'
  | 'security_log'
  | 'error_log'
  | 'ip_rule';

export interface AuditLogAttributes {
  id: string;
  adminId: string;
  adminName: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string | null;
  targetName?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  beforeValue?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  afterValue?: any;
  ipAddress?: string | null;
  createdAt?: Date;
}

export interface AuditLogCreationAttributes extends Optional<AuditLogAttributes, 'id'> {}

export class AuditLog
  extends Model<AuditLogAttributes, AuditLogCreationAttributes>
  implements AuditLogAttributes
{
  declare public id: string;
  declare public adminId: string;
  declare public adminName: string;
  declare public action: AuditAction;
  declare public targetType: AuditTargetType;
  declare public targetId: string | null | undefined;
  declare public targetName: string | null | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  declare public beforeValue: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  declare public afterValue: any;
  declare public ipAddress: string | null | undefined;
  declare public readonly createdAt: Date;
}

AuditLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    adminId: { type: DataTypes.STRING(50), allowNull: false },
    adminName: { type: DataTypes.STRING(100), allowNull: false },
    action: {
      type: DataTypes.ENUM(
        'create_user',
        'update_user',
        'delete_user',
        'restore_user',
        'approve_user',
        'reject_user',
        'deactivate_user',
        'reset_password',
        'approve_password_reset',
        'reject_password_reset',
        'change_role',
        'create_board',
        'update_board',
        'delete_board',
        'create_role',
        'update_role',
        'delete_role',
        'update_permission',
        'delete_event',
        'update_event',
        'update_site_settings',
        'force_logout',
        // 아래 값들은 AuditAction 유니온엔 있었으나 ENUM 목록에서 누락돼 있었다. SQLite는 ENUM을
        // TEXT로 저장해 무관하지만, Postgres/MySQL은 enum 제약으로 INSERT가 거부돼 감사 로그가
        // 조용히 유실됐다(logAudit이 fire-and-forget이라 무음). 유니온과 일치하도록 보강.
        'delete_security_log',
        'delete_error_log',
        'create_ip_rule',
        'update_ip_rule',
        'delete_ip_rule'
      ),
      allowNull: false,
    },
    targetType: {
      type: DataTypes.ENUM(
        'user',
        'board',
        'role',
        'event',
        'setting',
        'security_log',
        'error_log',
        'ip_rule'
      ),
      allowNull: false,
    },
    targetId: { type: DataTypes.STRING(100), allowNull: true },
    targetName: { type: DataTypes.STRING(200), allowNull: true },
    beforeValue: { type: DataTypes.JSON, allowNull: true },
    afterValue: { type: DataTypes.JSON, allowNull: true },
    ipAddress: { type: DataTypes.STRING(45), allowNull: true },
  },
  {
    sequelize,
    tableName: 'audit_logs',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['adminId'] },
      { fields: ['action'] },
      { fields: ['targetType'] },
      { fields: ['targetId'] },
      { fields: ['createdAt'] },
      { fields: ['adminId', 'createdAt'] },
      { fields: ['targetType', 'targetId'] },
    ],
  }
);
