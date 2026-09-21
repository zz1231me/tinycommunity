import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

/** 출퇴근 설정. 한 행만 쓴다(id=1). */
class AttendancePolicyModel extends Model<
  InferAttributes<AttendancePolicyModel>,
  InferCreationAttributes<AttendancePolicyModel>
> {
  declare public id: CreationOptional<number>;
  /** 하루 기준 근무 시간(분). 오늘 얼마나 채웠는지를 이 값에 견준다. */
  declare public standardWorkMinutes: CreationOptional<number>;
  /** 필수 항목을 다 확인해야 출근이 되는지 */
  declare public requireChecklist: CreationOptional<boolean>;
  /** 출근 확인 화면 머리글 안내 문구 */
  declare public noticeText: CreationOptional<string>;
  /** 출근 시각을 이만큼(분) 앞당겨 기록한다. 0 이면 누른 시각 그대로. */
  declare public checkInGraceMinutes: CreationOptional<number>;
  declare public readonly createdAt: CreationOptional<Date>;
  declare public readonly updatedAt: CreationOptional<Date>;
}

AttendancePolicyModel.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    standardWorkMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 480 },
    requireChecklist: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    noticeText: {
      type: DataTypes.STRING(300),
      allowNull: false,
      defaultValue: '출퇴근을 기록합니다. 전체 기록은 관리자만 봅니다.',
    },
    checkInGraceMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'AttendancePolicies',
    modelName: 'AttendancePolicy',
    timestamps: true,
  }
);

export const AttendancePolicy = AttendancePolicyModel;
export type AttendancePolicy = AttendancePolicyModel;
