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

class WikiRevisionModel extends Model<
  InferAttributes<WikiRevisionModel>,
  InferCreationAttributes<WikiRevisionModel>
> {
  declare public id: CreationOptional<number>;
  declare public wikiPageId: ForeignKey<number>;
  declare public editorId: ForeignKey<string | null>;
  declare public title: string;
  declare public content: CreationOptional<string>;
  declare public readonly createdAt: CreationOptional<Date>;
  // virtual associations
  declare public editor?: NonAttribute<{ id: string; name: string }>;
}

WikiRevisionModel.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    wikiPageId: { type: DataTypes.INTEGER, allowNull: false },
    editorId: { type: DataTypes.STRING(50), allowNull: true },
    title: { type: DataTypes.STRING(200), allowNull: false },
    content: { type: DataTypes.TEXT('long'), allowNull: true, defaultValue: '' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'WikiRevisions',
    modelName: 'WikiRevision',
    timestamps: true,
    updatedAt: false, // append-only 이력 테이블
    indexes: [{ fields: ['wikiPageId'] }, { fields: ['editorId'] }],
  }
);

export const WikiRevision = WikiRevisionModel;
export type WikiRevision = WikiRevisionModel;
