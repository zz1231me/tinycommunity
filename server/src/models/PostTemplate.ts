// 글 템플릿. 회의록·보고서처럼 틀이 정해진 글을 빈 에디터에서 매번 다시 만들지 않게 한다.
// 컨플루언스의 template 자리다. 관리자가 만들고 쓰는 사람은 글쓰기에서 고른다.

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

class PostTemplateModel extends Model<
  InferAttributes<PostTemplateModel>,
  InferCreationAttributes<PostTemplateModel>
> {
  declare public id: CreationOptional<number>;
  /** 고르는 자리에 보이는 이름 */
  declare public name: string;
  /** 무엇에 쓰는 틀인지 한 줄 설명. 비어도 된다 */
  declare public description: CreationOptional<string | null>;
  /** 이 게시판에서만 보인다. null 이면 모든 게시판 */
  declare public boardType: CreationOptional<string | null>;
  /** 글 제목에 미리 넣어 둘 값. 비우면 제목은 그대로 빈칸 */
  declare public title: CreationOptional<string | null>;
  /** 본문 HTML. 에디터가 그대로 받는다 */
  declare public content: string;
  declare public order: CreationOptional<number>;
  declare public isActive: CreationOptional<boolean>;
  declare public createdBy: CreationOptional<string | null>;
  declare public readonly createdAt: CreationOptional<Date>;
  declare public readonly updatedAt: CreationOptional<Date>;
}

PostTemplateModel.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.STRING(300), allowNull: true },
    // 게시판이 지워져도 템플릿 때문에 막히지 않게 FK 를 걸지 않는다(이 프로젝트의 방식).
    boardType: { type: DataTypes.STRING(100), allowNull: true },
    title: { type: DataTypes.STRING(200), allowNull: true },
    content: { type: DataTypes.TEXT, allowNull: false },
    order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdBy: { type: DataTypes.STRING(50), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'post_templates',
    modelName: 'PostTemplate',
    timestamps: true,
    indexes: [{ fields: ['boardType'] }, { fields: ['isActive', 'order'] }],
  }
);

export const PostTemplate = PostTemplateModel;
export type PostTemplate = PostTemplateModel;
export default PostTemplateModel;
