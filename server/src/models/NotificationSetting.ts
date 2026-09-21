// 기본값과 다르게 바꾼 알림 설정만 저장한다. 종류 목록은 코드가 들고 있다.

import { DataTypes, Model, InferAttributes, InferCreationAttributes, ForeignKey } from 'sequelize';
import { sequelize } from '../config/sequelize';

class NotificationSettingModel extends Model<
  InferAttributes<NotificationSettingModel>,
  InferCreationAttributes<NotificationSettingModel>
> {
  declare public userId: ForeignKey<string>;
  declare public type: string;
  declare public enabled: boolean;
}

NotificationSettingModel.init(
  {
    userId: {
      type: DataTypes.STRING(50),
      primaryKey: true,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    type: { type: DataTypes.STRING(20), primaryKey: true, allowNull: false },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false },
  },
  {
    sequelize,
    tableName: 'NotificationSettings',
    modelName: 'NotificationSetting',
    timestamps: false,
  }
);

export const NotificationSetting = NotificationSettingModel;
export type NotificationSetting = NotificationSettingModel;
export default NotificationSettingModel;
