import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

export interface CommentLikeInstance extends Model<
  InferAttributes<CommentLikeInstance>,
  InferCreationAttributes<CommentLikeInstance>
> {
  id: CreationOptional<number>;
  CommentId: ForeignKey<number>;
  UserId: ForeignKey<string>;
  createdAt: CreationOptional<Date>;
}

class CommentLikeModel
  extends Model<InferAttributes<CommentLikeInstance>, InferCreationAttributes<CommentLikeInstance>>
  implements CommentLikeInstance
{
  declare public id: CreationOptional<number>;
  declare public CommentId: ForeignKey<number>;
  declare public UserId: ForeignKey<string>;
  declare public readonly createdAt: Date;
}

CommentLikeModel.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    CommentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'comments', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    UserId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'CommentLikes',
    modelName: 'CommentLike',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['CommentId', 'UserId'] },
      { fields: ['CommentId'] },
      { fields: ['UserId'] },
    ],
  }
);

export const CommentLike = CommentLikeModel;
export type CommentLike = CommentLikeModel;
