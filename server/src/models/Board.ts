// server/src/models/Board.ts - 수정된 Board 모델
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
import type { UserInstance } from './User';

// ✅ BoardInstance 타입 정의
export interface BoardInstance extends Model<
  InferAttributes<BoardInstance>,
  InferCreationAttributes<BoardInstance>
> {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  order: number;
  isPersonal: CreationOptional<boolean>; // 개인 폴더 여부
  ownerId: ForeignKey<string> | null; // 개인 폴더 소유자
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;

  // 관계
  owner?: NonAttribute<UserInstance>;
}

// ✅ Board 클래스 정의
export class Board
  extends Model<InferAttributes<BoardInstance>, InferCreationAttributes<BoardInstance>>
  implements BoardInstance
{
  declare public id: string;
  declare public name: string;
  declare public description: string | null;
  declare public isActive: boolean;
  declare public order: number;
  declare public isPersonal: CreationOptional<boolean>;
  declare public ownerId: ForeignKey<string> | null;
  declare public readonly createdAt: Date;
  declare public readonly updatedAt: Date;

  // 관계
  declare public owner?: NonAttribute<UserInstance>;
}

// 모델 초기화
Board.init(
  {
    id: {
      type: DataTypes.STRING(50),
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(100),
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
    order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isPersonal: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '개인 폴더 여부',
    },
    ownerId: {
      type: DataTypes.STRING(50),
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'CASCADE',
      comment: '개인 폴더 소유자 (isPersonal=true일 때만)',
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
    modelName: 'Board',
    tableName: 'boards',
    timestamps: true,
    // ✅ 추가 옵션으로 명시적 설정
    underscored: false,
    freezeTableName: true,
    indexes: [
      {
        fields: ['isPersonal', 'ownerId'],
        name: 'idx_boards_personal',
        unique: true,
        where: { isPersonal: true },
      },
    ],
  }
);

export default Board;
