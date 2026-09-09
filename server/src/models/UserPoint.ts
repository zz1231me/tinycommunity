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
 * 사용자별 포인트 잔액.
 *
 * 원장(PointLedger)을 매번 합산하지 않고 잔액을 따로 두는 이유는 조회 때문이다.
 * 대신 잔액을 고치는 곳은 서비스 한 곳뿐이고, 반드시 원장과 같은 트랜잭션에서
 * 행 잠금을 걸고 함께 움직인다 — 그래야 동시에 여러 번 뽑아도 어긋나지 않는다.
 */
class UserPointModel extends Model<
  InferAttributes<UserPointModel>,
  InferCreationAttributes<UserPointModel>
> {
  declare public UserId: ForeignKey<string>;
  declare public balance: CreationOptional<number>;
  /** 마지막으로 출석 보너스를 받은 날 (YYYY-MM-DD, 서버 기준) */
  declare public lastAttendanceOn: CreationOptional<string | null>;
  declare public readonly createdAt: CreationOptional<Date>;
  declare public readonly updatedAt: CreationOptional<Date>;
}

UserPointModel.init(
  {
    UserId: {
      type: DataTypes.STRING(50),
      primaryKey: true,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    balance: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lastAttendanceOn: { type: DataTypes.STRING(10), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'UserPoint',
    tableName: 'user_points',
    timestamps: true,
  }
);

export const UserPoint = UserPointModel;
export default UserPointModel;
