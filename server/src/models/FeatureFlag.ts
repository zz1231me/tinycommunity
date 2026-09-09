// server/src/models/FeatureFlag.ts
// 관리자가 바꾼 기능 스위치 값만 저장한다.
// 카탈로그(어떤 기능이 있는지)는 config/features.ts 가 들고 있고, 여기에는
// "기본값과 다르게 바꾼 것" 만 남는다 — 기능을 추가해도 마이그레이션이 필요 없다.

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

class FeatureFlagModel extends Model<
  InferAttributes<FeatureFlagModel>,
  InferCreationAttributes<FeatureFlagModel>
> {
  declare public key: string;
  declare public enabled: boolean;
  /** 누가 마지막으로 바꿨는지 — 기능이 갑자기 사라졌을 때 추적용 */
  declare public updatedBy: CreationOptional<string | null>;
  declare public readonly createdAt: CreationOptional<Date>;
  declare public readonly updatedAt: CreationOptional<Date>;
}

FeatureFlagModel.init(
  {
    key: { type: DataTypes.STRING(64), primaryKey: true, allowNull: false },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false },
    updatedBy: { type: DataTypes.STRING(50), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'FeatureFlags',
    modelName: 'FeatureFlag',
    timestamps: true,
  }
);

export const FeatureFlag = FeatureFlagModel;
export type FeatureFlag = FeatureFlagModel;
export default FeatureFlagModel;
