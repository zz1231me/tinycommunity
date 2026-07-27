import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

class TagModel extends Model<InferAttributes<TagModel>, InferCreationAttributes<TagModel>> {
  declare public id: CreationOptional<number>;
  declare public name: string;
  declare public color: CreationOptional<string>;
  declare public description: CreationOptional<string | null>;
  declare public boardId: CreationOptional<string | null>; // null = 전체 공용 태그
  declare public readonly createdAt: CreationOptional<Date>;
  declare public readonly updatedAt: CreationOptional<Date>;
}

TagModel.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: { notEmpty: true, len: [1, 50] },
    },
    color: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '#3b82f6' },
    description: { type: DataTypes.TEXT, allowNull: true },
    boardId: { type: DataTypes.STRING(50), allowNull: true, defaultValue: null },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'Tags',
    modelName: 'Tag',
    timestamps: true,
    indexes: [
      // (name, boardId) 복합 유니크: 같은 게시판 내 태그명 중복 방지
      // alter:true(MySQL/PostgreSQL)에서는 서버 시작 시 자동 적용;
      // SQLite(alter:false)는 최초 테이블 생성 시에만 적용됨
      { unique: true, fields: ['name', 'boardId'], name: 'idx_tags_name_boardId' },
    ],
  }
);

export const Tag = TagModel;
export type Tag = TagModel;
