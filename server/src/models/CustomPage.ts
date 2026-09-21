// 관리자 커스텀 HTML 페이지. 렌더가 sandbox iframe 이라 html 은 새니타이즈 없이 원문 그대로 보관한다.

import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/sequelize';

export interface CustomPageAttributes {
  id: string;
  slug: string; // URL 식별자 (예: 'guide')
  title: string;
  html: string; // 원문 HTML. 번들/URL 페이지면 '' 유지.
  // 번들 페이지의 정적 파일 디렉터리(uploads 기준 상대경로). null 이면 단일 HTML 페이지.
  bundlePath: string | null;
  entryFile: string; // 번들 진입 파일 (기본 index.html)
  // 외부 URL 임베드. 값이 있으면 html/번들보다 우선하며 http(s)만 허용한다.
  externalUrl: string | null;
  isPublished: boolean;
  order: number; // 사이드바 정렬
  createdBy: string; // 작성/수정 관리자 ID
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CustomPageCreationAttributes extends Optional<
  CustomPageAttributes,
  'id' | 'isPublished' | 'order' | 'html' | 'bundlePath' | 'entryFile' | 'externalUrl'
> {}

export class CustomPage
  extends Model<CustomPageAttributes, CustomPageCreationAttributes>
  implements CustomPageAttributes
{
  declare public id: string;
  declare public slug: string;
  declare public title: string;
  declare public html: string;
  declare public bundlePath: string | null;
  declare public entryFile: string;
  declare public externalUrl: string | null;
  declare public isPublished: boolean;
  declare public order: number;
  declare public createdBy: string;
  declare public readonly createdAt: Date;
  declare public readonly updatedAt: Date;
}

CustomPage.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    slug: {
      type: DataTypes.STRING(80),
      allowNull: false,
      unique: true,
      comment: 'URL 식별자 (영문/숫자/하이픈)',
    },
    title: {
      type: DataTypes.STRING(150),
      validate: { len: [1, 150] },
      allowNull: false,
    },
    html: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      defaultValue: '',
      comment: '관리자 원문 HTML — sandbox iframe에서만 렌더',
    },
    bundlePath: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
      comment: '번들 페이지: 압축 해제된 정적 파일 디렉터리(uploads 기준 상대경로). null=단일 HTML',
    },
    entryFile: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: 'index.html',
      comment: '번들 진입 파일(기본 index.html)',
    },
    externalUrl: {
      type: DataTypes.STRING(2048),
      allowNull: true,
      defaultValue: null,
      comment: '외부 URL 임베드 페이지: http(s) URL(iframe src). null=URL 페이지 아님',
    },
    isPublished: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    createdBy: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'custom_pages',
    modelName: 'CustomPage',
    timestamps: true,
    indexes: [{ fields: ['isPublished', 'order'] }],
  }
);

export default CustomPage;
