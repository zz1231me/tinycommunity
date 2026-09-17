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
  // 아래는 관리자가 아닌 일반 사용자도 남기는 행위다.
  // 되돌릴 수 없는 삭제만 넣는다 — 생성·수정은 엔티티 자체에 흔적이 남지만(작성일·수정일),
  // 지워진 것은 무엇이 있었는지 알 길이 없다.
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
    // 속성 이름만 actor 로 바꾸고 물리 컬럼은 adminId/adminName 그대로 둔다.
    //
    // 이 저장소에는 마이그레이션 장치가 없다. 부팅 때 도는 ensureModelColumns 는 없는
    // 컬럼을 '추가' 할 뿐 이름을 바꾸거나 값을 옮기지 못한다. 컬럼까지 바꾸면 새 컬럼이
    // 빈 채로 추가되고 기존 adminId 는 NOT NULL 로 남아, 이후 모든 감사 기록 INSERT 가
    // 실패한다 — 그것도 fire-and-forget 이라 조용히. 기존 172행과 인덱스도 그대로 살린다.
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
        // 아래 값들은 AuditAction 유니온엔 있었으나 ENUM 목록에서 누락돼 있었다. SQLite는 ENUM을
        // TEXT로 저장해 무관하지만, Postgres/MySQL은 enum 제약으로 INSERT가 거부돼 감사 로그가
        // 조용히 유실됐다(logAudit이 fire-and-forget이라 무음). 유니온과 일치하도록 보강.
        'delete_security_log',
        'delete_error_log',
        'create_ip_rule',
        'update_ip_rule',
        'delete_ip_rule',
        'update_attendance_settings',
        // 일반 사용자의 삭제 행위. 부팅 시 widenGrowingEnums 가 이 컬럼을 VARCHAR(40) 으로
        // 넓히므로 길이는 여유가 있고, 넓히기 전이라도 목록에 있으면 거부되지 않는다.
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
    // ⚠️ fields 는 속성명이 아니라 '물리 컬럼명' 이다. 위에서 속성만 actorId 로 바꿨으므로
    //    여기는 adminId 그대로 두어야 한다 — actorId 로 바꾸면 없는 컬럼을 가리킨다.
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
