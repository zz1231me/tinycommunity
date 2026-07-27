// server/src/models/Comment.ts - 수정된 Comment 모델 (Sequelize 옵션 개선)
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
import { logError } from '../utils/logger';

// 타입 전용 import
import type { PostInstance } from './Post';
import type { UserInstance } from './User';

export interface CommentInstance extends Model<
  InferAttributes<CommentInstance>,
  InferCreationAttributes<CommentInstance>
> {
  id: CreationOptional<number>;
  content: string;
  author: string;
  PostId: ForeignKey<string>;
  UserId: ForeignKey<string>;

  // 대댓글 지원
  parentId: CreationOptional<number | null>;
  depth: CreationOptional<number>;
  path: CreationOptional<string>;

  // 반응/좋아요
  likeCount: CreationOptional<number>;
  dislikeCount: CreationOptional<number>;

  // 수정/삭제 추적
  isEdited: CreationOptional<boolean>;
  editedAt: CreationOptional<Date | null>;
  deletedAt: CreationOptional<Date | null>;

  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;

  // 관계 데이터
  post?: NonAttribute<PostInstance>;
  user?: NonAttribute<UserInstance>;
  parent?: NonAttribute<CommentInstance>;
  replies?: NonAttribute<CommentInstance[]>;
}

class CommentModel
  extends Model<InferAttributes<CommentInstance>, InferCreationAttributes<CommentInstance>>
  implements CommentInstance
{
  declare public id: CreationOptional<number>;
  declare public content: string;
  declare public author: string;
  declare public PostId: ForeignKey<string>;
  declare public UserId: ForeignKey<string>;

  declare public parentId: CreationOptional<number | null>;
  declare public depth: CreationOptional<number>;
  declare public path: CreationOptional<string>;

  declare public likeCount: CreationOptional<number>;
  declare public dislikeCount: CreationOptional<number>;

  declare public isEdited: CreationOptional<boolean>;
  declare public editedAt: CreationOptional<Date | null>;
  declare public deletedAt: CreationOptional<Date | null>;

  declare public readonly createdAt: Date;
  declare public readonly updatedAt: Date;

  // 관계 데이터
  declare public post?: NonAttribute<PostInstance>;
  declare public user?: NonAttribute<UserInstance>;
  declare public parent?: NonAttribute<CommentInstance>;
  declare public replies?: NonAttribute<CommentInstance[]>;

  public isTopLevel(): boolean {
    return this.depth === 0 && !this.parentId;
  }

  public async getReplyCount(): Promise<number> {
    // paranoid: true 옵션이 자동으로 deletedAt IS NULL 조건 추가
    return CommentModel.count({
      where: { parentId: this.id },
    });
  }
}

// 모델 초기화
CommentModel.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        // 실제 길이 제한은 컨트롤러가 설정값(commentContentMaxLength)으로 검증한다.
        // 모델은 빈 값 방지 + 비정상 대용량만 막는 안전망(서식 HTML은 평문보다 길어질 수 있으므로 넉넉히).
        len: [1, 100000],
      },
    },
    author: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: '작성자명 (표시용, 삭제된 계정은 익명화됨)',
    },
    PostId: {
      type: DataTypes.STRING(12),
      allowNull: false,
      references: {
        model: 'Posts',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    UserId: {
      type: DataTypes.STRING(50),
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    parentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'comments',
        key: 'id',
      },
      comment: '부모 댓글 ID (null이면 최상위 댓글)',
    },
    depth: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
      },
      comment: '댓글 깊이',
    },
    path: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
      comment: '계층 구조 경로',
    },
    likeCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    dislikeCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    isEdited: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    editedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'Comment',
    tableName: 'comments',
    timestamps: true,
    paranoid: true,
    deletedAt: 'deletedAt',
    underscored: false,
    freezeTableName: true,
    indexes: [
      { fields: ['PostId'] },
      { fields: ['UserId'] },
      { fields: ['author'] },
      { fields: ['parentId'] },
      { fields: ['depth'] },
      { fields: ['path'] },
      { fields: ['createdAt'] },
      { fields: ['PostId', 'createdAt'] },
      { fields: ['PostId', 'parentId', 'createdAt'] },
      { fields: ['PostId', 'depth', 'createdAt'] },
    ],
    hooks: {
      // ✅ 댓글 생성 시 author 필드 자동 설정
      beforeCreate: async comment => {
        // 계층 구조 설정 — 서비스에서 이미 depth/path를 계산해 전달한 경우 재계산 건너뜀
        // (트랜잭션 내 LOCK.UPDATE로 잠근 부모를 훅이 트랜잭션 없이 재조회하는 TOCTOU 방지)
        if (comment.parentId && comment.depth === undefined) {
          const parent = await CommentModel.findByPk(comment.parentId);
          if (parent) {
            comment.depth = parent.depth + 1;
            comment.path = parent.path ? `${parent.path}.${parent.id}` : String(parent.id);
          }
        } else if (!comment.parentId) {
          comment.depth = comment.depth ?? 0;
          comment.path = comment.path ?? '';
        }

        // ✅ author 필드가 없으면 UserId로부터 사용자명 가져오기
        if (!comment.author && comment.UserId) {
          try {
            const { User } = await import('./User');
            const user = await User.findByPk(comment.UserId, {
              attributes: ['name'],
            });
            if (user) {
              comment.author = user.name;
            } else {
              comment.author = '알수없음';
            }
          } catch (error) {
            logError('Comment beforeCreate: 사용자 조회 실패', error);
            comment.author = '알수없음';
          }
        }

        // ✅ author 필드가 여전히 없으면 기본값 설정
        if (!comment.author) {
          comment.author = '알수없음';
        }
      },

      // ✅ 댓글 수정 시 메타데이터 자동 설정
      beforeUpdate: async comment => {
        if (comment.changed('content')) {
          comment.isEdited = true;
          comment.editedAt = new Date();
        }
      },
    },
  }
);

export const Comment = CommentModel;
export type Comment = CommentModel;
export default CommentModel;
