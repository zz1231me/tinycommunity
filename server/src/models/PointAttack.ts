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
 * 포인트 절반 날리기 한 번의 기록. 던진 순간 남으며 실패한 것도 남는다.
 *
 * attackerId 는 관리자 추적용이다. 당한 사람에게는 어떤 화면·알림에서도 내보내지 않는다 —
 * 익명이 이 기능의 규칙이므로, 이 칸을 응답에 실으려면 먼저 그 규칙부터 바꿔야 한다.
 */
class PointAttackModel extends Model<
  InferAttributes<PointAttackModel>,
  InferCreationAttributes<PointAttackModel>
> {
  declare public id: CreationOptional<number>;
  /** 던진 사람. 당한 쪽에는 절대 노출하지 않는다. */
  declare public attackerId: ForeignKey<string>;
  declare public targetId: ForeignKey<string>;
  /** 하루 횟수를 세는 기준일 (YYYY-MM-DD, 서버 기준) */
  declare public workDate: string;
  /** 던지며 낸 값. 실패해도 낸다. */
  declare public cost: number;
  declare public succeeded: boolean;
  /** 사라진 포인트. 실패하면 0. */
  declare public amountLost: CreationOptional<number>;
  declare public readonly createdAt: CreationOptional<Date>;
  declare public readonly updatedAt: CreationOptional<Date>;
}

PointAttackModel.init(
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
    cost: { type: DataTypes.INTEGER, allowNull: false },
    succeeded: { type: DataTypes.BOOLEAN, allowNull: false },
    amountLost: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'PointAttack',
    tableName: 'point_attacks',
    timestamps: true,
    indexes: [
      // 하루 횟수를 셀 때 쓴다
      { fields: ['attackerId', 'workDate'] },
      { fields: ['targetId'] },
    ],
  }
);

export const PointAttack = PointAttackModel;
export default PointAttackModel;
