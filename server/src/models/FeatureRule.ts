// 역할·사람별 기능 예외. 사이트 전체 스위치(FeatureFlag)가 켜져 있을 때만 뜻이 있다.
//
// 판정 순서(featureFlagService.resolveFor):
//   사이트 전체가 꺼짐 → 꺼짐
//   사람 예외가 있음   → 그 값
//   역할 규칙이 있음   → 그 값
//   아무것도 없음      → 켜짐
// 기본값과 같은 '규칙 없음' 은 행을 지워 나타낸다.

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

export type FeatureRuleScope = 'role' | 'user';

class FeatureRuleModel extends Model<
  InferAttributes<FeatureRuleModel>,
  InferCreationAttributes<FeatureRuleModel>
> {
  declare public id: CreationOptional<number>;
  declare public featureKey: string;
  declare public scope: FeatureRuleScope;
  /** scope 가 role 이면 역할 id, user 면 사용자 id */
  declare public targetId: string;
  declare public enabled: boolean;
  declare public updatedBy: CreationOptional<string | null>;
  declare public readonly createdAt: CreationOptional<Date>;
  declare public readonly updatedAt: CreationOptional<Date>;
}

FeatureRuleModel.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    featureKey: { type: DataTypes.STRING(64), allowNull: false },
    // ENUM 이 아니라 문자열이다. sync({alter:false}) 라 ENUM 값 추가가 반영되지 않는다.
    scope: { type: DataTypes.STRING(10), allowNull: false },
    // 역할·사용자가 지워져도 규칙 때문에 막히지 않게 FK 를 걸지 않는다. 지울 때 함께 정리한다.
    targetId: { type: DataTypes.STRING(50), allowNull: false },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false },
    updatedBy: { type: DataTypes.STRING(50), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'FeatureRules',
    modelName: 'FeatureRule',
    timestamps: true,
    indexes: [{ unique: true, fields: ['featureKey', 'scope', 'targetId'] }],
  }
);

export const FeatureRule = FeatureRuleModel;
export type FeatureRule = FeatureRuleModel;
export default FeatureRuleModel;
