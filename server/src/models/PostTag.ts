import { DataTypes, Model, InferAttributes, InferCreationAttributes, ForeignKey } from 'sequelize';
import { sequelize } from '../config/sequelize';

class PostTagModel extends Model<
  InferAttributes<PostTagModel>,
  InferCreationAttributes<PostTagModel>
> {
  declare public PostId: ForeignKey<string>;
  declare public TagId: ForeignKey<number>;
}

PostTagModel.init(
  {
    PostId: { type: DataTypes.STRING(12), allowNull: false, primaryKey: true },
    TagId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
  },
  {
    sequelize,
    tableName: 'PostTags',
    modelName: 'PostTag',
    timestamps: false,
  }
);

export const PostTag = PostTagModel;
export type PostTag = PostTagModel;
