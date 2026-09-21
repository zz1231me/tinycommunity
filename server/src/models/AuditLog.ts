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
  | 'reorder_boards'
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
  | 'delete_ip_rule'
  | 'update_attendance_settings'
  // 일반 사용자도 남기는 행위. 되돌릴 수 없는 삭제만 넣는다.
  | 'delete_post'
  | 'delete_comment'
  | 'delete_wiki_page';

export type AuditTargetType =
  | 'user'
  | 'board'
  | 'role'
  | 'event'
  | 'setting'
  | 'security_log'
  | 'error_log'
  | 'ip_rule'
  | 'attendance'
  | 'post'
  | 'comment'
  | 'wiki';

export interface AuditLogAttributes {
  id: string;
  actorId: string;
  actorName: string;
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
  declare public actorId: string;
  declare public actorName: string;
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
    // 속성 이름만 actor 이고 물리 컬럼은 adminId/adminName 이다. 컬럼명을 바꾸는 마이그레이션 장치가 없다.
    actorId: { type: DataTypes.STRING(50), allowNull: false, field: 'adminId' },
    actorName: { type: DataTypes.STRING(100), allowNull: false, field: 'adminName' },
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
        'reorder_boards',
        'delete_board',
        'create_role',
        'update_role',
        'delete_role',
        'update_permission',
        'delete_event',
        'update_event',
        'update_site_settings',
        'force_logout',
        // AuditAction 유니온과 반드시 일치해야 한다. 빠지면 Postgres/MySQL 에서 INSERT 가 거부된다.
        'delete_security_log',
        'delete_error_log',
        'create_ip_rule',
        'update_ip_rule',
        'delete_ip_rule',
        'update_attendance_settings',
        'delete_post',
        'delete_comment',
        'delete_wiki_page'
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
        'ip_rule',
        'attendance',
        'post',
        'comment',
        'wiki'
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
    // fields 는 속성명이 아니라 물리 컬럼명이라 adminId 그대로 두어야 한다.
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
