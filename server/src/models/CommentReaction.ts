import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

// 댓글 이모지 리액션 — 한 사용자가 한 댓글에 여러 이모지를 달 수 있고(각 이모지 1회),
// (CommentId, UserId, emoji) 유니크로 중복 방지. CommentLike(단일 좋아요)와 별개 테이블.
export interface CommentReactionInstance
  extends Model<
    InferAttributes<CommentReactionInstance>,
    InferCreationAttributes<CommentReactionInstance>
  > {
  id: CreationOptional<number>;
  CommentId: ForeignKey<number>;
  UserId: ForeignKey<string>;
  emoji: string;
  createdAt: CreationOptional<Date>;
}

class CommentReactionModel
  extends Model<
    InferAttributes<CommentReactionInstance>,
    InferCreationAttributes<CommentReactionInstance>
  >
  implements CommentReactionInstance
{
  declare public id: CreationOptional<number>;
  declare public CommentId: ForeignKey<number>;
  declare public UserId: ForeignKey<string>;
  declare public emoji: string;
  declare public readonly createdAt: Date;
}

CommentReactionModel.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    CommentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'comments', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    UserId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    emoji: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'CommentReactions',
    modelName: 'CommentReaction',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['CommentId', 'UserId', 'emoji'] },
      { fields: ['CommentId'] },
      { fields: ['UserId'] },
    ],
  }
);

export const CommentReaction = CommentReactionModel;
export type CommentReaction = CommentReactionModel;
