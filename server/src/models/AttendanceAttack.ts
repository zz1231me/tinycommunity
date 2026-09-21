import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

/** 퇴근 공격 기록. 대상 화면의 퇴근 버튼만 잠그며 서버의 퇴근 기록에는 영향을 주지 않는다. */
class AttendanceAttackModel extends Model<
  InferAttributes<AttendanceAttackModel>,
  InferCreationAttributes<AttendanceAttackModel>
> {
  declare public id: CreationOptional<number>;
  declare public attackerId: ForeignKey<string>;
  declare public targetId: ForeignKey<string>;
  /** 근무일 (YYYY-MM-DD, 서버 기준) */
  declare public workDate: string;
  /** 'chaos'(버튼이 도망다닌다) · 'hide'(버튼이 잠깐 사라진다) · 'quiz'(누르면 계산 문제) */
  declare public kind: CreationOptional<string>;
  /** 쪽지 공격 제거로 더 이상 쓰지 않는다. 항상 null 이 들어간다. */
  declare public message: CreationOptional<string | null>;
  /** 공격이 시작되는 시각. 공격이 쌓이면 앞 공격이 끝난 뒤 시작한다. 이 칸 이전 행은 null 이고 createdAt 이 시작이다. */
  declare public startsAt: CreationOptional<Date | null>;
  /** 이 시각이 지나면 방해가 끝난다 */
  declare public expiresAt: Date;
  /** 방어권을 써서 일찍 풀었으면 그 시각 */
  declare public defendedAt: CreationOptional<Date | null>;
  /** 쪽지 확인 시각. 더 이상 쓰지 않는다. */
  declare public seenAt: CreationOptional<Date | null>;
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
    kind: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'chaos' },
    message: { type: DataTypes.STRING(60), allowNull: true },
    // 기존 DB 에는 기동 시 ensureAllModelColumns 가 칸을 더한다(기존 행은 null)
    startsAt: { type: DataTypes.DATE, allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    defendedAt: { type: DataTypes.DATE, allowNull: true },
    seenAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'AttendanceAttack',
    tableName: 'attendance_attacks',
    timestamps: true,
    indexes: [
      // 대상에게 지금 걸린 공격 조회
      { fields: ['targetId', 'expiresAt'] },
      // 공격자의 하루 사용 횟수 집계
      { fields: ['attackerId', 'workDate'] },
    ],
  }
);

export const AttendanceAttack = AttendanceAttackModel;
export default AttendanceAttackModel;
