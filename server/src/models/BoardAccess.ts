// server/src/models/BoardAccess.ts - 수정된 BoardAccess 모델
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
import type { Board } from './Board';
import type { RoleInstance } from './Role';

// ✅ BoardAccessInstance 타입 정의
export interface BoardAccessInstance extends Model<
  InferAttributes<BoardAccessInstance>,
  InferCreationAttributes<BoardAccessInstance>
> {
  boardId: ForeignKey<string>;
  roleId: ForeignKey<string>;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;

  // 관계 데이터
  board?: NonAttribute<Board>;
  role?: NonAttribute<RoleInstance>;
}

// ✅ BoardAccess 클래스 정의
export class BoardAccess
  extends Model<InferAttributes<BoardAccessInstance>, InferCreationAttributes<BoardAccessInstance>>
  implements BoardAccessInstance
{
  declare public boardId: ForeignKey<string>;
  declare public roleId: ForeignKey<string>;
  declare public canRead: boolean;
  declare public canWrite: boolean;
  declare public canDelete: boolean;
  declare public readonly createdAt: Date;
  declare public readonly updatedAt: Date;

  // 관계 데이터
  declare public board?: NonAttribute<Board>;
  declare public role?: NonAttribute<RoleInstance>;
}

// 모델 초기화
BoardAccess.init(
  {
    boardId: {
      type: DataTypes.STRING(50),
      primaryKey: true,
      allowNull: false,
    },
    roleId: {
      type: DataTypes.STRING(50),
      primaryKey: true,
      allowNull: false,
    },
    canRead: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    canWrite: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    canDelete: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
    modelName: 'BoardAccess',
    tableName: 'board_accesses',
    timestamps: true,
    // ✅ 추가 옵션으로 명시적 설정
    underscored: false,
    freezeTableName: true,
  }
);

export default BoardAccess;
