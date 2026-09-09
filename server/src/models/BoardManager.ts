import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

class BoardManagerModel extends Model<
  InferAttributes<BoardManagerModel>,
  InferCreationAttributes<BoardManagerModel>
> {
  declare public id: CreationOptional<string>;
  declare public boardId: ForeignKey<string>;
  declare public userId: ForeignKey<string>;
  declare public readonly createdAt: CreationOptional<Date>;
  declare public readonly updatedAt: CreationOptional<Date>;
}

BoardManagerModel.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    boardId: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    userId: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'BoardManagers',
    modelName: 'BoardManager',
    timestamps: true,
    indexes: [
      { fields: ['boardId'] },
      { fields: ['userId'] },
      { unique: true, fields: ['boardId', 'userId'] },
    ],
  }
);

export const BoardManager = BoardManagerModel;
export type BoardManager = BoardManagerModel;
