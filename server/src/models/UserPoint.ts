import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

/** 사용자별 포인트 잔액. 원장과 같은 트랜잭션에서 행 잠금을 걸고 함께 고쳐야 한다. */
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
    // 랭킹이 잔액으로 정렬하므로 인덱스가 필요하다.
    indexes: [{ fields: ['balance'], name: 'idx_user_points_balance' }],
  }
);

export const UserPoint = UserPointModel;
export default UserPointModel;
