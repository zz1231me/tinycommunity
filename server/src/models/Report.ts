// server/src/models/Report.ts - 콘텐츠 신고 모델
import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

export type ReportTargetType = 'post' | 'comment';
export type ReportReason = 'spam' | 'abuse' | 'illegal' | 'privacy' | 'misinformation' | 'other';
export type ReportStatus = 'pending' | 'reviewed' | 'dismissed' | 'action_taken';

export class Report extends Model<InferAttributes<Report>, InferCreationAttributes<Report>> {
  declare public id: CreationOptional<number>;
  declare public targetType: ReportTargetType;
  declare public targetId: string;
  declare public reporterId: ForeignKey<string | null>;
  declare public reason: ReportReason;
  declare public description: CreationOptional<string | null>;
  declare public status: CreationOptional<ReportStatus>;
  declare public reviewedBy: CreationOptional<string | null>;
  declare public reviewedAt: CreationOptional<Date | null>;
  declare public reviewNote: CreationOptional<string | null>;
  declare public readonly createdAt: CreationOptional<Date>;
  declare public readonly updatedAt: CreationOptional<Date>;
}

Report.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    targetType: {
      type: DataTypes.ENUM('post', 'comment'),
      allowNull: false,
    },
    targetId: { type: DataTypes.STRING(50), allowNull: false },
    reporterId: { type: DataTypes.STRING(50), allowNull: true },
    reason: {
      type: DataTypes.ENUM('spam', 'abuse', 'illegal', 'privacy', 'misinformation', 'other'),
      allowNull: false,
    },
    description: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
    status: {
      type: DataTypes.ENUM('pending', 'reviewed', 'dismissed', 'action_taken'),
      allowNull: false,
      defaultValue: 'pending',
    },
    reviewedBy: { type: DataTypes.STRING(50), allowNull: true, defaultValue: null },
    reviewedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
    reviewNote: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'Reports',
    modelName: 'Report',
    timestamps: true,
    indexes: [
      { fields: ['targetType', 'targetId'] },
      { fields: ['reporterId'] },
      { fields: ['status'] },
      { fields: ['createdAt'] },
      // 동일 사용자가 같은 대상을 중복 신고하지 못하도록 unique 인덱스
      { unique: true, fields: ['reporterId', 'targetType', 'targetId'] },
    ],
  }
);
