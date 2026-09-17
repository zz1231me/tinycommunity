// server/src/models/NotificationSetting.ts
// 사용자가 끈 알림 종류만 저장한다.
//
// 기능 스위치(FeatureFlag)와 같은 방식이다 — 종류 목록은 코드가 들고 있고
// 여기에는 "기본값과 다르게 바꾼 것" 만 남는다. 종류를 추가해도 기존 사용자
// 행을 만들어 줄 필요가 없다.

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
