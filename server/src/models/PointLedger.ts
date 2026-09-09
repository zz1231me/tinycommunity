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
 * 포인트가 오간 기록. append-only 로 추가만 하고 고치지 않는다.
 *
 * 잔액(UserPoint)과 별도로 증감 내역을 남겨 잔액의 근거를 추적한다.
 * 잔액은 이 기록들의 합과 항상 같아야 한다(테스트로 고정).
 *
 * 로또는 꽝(amount 0)도 한 줄 남긴다 — 하루 뽑기 횟수를 이 표에서 세기 때문이다.
 */
/**
 * 포인트가 움직인 이유.
 *
 * 하루 한도를 'lottery' 줄 수로 세므로 참가비는 'lottery_cost' 로 분리한다.
 * 같은 이름으로 적으면 한 번 뽑을 때 두 줄이 쌓여 한도가 절반이 된다.
 */
export type PointReason = 'lottery' | 'lottery_cost' | 'attendance' | 'admin';

class PointLedgerModel extends Model<
  InferAttributes<PointLedgerModel>,
  InferCreationAttributes<PointLedgerModel>
> {
  declare public id: CreationOptional<number>;
  declare public UserId: ForeignKey<string>;
  /** 증감량. 로또 꽝은 0, 관리자 회수는 음수일 수 있다 */
  declare public amount: number;
  declare public reason: PointReason;
  /** 이 줄을 반영한 뒤의 잔액 — 나중에 잔액이 어긋나면 어디서부터인지 짚을 수 있다 */
  declare public balanceAfter: number;
  /** 사람이 읽을 설명 (예: '1500p 당첨', '출석 보너스') */
  declare public memo: CreationOptional<string | null>;
  declare public readonly createdAt: CreationOptional<Date>;
  declare public readonly updatedAt: CreationOptional<Date>;
}

PointLedgerModel.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    UserId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    amount: { type: DataTypes.INTEGER, allowNull: false },
    reason: { type: DataTypes.STRING(20), allowNull: false },
    balanceAfter: { type: DataTypes.INTEGER, allowNull: false },
    memo: { type: DataTypes.STRING(200), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'PointLedger',
    tableName: 'point_ledgers',
    timestamps: true,
    indexes: [
      // "이 사람이 오늘 몇 번 뽑았나" 와 "내 적립 내역" 이 둘 다 이 인덱스를 탄다
      { fields: ['UserId', 'createdAt'] },
    ],
  }
);

export const PointLedger = PointLedgerModel;
export default PointLedgerModel;
