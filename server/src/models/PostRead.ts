import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

class PostReadModel extends Model<
  InferAttributes<PostReadModel>,
  InferCreationAttributes<PostReadModel>
> {
  declare public id: CreationOptional<number>;
  declare public PostId: ForeignKey<string>;
  declare public UserId: ForeignKey<string>;
  declare public readAt: CreationOptional<Date>;
  declare public readonly createdAt: CreationOptional<Date>;
}

PostReadModel.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    PostId: {
      type: DataTypes.STRING(12),
      allowNull: false,
      references: { model: 'Posts', key: 'id' },
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
    readAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'PostReads',
    modelName: 'PostRead',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['PostId', 'UserId'] },
      { fields: ['PostId'] },
      { fields: ['UserId'] },
    ],
  }
);

export const PostRead = PostReadModel;
export type PostRead = PostReadModel;
