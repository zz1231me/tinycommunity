// 글에서 글로 가는 링크. 본문에 /dashboard/posts/<게시판>/<글id> 가 들어 있으면 한 줄이 생긴다.
//
// 대상 글 화면에서 '이 글을 가리키는 글'(역링크)을 보여 주는 데 쓴다. 글이 지워지면 함께
// 사라져야 하는데, 이 프로젝트는 DB 제약 대신 Sequelize 연관(constraints: false + hooks)으로
// 정리한다(PostActivity 와 같은 방식). 그래서 여기에 references 를 걸지 않는다.

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

class PostLinkModel extends Model<
  InferAttributes<PostLinkModel>,
  InferCreationAttributes<PostLinkModel>
> {
  declare public id: CreationOptional<number>;
  /** 링크를 담고 있는 글 */
  declare public fromPostId: string;
  /** 가리켜진 글 */
  declare public toPostId: string;
  declare public readonly createdAt: CreationOptional<Date>;
  declare public readonly updatedAt: CreationOptional<Date>;
}

PostLinkModel.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    fromPostId: { type: DataTypes.STRING(32), allowNull: false },
    toPostId: { type: DataTypes.STRING(32), allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'post_links',
    modelName: 'PostLink',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['fromPostId', 'toPostId'] },
      // 역링크 조회는 항상 '가리켜진 글' 로 찾는다
      { fields: ['toPostId'] },
    ],
  }
);

export const PostLink = PostLinkModel;
export type PostLink = PostLinkModel;
export default PostLinkModel;
