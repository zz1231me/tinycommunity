// server/src/models/Announcement.ts — 공지사항. 게시 기간(startAt~endAt) 동안 사용자에게 노출.
import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/sequelize';

export interface AnnouncementAttributes {
  id: string;
  title: string;
  content: string;
  startAt: Date; // 게시 시작
  endAt: Date | null; // 게시 종료(null = 무기한)
  isActive: boolean; // 관리자 on/off (기간과 별개로 강제 비활성)
  isPinned: boolean; // 상단 고정(먼저 노출)
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AnnouncementCreationAttributes extends Optional<
  AnnouncementAttributes,
  'id' | 'endAt' | 'isActive' | 'isPinned' | 'startAt'
> {}

export class Announcement
  extends Model<AnnouncementAttributes, AnnouncementCreationAttributes>
  implements AnnouncementAttributes
{
  declare public id: string;
  declare public title: string;
  declare public content: string;
  declare public startAt: Date;
  declare public endAt: Date | null;
  declare public isActive: boolean;
  declare public isPinned: boolean;
  declare public createdBy: string;
  declare public readonly createdAt: Date;
  declare public readonly updatedAt: Date;
}

Announcement.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    title: { type: DataTypes.STRING(200), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    startAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    endAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isPinned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdBy: { type: DataTypes.STRING(50), allowNull: false },
  },
  {
    sequelize,
    tableName: 'announcements',
    modelName: 'Announcement',
    timestamps: true,
    indexes: [{ fields: ['isActive', 'startAt', 'endAt'] }],
  }
);

export default Announcement;
