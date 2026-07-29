// server/src/models/CustomPage.ts — 관리자가 직접 작성하는 커스텀 HTML 페이지.
// 렌더는 클라이언트에서 sandbox iframe(srcdoc)으로 앱과 격리해 표시하므로,
// 여기 저장되는 html은 새니타이즈하지 않고 원문 그대로 보관한다(관리자 전용 CRUD).

import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/sequelize';

export interface CustomPageAttributes {
  id: string;
  slug: string; // URL 식별자 (예: 'guide') — /dashboard/pages/:slug
  title: string;
  html: string; // 관리자가 넣은 원문 HTML (sandbox iframe에서 격리 렌더). 번들 페이지면 '' 유지.
  // 번들(ZIP 폴더 업로드) 페이지: 압축 해제된 정적 파일 디렉터리(uploads 기준 상대경로). null이면 단일 HTML 페이지.
  bundlePath: string | null;
  entryFile: string; // 번들 진입 파일 (기본 index.html)
  isPublished: boolean;
  order: number; // 사이드바 정렬
  createdBy: string; // 작성/수정 관리자 ID
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CustomPageCreationAttributes
  extends Optional<
    CustomPageAttributes,
    'id' | 'isPublished' | 'order' | 'html' | 'bundlePath' | 'entryFile'
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
