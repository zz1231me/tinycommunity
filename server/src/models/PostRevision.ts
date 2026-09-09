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

// 게시글 수정 이력. WikiRevision 과 같은 append-only 구조를 따른다.
// 저장되는 값은 "수정되기 직전"의 제목·본문이다 — 즉 각 행은 그 시점 이전 버전의
// 스냅샷이고, 현재 버전은 Post 테이블에 있다.
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
    // Post.id 와 똑같은 타입이어야 한다. UUID 로 두면 MySQL/MariaDB 에서
    //  CHAR(36) BINARY 로 만들어지는데, Posts.id 는 VARCHAR(12) 라 외래키가 붙지 않는다
    //  (errno 150 → 1005, 테이블 생성 자체가 실패). SQLite 는 타입을 안 따져서
    //  개발 중에는 드러나지 않다가 운영 DB 로 옮길 때 터진다.
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
