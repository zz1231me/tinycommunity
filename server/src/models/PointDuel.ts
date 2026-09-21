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
 * 건 포인트는 신청 즉시 에스크로로 잡히므로, waiting 인 행은 반드시 정산이나 환불로 닫아야 한다.
 * challengerHand 는 상대가 답하기 전까지 내보내지 않는다(서비스의 view() 에서만 가린다).
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
  /** 이 시각이 지나면 무효. 걸어 둔 포인트를 돌려준다. */
  declare public expiresAt: Date;
  declare public settledAt: CreationOptional<Date | null>;
  /** 신청하며 남긴 말 */
  declare public message: CreationOptional<string | null>;
  /** 이긴 사람이 진 사람에게 남긴 한마디. 한 판에 한 번. */
  declare public taunt: CreationOptional<string | null>;
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
    // 길이 상한은 config/duel 의 DUEL_MESSAGE_MAX·DUEL_TAUNT_MAX 와 같아야 한다.
    message: { type: DataTypes.STRING(40), allowNull: true },
    taunt: { type: DataTypes.STRING(30), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'PointDuel',
    tableName: 'point_duels',
    timestamps: true,
    indexes: [
      // 받은 대결과 건 대결, 두 방향으로 찾는다
      { fields: ['opponentId', 'status'] },
      { fields: ['challengerId', 'status'] },
      // 만료된 판을 걷어 낼 때 쓴다
      { fields: ['status', 'expiresAt'] },
    ],
  }
);

export const PointDuel = PointDuelModel;
export default PointDuelModel;
