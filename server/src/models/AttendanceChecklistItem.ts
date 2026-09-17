import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

/** 출근할 때 확인시킬 항목. 관리자가 추가·수정한다. */
class AttendanceChecklistItemModel extends Model<
  InferAttributes<AttendanceChecklistItemModel>,
  InferCreationAttributes<AttendanceChecklistItemModel>
> {
  declare public id: CreationOptional<number>;
  declare public label: string;
  declare public description: CreationOptional<string>;
  /** 체크하지 않으면 출근이 안 되는 항목인지 */
  declare public required: CreationOptional<boolean>;
  declare public order: CreationOptional<number>;
  /** 끄면 새 출근에는 안 나오지만, 이미 찍힌 기록에는 남는다 */
  declare public isActive: CreationOptional<boolean>;
  declare public readonly createdAt: CreationOptional<Date>;
  declare public readonly updatedAt: CreationOptional<Date>;
}

AttendanceChecklistItemModel.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    label: { type: DataTypes.STRING(200), allowNull: false },
    description: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
    required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'AttendanceChecklistItems',
    modelName: 'AttendanceChecklistItem',
    timestamps: true,
    indexes: [{ fields: ['isActive', 'order'] }],
  }
);

export const AttendanceChecklistItem = AttendanceChecklistItemModel;
export type AttendanceChecklistItem = AttendanceChecklistItemModel;
