// server/src/models/TempShare.ts — 임시 파일 공유. 업로드 후 짧은 기간(기본 15분) 링크로 공유,
// 만료되면 스케줄러가 디스크 파일 + 이 레코드를 삭제한다. 다운로드 링크는 token(=id)만으로 공개 접근.
import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/sequelize';

export interface TempShareAttributes {
  id: string; // = 공유 토큰 (UUID)
  originalName: string;
  storedName: string; // uploads/temp/ 내 실제 파일명
  size: number;
  mimetype: string;
  uploadedBy: string;
  expiresAt: Date;
  createdAt?: Date;
}

export interface TempShareCreationAttributes extends Optional<TempShareAttributes, 'id'> {}

export class TempShare
  extends Model<TempShareAttributes, TempShareCreationAttributes>
  implements TempShareAttributes
{
  declare public id: string;
  declare public originalName: string;
  declare public storedName: string;
  declare public size: number;
  declare public mimetype: string;
  declare public uploadedBy: string;
  declare public expiresAt: Date;
  declare public readonly createdAt: Date;
}

TempShare.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    originalName: { type: DataTypes.STRING(255), allowNull: false },
    storedName: { type: DataTypes.STRING(255), allowNull: false },
    size: { type: DataTypes.INTEGER, allowNull: false },
    mimetype: { type: DataTypes.STRING(150), allowNull: false, defaultValue: 'application/octet-stream' },
    uploadedBy: { type: DataTypes.STRING(50), allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'temp_shares',
    modelName: 'TempShare',
    timestamps: true,
    updatedAt: false,
    indexes: [{ fields: ['expiresAt'] }],
  }
);

export default TempShare;
