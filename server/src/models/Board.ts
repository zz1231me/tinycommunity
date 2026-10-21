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

// BoardInstance 타입 정의
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
  taskEnabled: CreationOptional<boolean>; // 업무용 게시판 여부
  calendarEnabled: CreationOptional<boolean>; // 게시판 달력 사용 여부
  ownerId: ForeignKey<string> | null; // 개인 폴더 소유자
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;

  // 관계
  owner?: NonAttribute<UserInstance>;
}

// Board 클래스 정의
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
  declare public taskEnabled: CreationOptional<boolean>;
  declare public calendarEnabled: CreationOptional<boolean>;
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
    taskEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      // 기본은 꺼짐 — 모든 게시판이 업무 목록은 아니다. 공지·자유게시판에까지
      // 담당자·상태 줄이 붙으면 쓰지 않는 기능이 화면만 차지한다.
      defaultValue: false,
      comment: '업무용 게시판 여부 (담당자·업무 상태·읽음 확인)',
    },
    calendarEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      // 기본은 꺼짐. 켜면 이 게시판만의 달력이 생긴다 — 그 게시판 업무의 기간과,
      // 글이 아닌 일정(회의·마감)을 함께 본다. 전사 공유 달력과는 별개다.
      defaultValue: false,
      comment: '게시판 달력 사용 여부 (게시판 일정 + 업무 기간)',
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
    // 추가 옵션으로 명시적 설정
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
