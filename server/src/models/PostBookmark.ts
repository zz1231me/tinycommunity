import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

export interface PostBookmarkInstance extends Model<
  InferAttributes<PostBookmarkInstance>,
  InferCreationAttributes<PostBookmarkInstance>
> {
  id: CreationOptional<number>;
  PostId: ForeignKey<string>;
  UserId: ForeignKey<string>;
  createdAt: CreationOptional<Date>;
}

class PostBookmarkModel
  extends Model<
    InferAttributes<PostBookmarkInstance>,
    InferCreationAttributes<PostBookmarkInstance>
  >
  implements PostBookmarkInstance
{
  declare public id: CreationOptional<number>;
  declare public PostId: ForeignKey<string>;
  declare public UserId: ForeignKey<string>;
  declare public readonly createdAt: Date;
}

PostBookmarkModel.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
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
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'PostBookmarks',
    modelName: 'PostBookmark',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['PostId', 'UserId'] },
      { fields: ['PostId'] },
      { fields: ['UserId'] },
    ],
  }
);

export const PostBookmark = PostBookmarkModel;
export type PostBookmark = PostBookmarkModel;
