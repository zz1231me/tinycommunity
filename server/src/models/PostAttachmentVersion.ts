// 같은 이름으로 다시 올린 첨부의 이전 버전. 본문의 PostRevision 에 대응한다.
// 밀려난 파일은 디스크에서 지우지 않는다. 여기 행이 있으면 파일도 남아 있다.

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

class PostAttachmentVersionModel extends Model<
  InferAttributes<PostAttachmentVersionModel>,
  InferCreationAttributes<PostAttachmentVersionModel>
> {
  declare public id: CreationOptional<number>;
  declare public postId: ForeignKey<string>;
  /** 버전을 묶는 키. 사용자가 보는 파일 이름. */
  declare public originalName: string;
  /** 서버에 저장된 파일명 */
  declare public filename: string;
  declare public size: number;
  declare public mimetype: string;
  /** 이 버전을 올린 사람. 탈퇴해도 이력이 남아야 하므로 FK 를 걸지 않는다. */
  declare public uploadedBy: CreationOptional<string | null>;
  declare public readonly createdAt: CreationOptional<Date>;
}

PostAttachmentVersionModel.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    postId: {
      type: DataTypes.STRING(12),
      allowNull: false,
      references: { model: 'Posts', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    originalName: { type: DataTypes.STRING(255), allowNull: false },
    filename: { type: DataTypes.STRING(255), allowNull: false },
    size: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    mimetype: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
    uploadedBy: { type: DataTypes.STRING(50), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'PostAttachmentVersions',
    modelName: 'PostAttachmentVersion',
    timestamps: true,
    updatedAt: false,
    indexes: [
      // 이 글, 이 파일의 이전 버전들을 최신 순으로 찾는다
      {
        fields: ['postId', 'originalName', 'createdAt'],
        name: 'idx_attachment_versions_lookup',
      },
    ],
  }
);

export const PostAttachmentVersion = PostAttachmentVersionModel;
export type PostAttachmentVersion = PostAttachmentVersionModel;
export default PostAttachmentVersionModel;
