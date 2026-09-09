// server/src/models/Post.ts - 수정된 Post 모델 (Sequelize 옵션 개선)
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
import { generateRandomId } from '../utils/generateId';
import { logError } from '../utils/logger';
import { extractSearchText } from '../utils/contentRenderer';
import type { WorkStatus } from '../config/workStatus';

// 타입 전용 import
import type { UserInstance } from './User';
import type { Board } from './Board';

// 파일 첨부 타입 정의
export interface Attachment {
  filename: string; // 서버에 저장된 파일명
  originalname: string; // 원본 파일명
  size: number; // 파일 크기 (bytes)
  mimetype: string; // MIME 타입
  path: string; // 저장 경로
}

// PostInstance 타입 정의 (사용자 삭제 대응)
export interface PostInstance extends Model<
  InferAttributes<PostInstance>,
  InferCreationAttributes<PostInstance>
> {
  id: CreationOptional<string>;
  title: string;
  content: string; // 본문(현재 CKEditor HTML, 레거시 Tiptap JSON 호환)
  contentText: CreationOptional<string | null>; // 검색용 평문(content에서 태그 제거)
  author: string;
  attachments: Attachment[] | null;
  boardType: ForeignKey<string>;
  viewCount: CreationOptional<number>;
  isPinned: CreationOptional<boolean>;
  pinnedUntil: CreationOptional<Date | null>;
  // 업무 추적 — 게시판을 '글 모음' 이 아니라 '할 일 목록' 으로 쓸 수 있게 한다
  workStatus: CreationOptional<WorkStatus>;
  assigneeId: CreationOptional<string | null>;
  status: CreationOptional<'draft' | 'published' | 'archived'>;
  deletedAt: CreationOptional<Date | null>;
  UserId: ForeignKey<string | null>; // ✅ null 허용
  // 비밀글
  isSecret: CreationOptional<boolean>;
  secretType: CreationOptional<'password' | 'users' | null>;
  secretPassword: CreationOptional<string | null>;
  secretUserIds: CreationOptional<string[] | null>;
  isEncrypted: CreationOptional<boolean>;
  secretSalt: CreationOptional<string | null>;
  // 좋아요 수 (virtual)
  likeCount?: CreationOptional<number>;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;

  // 관계 데이터
  user?: NonAttribute<UserInstance>;
  board?: NonAttribute<Board>;
}

// Post 클래스 정의 - 사용자 삭제 대응
class PostModel
  extends Model<InferAttributes<PostInstance>, InferCreationAttributes<PostInstance>>
  implements PostInstance
{
  declare public id: CreationOptional<string>;
  declare public title: string;
  declare public content: string;
  declare public contentText: CreationOptional<string | null>;
  declare public author: string;
  declare public boardType: ForeignKey<string>;
  declare public viewCount: CreationOptional<number>;
  declare public isPinned: CreationOptional<boolean>;
  declare public pinnedUntil: CreationOptional<Date | null>;
  declare public workStatus: CreationOptional<WorkStatus>;
  declare public assigneeId: CreationOptional<string | null>;
  declare public status: CreationOptional<'draft' | 'published' | 'archived'>;
  declare public deletedAt: CreationOptional<Date | null>;
  declare public UserId: ForeignKey<string | null>; // ✅ null 허용
  declare public attachments: Attachment[] | null;
  declare public isSecret: CreationOptional<boolean>;
  declare public secretType: CreationOptional<'password' | 'users' | null>;
  declare public secretPassword: CreationOptional<string | null>;
  declare public secretUserIds: CreationOptional<string[] | null>;
  declare public isEncrypted: CreationOptional<boolean>;
  declare public secretSalt: CreationOptional<string | null>;
  declare public likeCount: CreationOptional<number>;
  declare public readonly createdAt: Date;
  declare public readonly updatedAt: Date;

  // 관계 데이터
  declare public user?: NonAttribute<UserInstance>;
  declare public board?: NonAttribute<Board>;

  public override toJSON(): Partial<PostInstance> {
    const values = { ...this.get() } as any;
    // secretPassword는 항상 제거; secretSalt는 E2EE 게시글에서만 노출 (컨트롤러에서 추가 필터링됨)
    // contentText는 검색 전용 내부 컬럼이라 API 응답에서 제외(content와 중복 페이로드 방지)
    const { secretPassword: _sp, secretSalt: _ss, contentText: _ct, ...safeValues } = values;
    // E2EE 게시글이면 secretSalt를 다시 포함 (클라이언트가 복호화에 필요)
    if (values.isEncrypted) {
      return { ...safeValues, secretSalt: _ss };
    }
    return safeValues;
  }
}

