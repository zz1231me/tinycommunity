// server/src/models/EventPermission.ts
import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

// 타입 전용 import
import type { RoleInstance } from './Role';

// ✅ EventPermissionInstance 타입 정의
export interface EventPermissionInstance extends Model<
  InferAttributes<EventPermissionInstance>,
  InferCreationAttributes<EventPermissionInstance>
> {
  roleId: ForeignKey<string>;
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;

  // 관계 데이터
  role?: NonAttribute<RoleInstance>;
}

// ✅ EventPermission 클래스 정의
export class EventPermission
  extends Model<
    InferAttributes<EventPermissionInstance>,
    InferCreationAttributes<EventPermissionInstance>
  >
  implements EventPermissionInstance
{
  declare public roleId: ForeignKey<string>;
  declare public canCreate: boolean;
  declare public canRead: boolean;
  declare public canUpdate: boolean;
  declare public canDelete: boolean;
  declare public readonly createdAt: Date;
  declare public readonly updatedAt: Date;

  // 관계 데이터
  declare public role: NonAttribute<RoleInstance> | undefined;
}

// 모델 초기화
EventPermission.init(
  {
    roleId: {
      type: DataTypes.STRING(50),
      primaryKey: true,
      allowNull: false,
      references: {
        model: 'roles',
        key: 'id',
      },
    },
    canCreate: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: '이벤트 생성 권한',
    },
    canRead: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: '이벤트 조회 권한',
    },
    canUpdate: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '다른 사람 이벤트 수정 권한 (본인 이벤트는 항상 수정 가능)',
    },
    canDelete: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '다른 사람 이벤트 삭제 권한 (본인 이벤트는 항상 삭제 가능)',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'EventPermission',
    tableName: 'event_permissions',
    timestamps: true,
  }
);

export default EventPermission;
