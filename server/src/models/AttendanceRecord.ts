import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

/** 출근 시점에 찍어 둔 확인 항목. 항목이 나중에 바뀌어도 그날 확인한 내용은 그대로 남는다. */
export interface ChecklistSnapshotEntry {
  itemId: number;
  label: string;
  required: boolean;
  checked: boolean;
}

class AttendanceRecordModel extends Model<
  InferAttributes<AttendanceRecordModel>,
  InferCreationAttributes<AttendanceRecordModel>
> {
  declare public id: CreationOptional<number>;
  declare public UserId: ForeignKey<string>;
  /** 근무일 (YYYY-MM-DD, 서버 기준). 사람마다 하루 한 건이다. */
  declare public workDate: string;
  declare public checkInAt: Date;
  declare public checkOutAt: CreationOptional<Date | null>;
  /** 퇴근을 찍은 뒤 계산한 재실 시간(분) */
  declare public workMinutes: CreationOptional<number | null>;
  declare public note: CreationOptional<string>;
  /** ChecklistSnapshotEntry[] 를 JSON 문자열로 담는다 */
  declare public checklist: CreationOptional<string>;
  declare public readonly createdAt: CreationOptional<Date>;
  declare public readonly updatedAt: CreationOptional<Date>;
}

AttendanceRecordModel.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    UserId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    workDate: { type: DataTypes.STRING(10), allowNull: false },
    checkInAt: { type: DataTypes.DATE, allowNull: false },
    checkOutAt: { type: DataTypes.DATE, allowNull: true },
    workMinutes: { type: DataTypes.INTEGER, allowNull: true },
    note: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
    checklist: { type: DataTypes.TEXT, allowNull: false, defaultValue: '[]' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'AttendanceRecords',
    modelName: 'AttendanceRecord',
    timestamps: true,
    indexes: [
      // 하루 두 번 출근이 찍히는 것을 DB 에서 막는다. 동시 요청은 앱 검사만으로는 못 막는다.
      { unique: true, fields: ['UserId', 'workDate'], name: 'attendance_user_date' },
      { fields: ['workDate'] },
    ],
  }
);

export const AttendanceRecord = AttendanceRecordModel;
export type AttendanceRecord = AttendanceRecordModel;
