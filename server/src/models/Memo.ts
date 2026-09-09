import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

export type MemoColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

class MemoModel extends Model<InferAttributes<MemoModel>, InferCreationAttributes<MemoModel>> {
  declare public id: CreationOptional<number>;
  declare public UserId: ForeignKey<string>;
  declare public title: CreationOptional<string>;
  declare public content: CreationOptional<string>;
  declare public color: CreationOptional<MemoColor>;
  declare public isPinned: CreationOptional<boolean>;
  declare public order: CreationOptional<number>;
  declare public readonly createdAt: CreationOptional<Date>;
  declare public readonly updatedAt: CreationOptional<Date>;
}

MemoModel.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    UserId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    title: { type: DataTypes.STRING(200), allowNull: true, defaultValue: '' },
    content: { type: DataTypes.TEXT, allowNull: true, defaultValue: '' },
    color: {
      type: DataTypes.ENUM('yellow', 'green', 'blue', 'pink', 'purple'),
      allowNull: false,
      defaultValue: 'yellow',
    },
    isPinned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'Memos',
    modelName: 'Memo',
    timestamps: true,
    indexes: [{ fields: ['UserId'] }],
  }
);

export const Memo = MemoModel;
export type Memo = MemoModel;
