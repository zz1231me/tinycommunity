// 두 사람 사이의 대화. 참가자는 항상 userAId < userBId 로 정렬해 저장하고 pairKey 로 유일성을 건다.

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from 'sequelize';
import { sequelize } from '../config/sequelize';
import { generateRandomId } from '../utils/generateId';

/** 두 사용자로 대화의 유일 키를 만든다. 순서가 달라도 같은 키가 나와야 한다. */
export function buildPairKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

class ConversationModel extends Model<
  InferAttributes<ConversationModel>,
  InferCreationAttributes<ConversationModel>
> {
  declare public id: CreationOptional<string>;
  /** 항상 userAId < userBId */
  declare public userAId: string;
  declare public userBId: string;
  declare public pairKey: string;
  declare public lastMessageAt: CreationOptional<Date | null>;
  /** 목록에 보여 줄 마지막 메시지 미리보기 (평문 일부) */
  declare public lastMessagePreview: CreationOptional<string | null>;
  declare public lastSenderId: CreationOptional<string | null>;
  /** 각자 목록에서 숨겼는지. 한쪽이 숨겨도 상대 대화는 남고, 새 메시지가 오면 다시 나타난다. */
  declare public hiddenByA: CreationOptional<boolean>;
  declare public hiddenByB: CreationOptional<boolean>;
  declare public readonly createdAt: CreationOptional<Date>;
  declare public readonly updatedAt: CreationOptional<Date>;
}

ConversationModel.init(
  {
    id: {
      type: DataTypes.STRING(12),
      primaryKey: true,
      allowNull: false,
      defaultValue: () => generateRandomId(12),
    },
    userAId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    userBId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    pairKey: { type: DataTypes.STRING(101), allowNull: false },
    lastMessageAt: { type: DataTypes.DATE, allowNull: true },
    lastMessagePreview: { type: DataTypes.STRING(200), allowNull: true },
    lastSenderId: { type: DataTypes.STRING(50), allowNull: true },
    hiddenByA: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    hiddenByB: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'Conversations',
    modelName: 'Conversation',
    timestamps: true,
    indexes: [
      // 같은 두 사람의 대화는 하나뿐이다
      { unique: true, fields: ['pairKey'], name: 'idx_conversations_pair' },
      // 내 대화 목록은 최근 메시지 순으로 읽는다
      { fields: ['userAId', 'lastMessageAt'], name: 'idx_conversations_a' },
      { fields: ['userBId', 'lastMessageAt'], name: 'idx_conversations_b' },
    ],
  }
);

export const Conversation = ConversationModel;
export type Conversation = ConversationModel;
export default ConversationModel;
