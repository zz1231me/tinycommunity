import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

/** 낼 수 있는 손 */
export type DuelHand = 'rock' | 'paper' | 'scissors';

/**
 * 대결의 상태.
 *  · waiting  — 신청했고 상대의 답을 기다린다 (건 포인트는 이미 맡겨져 있다)
 *  · done     — 승부가 났고 정산까지 끝났다
 *  · canceled — 거절·취소·시간 초과. 맡긴 포인트는 돌려주었다
 */
export type DuelStatus = 'waiting' | 'done' | 'canceled';

/** 누가 이겼는가 */
export type DuelResult = 'challenger' | 'opponent' | 'draw';

/**
 * 포인트를 걸고 하는 가위바위보 한 판.
 *
 * 건 포인트는 신청하는 순간 신청자에게서 빠져 이 판에 맡겨진다(에스크로).
 * 맡기지 않고 결과가 날 때 받으려 하면, 그 사이에 그 포인트를 다른 데 써 버린
 * 사람에게서는 받아낼 수 없다 — 이미 진 판의 빚이 남는다.
 *
 * 그래서 이 표의 행 하나는 "지금 어딘가에 묶여 있는 포인트" 를 뜻한다.
 * waiting 으로 남은 판은 반드시 어느 쪽으로든 닫혀야 하고(정산 또는 환불),
 * 닫히지 않은 채 시간이 지난 판은 만료로 걷어 환불한다.
 *
 * 신청자의 손은 상대가 답하기 전까지 절대 밖으로 나가면 안 된다 —
 * 보이면 그냥 이기는 손을 내면 되므로 대결이 아니게 된다. 가리는 일은
 * 서비스의 view() 한 곳에서만 한다.
 */
class PointDuelModel extends Model<
  InferAttributes<PointDuelModel>,
  InferCreationAttributes<PointDuelModel>
> {
  declare public id: CreationOptional<number>;
  /** 신청한 사람 */
  declare public challengerId: ForeignKey<string>;
  /** 받은 사람 */
  declare public opponentId: ForeignKey<string>;
  /** 한 사람이 거는 포인트. 이긴 쪽이 2배를 가져간다. */
  declare public stake: number;
  declare public challengerHand: DuelHand;
  /** 상대가 아직 안 냈으면 null */
  declare public opponentHand: CreationOptional<DuelHand | null>;
  declare public status: CreationOptional<DuelStatus>;
  declare public result: CreationOptional<DuelResult | null>;
  /** 이 시각이 지나면 무효 — 걸어 둔 포인트를 돌려준다 */
  declare public expiresAt: Date;
  declare public settledAt: CreationOptional<Date | null>;
  declare public readonly createdAt: CreationOptional<Date>;
  declare public readonly updatedAt: CreationOptional<Date>;
}

PointDuelModel.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    challengerId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    opponentId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    stake: { type: DataTypes.INTEGER, allowNull: false },
    challengerHand: { type: DataTypes.STRING(10), allowNull: false },
    opponentHand: { type: DataTypes.STRING(10), allowNull: true },
    status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'waiting' },
    result: { type: DataTypes.STRING(12), allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    settledAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'PointDuel',
    tableName: 'point_duels',
    timestamps: true,
    indexes: [
      // "나에게 온 대결" 과 "내가 건 대결" — 목록을 열 때마다 두 방향으로 찾는다
      { fields: ['opponentId', 'status'] },
      { fields: ['challengerId', 'status'] },
      // 만료된 판을 걷어 낼 때 쓴다
      { fields: ['status', 'expiresAt'] },
    ],
  }
);

export const PointDuel = PointDuelModel;
export default PointDuelModel;
