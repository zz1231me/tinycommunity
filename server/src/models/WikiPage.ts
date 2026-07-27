import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../config/sequelize';
import { extractSearchText } from '../utils/tiptapRenderer';

class WikiPageModel extends Model<
  InferAttributes<WikiPageModel>,
  InferCreationAttributes<WikiPageModel>
> {
  declare public id: CreationOptional<number>;
  declare public slug: string;
  declare public title: string;
  declare public content: CreationOptional<string>;
  declare public contentText: CreationOptional<string | null>; // 검색용 평문(content에서 태그 제거)
  declare public parentId: CreationOptional<number | null>;
  declare public authorId: ForeignKey<string | null>;
  declare public lastEditorId: ForeignKey<string | null>;
  declare public order: CreationOptional<number>;
  declare public isPublished: CreationOptional<boolean>;
  declare public readonly createdAt: CreationOptional<Date>;
  declare public readonly updatedAt: CreationOptional<Date>;
  // virtual associations
  declare public children?: NonAttribute<WikiPageModel[]>;

  // contentText는 검색 전용 내부 컬럼이라 API 응답에서 제외(content와 중복 페이로드 방지)
  public override toJSON(): object {
    const { contentText: _ct, ...rest } = { ...this.get() } as Record<string, unknown>;
    return rest;
  }
}

WikiPageModel.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    slug: { type: DataTypes.STRING(200), allowNull: false, validate: { notEmpty: true } },
    title: { type: DataTypes.STRING(200), allowNull: false, validate: { notEmpty: true } },
    content: { type: DataTypes.TEXT('long'), allowNull: true, defaultValue: '' },
    contentText: { type: DataTypes.TEXT('long'), allowNull: true },
    parentId: { type: DataTypes.INTEGER, allowNull: true },
    authorId: { type: DataTypes.STRING(50), allowNull: true }, // SET NULL 지원을 위해 nullable
    lastEditorId: { type: DataTypes.STRING(50), allowNull: true },
    order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isPublished: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'WikiPages',
    modelName: 'WikiPage',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['slug'] },
      { fields: ['parentId'] }, // 자식 페이지 조회 + 순환 참조 탐색 성능
    ],
    hooks: {
      // content가 바뀔 때 검색용 평문(contentText)을 자동 갱신 — 검색이 원본 HTML이 아닌 평문에 매칭
      beforeSave: async page => {
        if (page.isNewRecord || page.changed('content')) {
          page.contentText = extractSearchText(page.content || '');
        }
      },
    },
  }
);

export const WikiPage = WikiPageModel;
export type WikiPage = WikiPageModel;
