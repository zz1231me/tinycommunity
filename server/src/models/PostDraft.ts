// 작성 중인 글의 서버 임시저장.
// Posts에 섞으면 status 필터를 빠뜨린 조회 경로로 남의 초안이 새므로 별도 테이블을 쓴다.

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from 'sequelize';
import { sequelize, LONG_TEXT } from '../config/sequelize';
import { generateRandomId } from '../utils/generateId';

class PostDraftModel extends Model<
  InferAttributes<PostDraftModel>,
  InferCreationAttributes<PostDraftModel>
> {
  declare public id: CreationOptional<string>;
  declare public UserId: ForeignKey<string>;
  declare public boardType: string;
  declare public title: string;
  declare public content: string;
  declare public readonly createdAt: CreationOptional<Date>;
  declare public readonly updatedAt: CreationOptional<Date>;
}

PostDraftModel.init(
  {
    id: {
      type: DataTypes.STRING(12),
      primaryKey: true,
      allowNull: false,
      defaultValue: () => generateRandomId(12),
    },
    UserId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    // boardType은 FK 제약 없이 앱 레벨로만 다룬다. 게시판이 지워져도 초안은 남긴다.
    boardType: { type: DataTypes.STRING(50), allowNull: false },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
      validate: { len: [0, 255] },
    },
    content: { type: LONG_TEXT(), allowNull: false, defaultValue: '' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'PostDrafts',
    modelName: 'PostDraft',
    timestamps: true,
    indexes: [{ fields: ['UserId', 'updatedAt'], name: 'idx_post_drafts_user_updated' }],
  }
);

export const PostDraft = PostDraftModel;
export type PostDraft = PostDraftModel;
export default PostDraftModel;
