// 게시글 스크랩(나중에 보기). 비공개라 집계 컬럼도, 작성자 알림도 없다.

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

class PostScrapModel extends Model<
  InferAttributes<PostScrapModel>,
  InferCreationAttributes<PostScrapModel>
> {
  declare public id: CreationOptional<number>;
  declare public PostId: ForeignKey<string>;
  declare public UserId: ForeignKey<string>;
  declare public readonly createdAt: CreationOptional<Date>;
}

PostScrapModel.init(
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
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'PostScraps',
    modelName: 'PostScrap',
    timestamps: true,
    updatedAt: false,
    indexes: [
      // 같은 글을 두 번 스크랩할 수 없다
      { unique: true, fields: ['PostId', 'UserId'], name: 'idx_post_scraps_post_user' },
      // 내 스크랩 목록은 항상 최신순으로 읽는다
      { fields: ['UserId', 'createdAt'], name: 'idx_post_scraps_user_created' },
    ],
  }
);

export const PostScrap = PostScrapModel;
export type PostScrap = PostScrapModel;
export default PostScrapModel;
