import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

// 게시글 수정 이력(append-only). 각 행은 수정 직전의 제목·본문이고 현재 버전은 Post 에 있다.
class PostRevisionModel extends Model<
  InferAttributes<PostRevisionModel>,
  InferCreationAttributes<PostRevisionModel>
> {
  declare public id: CreationOptional<number>;
  declare public postId: ForeignKey<string>;
  declare public editorId: ForeignKey<string | null>;
  declare public title: string;
  declare public content: CreationOptional<string>;
  declare public readonly createdAt: CreationOptional<Date>;
  // virtual associations
  declare public editor?: NonAttribute<{ id: string; name: string }>;
}

PostRevisionModel.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    // Post.id 와 타입이 같아야 한다. 다르면 MySQL/MariaDB 에서 외래키가 붙지 않는다.
    postId: { type: DataTypes.STRING(12), allowNull: false },
    editorId: { type: DataTypes.STRING(50), allowNull: true },
    title: { type: DataTypes.STRING(255), allowNull: false },
    content: { type: DataTypes.TEXT('long'), allowNull: true, defaultValue: '' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'PostRevisions',
    modelName: 'PostRevision',
    timestamps: true,
    updatedAt: false, // append-only 이력 테이블
    indexes: [{ fields: ['postId', 'createdAt'] }, { fields: ['editorId'] }],
  }
);

export const PostRevision = PostRevisionModel;
export type PostRevision = PostRevisionModel;
