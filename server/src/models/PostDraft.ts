// server/src/models/PostDraft.ts
// 작성 중인 글의 서버 임시저장.
//
// Post.status='draft' 를 쓰지 않고 별도 테이블을 둔 이유:
// getPostById 에는 status 필터가 없다. 초안을 Posts 에 넣으면 게시판 읽기 권한만
// 있으면 URL 로 남의 미완성 글을 열 수 있다. 조회 경로가 하나라도 status 를
// 빠뜨리면 새는 구조라, 아예 다른 테이블에 두어 샐 경로 자체를 없앤다.

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from 'sequelize';
import { sequelize } from '../config/sequelize';
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
    // Post.boardType 과 같이 FK 제약 없이 앱 레벨로만 다룬다 —
    // 게시판이 사라져도 쓰던 글이 함께 지워지면 안 된다.
    boardType: { type: DataTypes.STRING(50), allowNull: false },
    // 제목은 쓰는 도중이라 비어 있을 수 있다
    title: { type: DataTypes.STRING(255), allowNull: false, defaultValue: '' },
    content: { type: DataTypes.TEXT('long'), allowNull: false, defaultValue: '' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'PostDrafts',
    modelName: 'PostDraft',
    timestamps: true,
    // 목록은 항상 "가장 최근에 손댄 것" 순으로 읽는다
    indexes: [{ fields: ['UserId', 'updatedAt'], name: 'idx_post_drafts_user_updated' }],
  }
);

export const PostDraft = PostDraftModel;
export type PostDraft = PostDraftModel;
export default PostDraftModel;
