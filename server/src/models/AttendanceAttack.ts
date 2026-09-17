import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

/**
 * 퇴근 공격 한 번.
 *
 * 이 행이 살아 있는 동안(expiresAt 전, defendedAt 이 비어 있음) 대상의 화면에서는
 * 퇴근 버튼이 잠겨 보인다. 그뿐이다 — 서버의 퇴근 기록은 이 표를 쳐다보지도 않는다.
 * 눌린 시각은 언제나 그대로 기록된다.
 *
 * 누가 누구를 공격했는지가 이 표에 남는다. 장난이라도 사람 사이의 일이라,
 * "누가 그랬는지 모르겠다" 가 되면 장난이 아니라 괴롭힘이 된다.
 */
class AttendanceAttackModel extends Model<
  InferAttributes<AttendanceAttackModel>,
  InferCreationAttributes<AttendanceAttackModel>
> {
  declare public id: CreationOptional<number>;
  /** 공격한 사람 */
  declare public attackerId: ForeignKey<string>;
  /** 공격받은 사람 */
  declare public targetId: ForeignKey<string>;
  /** 근무일 (YYYY-MM-DD, 서버 기준) — 하루 몇 번 썼는지를 센다 */
  declare public workDate: string;
  /** 이 시각이 지나면 잠금이 풀린다 */
  declare public expiresAt: Date;
  /** 방어권을 써서 일찍 풀었으면 그 시각 */
  declare public defendedAt: CreationOptional<Date | null>;
  declare public readonly createdAt: CreationOptional<Date>;
  declare public readonly updatedAt: CreationOptional<Date>;
}

AttendanceAttackModel.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    attackerId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    targetId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    workDate: { type: DataTypes.STRING(10), allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    defendedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'AttendanceAttack',
    tableName: 'attendance_attacks',
    timestamps: true,
    indexes: [
      // "나에게 지금 걸린 공격이 있나" — 출근 화면이 열릴 때마다 묻는다
      { fields: ['targetId', 'expiresAt'] },
      // "오늘 내가 몇 번 썼나"
      { fields: ['attackerId', 'workDate'] },
    ],
  }
);

export const AttendanceAttack = AttendanceAttackModel;
export default AttendanceAttackModel;
