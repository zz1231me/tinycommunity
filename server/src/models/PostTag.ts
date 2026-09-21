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
    indexes: [
      // 복합 PK 는 (PostId, TagId) 순서라 TagId 로 먼저 좁히는 조회에는 선행 컬럼이 없다
      { fields: ['TagId', 'PostId'], name: 'idx_posttags_tag_post' },
    ],
  }
);

export const PostTag = PostTagModel;
export type PostTag = PostTagModel;
