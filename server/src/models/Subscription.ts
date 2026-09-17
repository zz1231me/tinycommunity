// server/src/models/Subscription.ts
// 게시판 구독 / 사용자 팔로우.
//
// 둘을 한 테이블에 두는 이유: "새 글이 올라오면 알려 줘" 라는 같은 요구이고,
// 새 글 하나가 올라올 때 알릴 사람을 찾는 질의도 하나로 끝난다.
// 나누면 글마다 두 번 조회하고 결과를 합쳐야 한다.

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

export type SubscriptionTargetType = 'board' | 'user';

class SubscriptionModel extends Model<
  InferAttributes<SubscriptionModel>,
  InferCreationAttributes<SubscriptionModel>
> {
  declare public id: CreationOptional<number>;
  declare public userId: ForeignKey<string>;
  declare public targetType: SubscriptionTargetType;
  /** board 면 boardId, user 면 대상 사용자 id */
  declare public targetId: string;
  declare public readonly createdAt: CreationOptional<Date>;
}

SubscriptionModel.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    // 대상은 게시판이거나 사람이라 FK 를 걸 수 없다. 사라진 대상은 조회 시 걸러낸다.
    targetType: { type: DataTypes.STRING(10), allowNull: false },
    targetId: { type: DataTypes.STRING(50), allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'Subscriptions',
    modelName: 'Subscription',
    timestamps: true,
    updatedAt: false,
    indexes: [
      // 같은 대상을 두 번 구독할 수 없다 — 토글이 곧 유일성이다
      {
        unique: true,
        fields: ['userId', 'targetType', 'targetId'],
        name: 'idx_subscriptions_unique',
      },
      // 새 글 하나로 알릴 사람을 찾는 경로
      { fields: ['targetType', 'targetId'], name: 'idx_subscriptions_target' },
    ],
  }
);

export const Subscription = SubscriptionModel;
export type Subscription = SubscriptionModel;
export default SubscriptionModel;
