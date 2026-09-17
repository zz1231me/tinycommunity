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
      // 복합 PK 는 (PostId, TagId) 순서라 "이 글의 태그" 방향만 인덱스가 있다.
      // 태그 클라우드는 반대로 TagId 로 먼저 좁히는데, 그 방향으로는 선행 컬럼이
      // 없어 옵티마이저에게 선택지가 없었다(태그마다 PostTags 전체 훑기).
      // 이 인덱스가 있으면 태그가 선택도 높은 쪽일 때 그쪽에서 출발할 수 있다.
      { fields: ['TagId', 'PostId'], name: 'idx_posttags_tag_post' },
    ],
  }
);

export const PostTag = PostTagModel;
export type PostTag = PostTagModel;
