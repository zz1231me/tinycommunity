import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

/**
 * 출퇴근 판정 기준. 한 행만 쓴다(id=1).
 *
 * 사이트 설정에 컬럼을 더 붙이지 않고 따로 둔 이유는, 이 값들이 출퇴근 기능과만
 * 관계가 있어서다. 기능을 걷어내면 이 표만 지우면 된다.
 */
class AttendancePolicyModel extends Model<
  InferAttributes<AttendancePolicyModel>,
  InferCreationAttributes<AttendancePolicyModel>
> {
  declare public id: CreationOptional<number>;
  /** HH:MM */
  declare public workStartTime: CreationOptional<string>;
  /** HH:MM */
  declare public workEndTime: CreationOptional<string>;
  /** 이 분 수까지는 지각으로 보지 않는다 */
  declare public graceMinutes: CreationOptional<number>;
  /** 필수 항목을 다 확인해야 출근이 되는지 */
  declare public requireChecklist: CreationOptional<boolean>;
  declare public readonly createdAt: CreationOptional<Date>;
  declare public readonly updatedAt: CreationOptional<Date>;
}

AttendancePolicyModel.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    workStartTime: { type: DataTypes.STRING(5), allowNull: false, defaultValue: '09:00' },
    workEndTime: { type: DataTypes.STRING(5), allowNull: false, defaultValue: '18:00' },
    graceMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 10 },
    requireChecklist: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
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
