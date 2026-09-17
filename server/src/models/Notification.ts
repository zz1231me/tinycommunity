import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

// 종류 목록은 config/notificationKinds 가 단일 출처다.
// 여기서 다시 나열하면 둘이 어긋난 채로 조용히 굴러간다.
import type { NotificationKind } from '../config/notificationKinds';

export type NotificationType = NotificationKind;

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
    // ⚠️ ENUM 이 아니라 문자열이다.
    //    이 프로젝트는 sync({alter:false}) 로 뜨기 때문에 ENUM 값을 새로 추가해도
    //    이미 만들어진 테이블에는 반영되지 않는다(MySQL/PostgreSQL). 종류가 늘어날
    //    때마다 수동 마이그레이션이 필요해지므로 문자열로 두고 값 검증은 코드가 한다.
    //    기존 설치의 ENUM 컬럼은 bootstrap 의 widenGrowingEnums 가 넓힌다.
    type: {
      type: DataTypes.STRING(20),
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
