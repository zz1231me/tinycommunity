// server/src/models/Bookmark.ts
import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from 'sequelize';
import { sequelize } from '../config/sequelize';
import { generateRandomId } from '../utils/generateId';

// ✅ BookmarkInstance 타입 정의
export interface BookmarkInstance extends Model<
  InferAttributes<BookmarkInstance>,
  InferCreationAttributes<BookmarkInstance>
> {
  id: CreationOptional<string>;
  name: string;
  url: string;
  icon?: string | null;
  order: number;
  isActive: boolean;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

// ✅ Bookmark 클래스 정의
export class Bookmark
  extends Model<InferAttributes<BookmarkInstance>, InferCreationAttributes<BookmarkInstance>>
  implements BookmarkInstance
{
  declare public id: CreationOptional<string>;
  declare public name: string;
  declare public url: string;
  declare public icon?: string | null;
  declare public order: number;
  declare public isActive: boolean;
  declare public readonly createdAt: Date;
  declare public readonly updatedAt: Date;
}

// 모델 초기화
Bookmark.init(
  {
    id: {
      type: DataTypes.STRING(12),
      primaryKey: true,
      allowNull: false,
      defaultValue: () => generateRandomId(12),
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    url: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    icon: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
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
    modelName: 'Bookmark',
    tableName: 'bookmarks',
    timestamps: true,
  }
);

export default Bookmark;
