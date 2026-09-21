// 기본값과 다르게 바꾼 기능 스위치만 저장한다. 카탈로그는 config/features.ts 에 있다.

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
  /** 마지막으로 바꾼 사람 */
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
