import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

export type NotificationType = 'COMMENT' | 'LIKE' | 'MENTION' | 'SYSTEM';

export interface NotificationInstance extends Model<
  InferAttributes<NotificationInstance>,
  InferCreationAttributes<NotificationInstance>
> {
  id: CreationOptional<number>;
  userId: ForeignKey<string>; // 수신자
  type: NotificationType;
  message: string;
  link: CreationOptional<string | null>;
  relatedId: CreationOptional<string | null>; // PostId 등 관련 리소스 ID
  isRead: CreationOptional<boolean>;
  createdAt: CreationOptional<Date>;
}

class NotificationModel
  extends Model<
    InferAttributes<NotificationInstance>,
    InferCreationAttributes<NotificationInstance>
  >
  implements NotificationInstance
{
  declare public id: CreationOptional<number>;
  declare public userId: ForeignKey<string>;
  declare public type: NotificationType;
  declare public message: string;
  declare public link: CreationOptional<string | null>;
  declare public relatedId: CreationOptional<string | null>;
  declare public isRead: CreationOptional<boolean>;
  declare public readonly createdAt: Date;
}

NotificationModel.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
      comment: '알림 수신자 ID',
    },
    type: {
      type: DataTypes.ENUM('COMMENT', 'LIKE', 'MENTION', 'SYSTEM'),
      allowNull: false,
      comment: '알림 유형',
    },
    message: {
      type: DataTypes.STRING(500),
      allowNull: false,
      comment: '알림 메시지',
    },
    link: {
      type: DataTypes.STRING(500),
      allowNull: true,
      defaultValue: null,
      comment: '이동 링크',
    },
    relatedId: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
      comment: '관련 리소스 ID (PostId 등)',
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '읽음 여부',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'Notifications',
    modelName: 'Notification',
    timestamps: true,
    updatedAt: false,
    indexes: [{ fields: ['userId', 'isRead'] }, { fields: ['userId', 'createdAt'] }],
  }
);

export const Notification = NotificationModel;
export type Notification = NotificationModel;