// 모델 초기화
PostModel.init(
  {
    id: {
      type: DataTypes.STRING(12),
      primaryKey: true,
      allowNull: false,
      defaultValue: () => generateRandomId(12),
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        len: [1, 255],
      },
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'HTML content (legacy: Tiptap JSON)',
    },
    contentText: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '검색용 평문 — content에서 HTML 태그를 제거한 텍스트(beforeSave 훅에서 자동 생성)',
    },
    author: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: '작성자명 (표시용, 삭제된 계정은 익명화됨)',
    },
    attachments: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'JSON array of file attachments',
      get() {
        const raw = this.getDataValue('attachments') as string | null;
        if (!raw) return null;
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? (parsed as Attachment[]) : null;
        } catch {
          logError('attachments JSON 파싱 실패');
          return null;
        }
      },
      set(value: Attachment[] | null) {
        if (value === null || value === undefined) {
          this.setDataValue('attachments', null as any);
        } else if (Array.isArray(value)) {
          this.setDataValue('attachments', JSON.stringify(value) as any);
        } else {
          logError('attachments는 배열이어야 합니다');
          this.setDataValue('attachments', null as any);
        }
      },
    },
    boardType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      references: {
        model: 'boards',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    viewCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '조회수',
    },
    isPinned: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '상단 고정 여부',
    },
    pinnedUntil: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '상단 고정 만료 시각 (null = 무기한)',
    },
    // ENUM 이 아니라 문자열이다 — 이 프로젝트는 sync({alter:false}) 로 떠서
    // ENUM 값을 늘려도 이미 만들어진 테이블에 반영되지 않는다(Notifications.type 과 같은 이유).
    workStatus: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'none',
      comment: '업무 상태 (none/todo/doing/done)',
    },
    assigneeId: {
      type: DataTypes.STRING(50),
      allowNull: true,
      // 담당자가 탈퇴해도 글은 남아야 한다 — FK 제약 없이 앱에서 다룬다
      comment: '담당자 사용자 id',
    },
    status: {
      type: DataTypes.ENUM('draft', 'published', 'archived'),
      allowNull: false,
      defaultValue: 'published',
      comment: '게시글 상태',
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '삭제일시 (소프트 삭제)',
    },
    UserId: {
      type: DataTypes.STRING(50),
      allowNull: true, // ✅ null 허용 (삭제된 사용자 대응)
      references: {
        model: 'users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL', // ✅ RESTRICT → SET NULL로 변경
      comment: '작성자 ID (삭제된 경우 null)',
    },
    isSecret: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '비밀글 여부',
    },
    secretType: {
      type: DataTypes.ENUM('password', 'users'),
      allowNull: true,
      defaultValue: null,
      comment: '비밀글 유형: password(비밀번호), users(지정 사용자)',
    },
    secretPassword: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
      comment: '비밀글 비밀번호 (bcrypt 해시)',
    },
    secretUserIds: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      comment: '비밀글 허용 사용자 ID 목록 (JSON array)',
      get() {
        const raw = this.getDataValue('secretUserIds') as string | null;
        if (!raw) return null;
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? (parsed as string[]) : null;
        } catch {
          return null;
        }
      },
      set(value: string[] | null) {
        if (value === null || value === undefined) {
          this.setDataValue('secretUserIds', null as any);
        } else {
          this.setDataValue('secretUserIds', JSON.stringify(value) as any);
        }
      },
    },
    isEncrypted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'E2EE 암호화 여부 (password 타입 비밀글)',
    },
    secretSalt: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: null,
      comment: 'E2EE PBKDF2 솔트값',
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
    timestamps: true,
    paranoid: true,
    deletedAt: 'deletedAt',
    tableName: 'Posts',
    modelName: 'Post',
    // 추가 옵션으로 명시적 설정
    underscored: false,
    freezeTableName: true,
    indexes: [
      { fields: ['boardType'] },
      { fields: ['UserId'] },
      // { fields: ['author'] }, // 마이그레이션 후 자동 생성됨
      { fields: ['createdAt'] },
      { fields: ['status'] },
      { fields: ['isPinned', 'createdAt'] },
      { fields: ['deletedAt'] },
      { fields: ['boardType', 'createdAt'] },
      { fields: ['boardType', 'status', 'createdAt'] },
      // 게시판에서 '진행중인 것만' 보기
      { fields: ['boardType', 'workStatus'] },
      // '내가 맡은 일' 모아 보기
      { fields: ['assigneeId', 'workStatus'] },
    ],
    scopes: {
      // paranoid: true 옵션이 자동으로 deletedAt IS NULL 조건을 추가하므로 중복 불필요
      published: {
        where: { status: 'published' },
      },
      pinned: {
        where: { isPinned: true },
      },
    },
    hooks: {
      // content가 바뀔 때마다 검색용 평문(contentText)을 자동 갱신.
      // 생성·수정 모두에서 동작(beforeSave)하여, 검색이 원본 HTML이 아닌 평문에 매칭된다.
      beforeSave: async post => {
        if (post.isNewRecord || post.changed('content')) {
          post.contentText = extractSearchText(post.content || '');
        }
      },
    },
  }
);

// Export 정리
export const Post = PostModel;
export type Post = PostModel;
export default PostModel;
