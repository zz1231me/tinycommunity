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
    size: {
      // BIGINT 다. 부호 있는 INTEGER 의 상한은 2,147,483,647 바이트(2047.99MiB)라
      // 2GB 파일이 1바이트 차이로 넘친다 — MySQL·PostgreSQL 에서는 저장이 실패하고
      // 느슨한 설정에서는 조용히 잘린 값이 남는다.
      type: DataTypes.BIGINT,
      allowNull: false,

      // mysql2·pg 드라이버는 BIGINT 를 문자열로 돌려준다(정밀도 보존). 파일 크기는
      // 2^53 에 한참 못 미치므로 숫자로 바꿔 내보낸다 — 쓰는 쪽이 전부 숫자로 다룬다.
      get(this: { getDataValue: (k: 'size') => unknown }): number {
        const raw = this.getDataValue('size');
        return raw === null || raw === undefined ? 0 : Number(raw);
      },
    },
    mimetype: {
      type: DataTypes.STRING(150),
      allowNull: false,
      defaultValue: 'application/octet-stream',
    },
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
