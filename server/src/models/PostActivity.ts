// 다른 테이블에 남지 않는 글 활동(업무 상태·담당자 변경)만 적는 append-only 이력.

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

/** 사건 종류. 값이 늘 수 있어 ENUM 이 아닌 문자열이다. */
export type PostActivityKind = 'status' | 'assignee';

class PostActivityModel extends Model<
  InferAttributes<PostActivityModel>,
  InferCreationAttributes<PostActivityModel>
> {
  declare public id: CreationOptional<number>;
  declare public postId: ForeignKey<string>;
  /** 바꾼 사람. 탈퇴해도 기록이 남도록 null 을 허용한다. */
  declare public actorId: ForeignKey<string | null>;
  declare public kind: PostActivityKind;
  /** 바뀌기 전 값. 상태는 상태키, 담당자는 사용자 id. 없었으면 null */
  declare public fromValue: CreationOptional<string | null>;
  declare public toValue: CreationOptional<string | null>;
  declare public readonly createdAt: CreationOptional<Date>;

  declare public actor?: NonAttribute<{ id: string; name: string }>;
}

PostActivityModel.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    postId: { type: DataTypes.STRING(50), allowNull: false },
    actorId: { type: DataTypes.STRING(50), allowNull: true },
    kind: { type: DataTypes.STRING(20), allowNull: false },
    fromValue: { type: DataTypes.STRING(100), allowNull: true },
    toValue: { type: DataTypes.STRING(100), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'PostActivities',
    modelName: 'PostActivity',
    timestamps: true,
    updatedAt: false, // append-only 이력 테이블
    indexes: [{ fields: ['postId', 'createdAt'] }],
  }
);

export const PostActivity = PostActivityModel;
export type PostActivity = PostActivityModel;
