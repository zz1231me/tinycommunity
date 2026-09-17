// server/src/models/Message.ts
// 메시지 한 통.
//
// 내용은 평문으로 저장한다. 메시지에 서식이 필요한 경우는 드물고, HTML 을 받는
// 순간 정화기·에디터·렌더러가 한 벌씩 더 붙는다. 줄바꿈만 보존하고 링크는
// 표시 단계에서 인식한다.

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
  /** 받는 사람이 읽었는지 — 보낸 사람 기준이 아니라 상대 기준이다 */
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
      // 대화를 열면 최신 메시지부터 커서로 거슬러 올라간다
      { fields: ['conversationId', 'id'], name: 'idx_messages_conversation' },
      // 안 읽은 수 집계 — "이 대화에서 내가 보내지 않았고 아직 안 읽은 것"
      { fields: ['conversationId', 'senderId', 'isRead'], name: 'idx_messages_unread' },
    ],
  }
);

export const Message = MessageModel;
export type Message = MessageModel;
export default MessageModel;
