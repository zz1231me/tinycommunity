// server/src/models/PostActivity.ts
// 글에 일어난 일 중, 다른 테이블에 흔적이 남지 않는 것만 적는다.
//
// 이미 남는 것들:
//   - 본문·제목 수정 → PostRevision (수정 직전 스냅샷 + 수정한 사람)
//   - 첨부 교체       → PostAttachmentVersion (밀려난 파일 + 올린 사람)
// 여기서 맡는 것:
//   - 업무 상태 변경, 담당자 변경
//
// 같은 내용을 두 곳에 적지 않는다. 활동 기록 화면이 세 곳을 읽어 시간순으로 합친다.
//
// append-only: 한 번 적은 줄은 고치지 않는다.

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

/** 적히는 사건의 종류. 값이 늘어날 수 있으므로 ENUM 이 아닌 문자열이다 */
export type PostActivityKind = 'status' | 'assignee';

class PostActivityModel extends Model<
  InferAttributes<PostActivityModel>,
  InferCreationAttributes<PostActivityModel>
> {
  declare public id: CreationOptional<number>;
  declare public postId: ForeignKey<string>;
  /** 바꾼 사람. 탈퇴해도 기록은 남으므로 null 을 허용한다 */
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
    // 한 글의 기록을 시간순으로 읽는 것이 유일한 조회 형태다
    indexes: [{ fields: ['postId', 'createdAt'] }],
  }
);

export const PostActivity = PostActivityModel;
export type PostActivity = PostActivityModel;
