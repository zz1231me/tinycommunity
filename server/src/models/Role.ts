// server/src/models/Role.ts - 수정된 Role 모델
import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

// ✅ RoleInstance 타입 정의 (수정됨)
export interface RoleInstance extends Model<
  InferAttributes<RoleInstance>,
  InferCreationAttributes<RoleInstance>
> {
  id: string;
  name: string;
  description: CreationOptional<string | null>;
  isActive: CreationOptional<boolean>;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

// ✅ Role 클래스 정의 (타입 일치시킴)
export class Role
  extends Model<InferAttributes<RoleInstance>, InferCreationAttributes<RoleInstance>>
  implements RoleInstance
{
  declare public id: string;
  declare public name: string;
  declare public description: CreationOptional<string | null>;
  declare public isActive: CreationOptional<boolean>;
  declare public readonly createdAt: CreationOptional<Date>;
  declare public readonly updatedAt: CreationOptional<Date>;
}

// 모델 초기화 (수정됨)
Role.init(
  {
    id: {
      type: DataTypes.STRING(50),
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
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
    modelName: 'Role',
    tableName: 'roles',
    timestamps: true,
    // ✅ 추가 옵션으로 명시적 설정
    underscored: false,
    freezeTableName: true,
  }
);

export default Role;
