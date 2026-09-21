// 메시지 본문은 평문으로 저장한다 (HTML 미지원, 줄바꿈만 보존).

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

class MessageModel extends Model<
  InferAttributes<MessageModel>,
  InferCreationAttributes<MessageModel>
> {
  declare public id: CreationOptional<number>;
  declare public conversationId: ForeignKey<string>;
  declare public senderId: ForeignKey<string>;
  declare public content: string;
  /** 받는 사람 기준 읽음 여부 */
  declare public isRead: CreationOptional<boolean>;
  declare public readonly createdAt: CreationOptional<Date>;
}

MessageModel.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    conversationId: {
      type: DataTypes.STRING(12),
      allowNull: false,
      references: { model: 'Conversations', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    senderId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    content: { type: DataTypes.TEXT, allowNull: false },
    isRead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'Messages',
    modelName: 'Message',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['conversationId', 'id'], name: 'idx_messages_conversation' },
      { fields: ['conversationId', 'senderId', 'isRead'], name: 'idx_messages_unread' },
    ],
  }
);

export const Message = MessageModel;
export type Message = MessageModel;
export default MessageModel;
