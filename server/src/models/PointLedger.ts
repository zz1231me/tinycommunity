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
 * 포인트 증감 기록. append-only이며 합계가 잔액(UserPoint)과 항상 같아야 한다.
 * 로또 꽝(amount 0)도 한 줄 남긴다. 하루 뽑기 횟수를 이 표에서 센다.
 */
/**
 * 포인트가 움직인 이유.
 * 하루 한도를 'lottery' 줄 수로 세므로 참가비는 'lottery_cost'로 분리한다.
 * 대결은 duel_stake/duel_win/duel_refund로 나눠 적는다.
 */
export type PointReason =
  | 'lottery'
  | 'lottery_cost'
  | 'attendance'
  | 'admin'
  | 'duel_stake'
  | 'duel_win'
  | 'duel_refund'
  | 'attack_cost'
  | 'defend_cost'
  /** 포인트 절반 날리기를 당해 사라진 몫. 누가 걸었는지는 memo 에 적지 않는다(익명). */
  | 'point_attack_loss';

class PointLedgerModel extends Model<
  InferAttributes<PointLedgerModel>,
  InferCreationAttributes<PointLedgerModel>
> {
  declare public id: CreationOptional<number>;
  declare public UserId: ForeignKey<string>;
  /** 증감량. 로또 꽝은 0, 관리자 회수는 음수일 수 있다 */
  declare public amount: number;
  declare public reason: PointReason;
  /** 이 줄을 반영한 뒤의 잔액 */
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
      // 하루 뽑기 횟수 집계와 적립 내역 조회가 모두 이 인덱스를 쓴다.
      { fields: ['UserId', 'createdAt'] },
    ],
  }
);

export const PointLedger = PointLedgerModel;
export default PointLedgerModel;
