// server/src/models/index.ts - 모델 관계 설정 (완전 정리됨)

import { logError, logSuccess } from '../utils/logger';
import User from './User';
import { Post } from './Post';
import { Comment } from './Comment';
import Board from './Board';
import { Role } from './Role';
import BoardAccess from './BoardAccess';
import Event from './Event';
import EventPermission from './EventPermission';
import Bookmark from './Bookmark';
import { SiteSettings } from './SiteSettings';
import { RateLimitSettings } from './RateLimitSettings';
import { SecurityLog } from './SecurityLog';
import { PostLike } from './PostLike';
import { CommentLike } from './CommentLike';
import { Notification } from './Notification';
import { PostBookmark } from './PostBookmark';
import { PostRead } from './PostRead';
import { Tag } from './Tag';
import { PostTag } from './PostTag';
import { Memo } from './Memo';
import { WikiPage } from './WikiPage';
import { WikiRevision } from './WikiRevision';
import { ErrorLog } from './ErrorLog';
import { LoginHistory } from './LoginHistory';
import { AuditLog } from './AuditLog';
import { UserSession } from './UserSession';
import { Report } from './Report';
import IpRule from './IpRule';
import { BoardManager } from './BoardManager';
import { PasswordResetRequest } from './PasswordResetRequest';

// ========================================
// User 관련 관계
// ========================================

// User ↔ Post
User.hasMany(Post, { foreignKey: 'UserId', as: 'posts' });
Post.belongsTo(User, { foreignKey: 'UserId', as: 'user' });

// User ↔ Comment
User.hasMany(Comment, { foreignKey: 'UserId', as: 'comments' });
Comment.belongsTo(User, { foreignKey: 'UserId', as: 'user' });

// User ↔ Event
User.hasMany(Event, { foreignKey: 'UserId', as: 'events', onDelete: 'CASCADE', hooks: true });
Event.belongsTo(User, { foreignKey: 'UserId', as: 'user' });

// User ↔ Role
User.belongsTo(Role, {
  foreignKey: 'roleId',
  targetKey: 'id',
  as: 'roleInfo',
  constraints: false,
});
Role.hasMany(User, {
  foreignKey: 'roleId',
  sourceKey: 'id',
  as: 'users',
  constraints: false,
});

// User ↔ SecurityLog (1:N)
User.hasMany(SecurityLog, { foreignKey: 'userId', as: 'securityLogs' });
SecurityLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// ========================================
// Post 관련 관계
// ========================================

// Post ↔ Comment
Post.hasMany(Comment, {
  foreignKey: 'PostId',
  as: 'comments',
  onDelete: 'CASCADE', // Post 삭제 시 Comment도 함께 삭제
  hooks: true, // Sequelize가 cascade를 제대로 처리하도록
});
Comment.belongsTo(Post, { foreignKey: 'PostId', as: 'post' });

// Post ↔ Board
Post.belongsTo(Board, {
  foreignKey: 'boardType',
  targetKey: 'id',
  as: 'board',
  constraints: false,
});
Board.hasMany(Post, {
  foreignKey: 'boardType',
  sourceKey: 'id',
  as: 'posts',
  constraints: false,
});

// ========================================
// Comment 관련 관계
// ========================================

// Comment ↔ Comment (Self-referencing for 대댓글)
Comment.hasMany(Comment, {
  as: 'replies',
  foreignKey: 'parentId',
  constraints: false,
});
Comment.belongsTo(Comment, {
  as: 'parent',
  foreignKey: 'parentId',
  constraints: false,
});

// ========================================
// Board 관련 관계
// ========================================

// Board ↔ User (개인 폴더용)
Board.belongsTo(User, {
  foreignKey: 'ownerId',
  as: 'owner',
  constraints: false,
});
User.hasMany(Board, {
  foreignKey: 'ownerId',
  as: 'personalBoards',
  constraints: false,
});

// Board ↔ Role (다대다)
Board.belongsToMany(Role, {
  through: BoardAccess,
  foreignKey: 'boardId',
  otherKey: 'roleId',
  as: 'AccessibleRoles',
  constraints: false,
});
Role.belongsToMany(Board, {
  through: BoardAccess,
  foreignKey: 'roleId',
  otherKey: 'boardId',
  as: 'AccessibleBoards',
  constraints: false,
});

// BoardAccess ↔ Board, Role
BoardAccess.belongsTo(Board, {
  foreignKey: 'boardId',
  as: 'board',
  constraints: false,
});
BoardAccess.belongsTo(Role, {
  foreignKey: 'roleId',
  as: 'role',
  constraints: false,
});
Board.hasMany(BoardAccess, {
  foreignKey: 'boardId',
  as: 'accesses',
  onDelete: 'CASCADE',
  hooks: true,
  constraints: false,
});
Role.hasMany(BoardAccess, {
  foreignKey: 'roleId',
  as: 'accesses',
  constraints: false,
});

// ========================================
// Event 관련 관계
// ========================================

// Role ↔ EventPermission
Role.hasOne(EventPermission, {
  foreignKey: 'roleId',
  as: 'eventPermission',
  constraints: false,
});
EventPermission.belongsTo(Role, {
  foreignKey: 'roleId',
  as: 'role',
  constraints: false,
});

// ========================================
// PostLike 관련 관계
// ========================================

// Post ↔ PostLike
Post.hasMany(PostLike, { foreignKey: 'PostId', as: 'likes', onDelete: 'CASCADE', hooks: true });
PostLike.belongsTo(Post, { foreignKey: 'PostId', as: 'post' });

// User ↔ PostLike — User hard-delete 시 행위 기록도 함께 제거 (paranoid가 기본이지만 force-destroy 대비)
User.hasMany(PostLike, { foreignKey: 'UserId', as: 'postLikes', onDelete: 'CASCADE', hooks: true });
PostLike.belongsTo(User, { foreignKey: 'UserId', as: 'user' });

// ========================================
// CommentLike 관련 관계 (PostLike와 동일 패턴)
// ========================================

// Comment ↔ CommentLike — 댓글 hard-delete 시 좋아요 기록도 함께 제거
Comment.hasMany(CommentLike, {
  foreignKey: 'CommentId',
  as: 'likes',
  onDelete: 'CASCADE',
  hooks: true,
});
CommentLike.belongsTo(Comment, { foreignKey: 'CommentId', as: 'comment' });

// User ↔ CommentLike
User.hasMany(CommentLike, {
  foreignKey: 'UserId',
  as: 'commentLikes',
  onDelete: 'CASCADE',
  hooks: true,
});
CommentLike.belongsTo(User, { foreignKey: 'UserId', as: 'user' });

// ========================================
// PostBookmark 관련 관계
// ========================================

// Post ↔ PostBookmark
Post.hasMany(PostBookmark, {
  foreignKey: 'PostId',
  as: 'bookmarks',
  onDelete: 'CASCADE',
  hooks: true,
});
PostBookmark.belongsTo(Post, { foreignKey: 'PostId', as: 'post' });

// User ↔ PostBookmark
User.hasMany(PostBookmark, {
  foreignKey: 'UserId',
  as: 'postBookmarks',
  onDelete: 'CASCADE',
  hooks: true,
});
PostBookmark.belongsTo(User, { foreignKey: 'UserId', as: 'user' });

// ========================================
// Notification 관련 관계
// ========================================

// User ↔ Notification
User.hasMany(Notification, {
  foreignKey: 'userId',
  as: 'notifications',
  onDelete: 'CASCADE',
  hooks: true,
});
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// ========================================
// PostRead 관련 관계
// ========================================
Post.hasMany(PostRead, { foreignKey: 'PostId', as: 'reads', onDelete: 'CASCADE', hooks: true });
PostRead.belongsTo(Post, { foreignKey: 'PostId', as: 'post' });
User.hasMany(PostRead, {
  foreignKey: 'UserId',
  as: 'postReads',
  onDelete: 'CASCADE',
  hooks: true,
});
PostRead.belongsTo(User, { foreignKey: 'UserId', as: 'user' });

// ========================================
// Tag / PostTag 관련 관계
// ========================================
Post.belongsToMany(Tag, {
  through: PostTag,
  foreignKey: 'PostId',
  otherKey: 'TagId',
  as: 'tags',
  constraints: false,
});
Tag.belongsToMany(Post, {
  through: PostTag,
  foreignKey: 'TagId',
  otherKey: 'PostId',
  as: 'posts',
  constraints: false,
});

// ========================================
// ErrorLog — 로그 보존을 위해 User 삭제 시 userId만 null 처리 (로그 자체는 유지)
// ========================================
// ErrorLog는 User 삭제 후에도 보존해야 하므로 DB FK 제약 없이 애플리케이션 레벨만 관리

// ========================================
// LoginHistory — 로그인 이력 (User 삭제 후에도 로그 보존)
// ========================================
// FK 제약 없이 앱 레벨만 관리 (사용자 삭제 후에도 기록 유지)

// ========================================
// AuditLog — 관리자 작업 감사 로그 (adminId는 앱 레벨만 관리)
// ========================================
// adminId/targetId는 문자열로만 저장 — 사용자 삭제 후에도 기록 유지

// ========================================
// Report — 콘텐츠 신고
// ========================================
User.hasMany(Report, { foreignKey: 'reporterId', as: 'reports', constraints: false });
Report.belongsTo(User, { foreignKey: 'reporterId', as: 'reporter', constraints: false });

// ========================================
// UserSession — 활성 세션 관리
// ========================================
User.hasMany(UserSession, {
  foreignKey: 'userId',
  as: 'sessions',
  onDelete: 'CASCADE',
  hooks: true,
});
UserSession.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// ========================================
// BoardManager — 게시판별 담당자 (다대다: Board ↔ User through BoardManager)
// ========================================
Board.hasMany(BoardManager, {
  foreignKey: 'boardId',
  as: 'boardManagers',
  onDelete: 'CASCADE',
  hooks: true,
  constraints: false,
});
BoardManager.belongsTo(Board, { foreignKey: 'boardId', as: 'board', constraints: false });
User.hasMany(BoardManager, {
  foreignKey: 'userId',
  as: 'boardManagerRoles',
  onDelete: 'CASCADE',
  hooks: true,
  constraints: false,
});
BoardManager.belongsTo(User, { foreignKey: 'userId', as: 'user', constraints: false });

// ========================================
// Memo 관련 관계
// ========================================
User.hasMany(Memo, { foreignKey: 'UserId', as: 'memos', onDelete: 'CASCADE', hooks: true });
Memo.belongsTo(User, { foreignKey: 'UserId', as: 'user' });

// ========================================
// WikiPage 관련 관계
// ========================================
WikiPage.belongsTo(WikiPage, { as: 'parent', foreignKey: 'parentId', constraints: false });
WikiPage.hasMany(WikiPage, { as: 'children', foreignKey: 'parentId', constraints: false });
User.hasMany(WikiPage, {
  foreignKey: 'authorId',
  as: 'authoredWikiPages',
  onDelete: 'SET NULL',
  hooks: true,
  constraints: false,
});
WikiPage.belongsTo(User, { foreignKey: 'authorId', as: 'author', constraints: false });
User.hasMany(WikiPage, {
  foreignKey: 'lastEditorId',
  as: 'editedWikiPages',
  onDelete: 'SET NULL',
  hooks: true,
  constraints: false,
});
WikiPage.belongsTo(User, { foreignKey: 'lastEditorId', as: 'lastEditor', constraints: false });

// ========================================
// WikiRevision — 위키 수정 이력 (append-only)
// ========================================
WikiPage.hasMany(WikiRevision, {
  foreignKey: 'wikiPageId',
  as: 'revisions',
  onDelete: 'CASCADE',
  hooks: true,
  constraints: false,
});
WikiRevision.belongsTo(WikiPage, { foreignKey: 'wikiPageId', as: 'wikiPage', constraints: false });
User.hasMany(WikiRevision, {
  foreignKey: 'editorId',
  as: 'wikiRevisions',
  onDelete: 'SET NULL',
  hooks: true,
  constraints: false,
});
WikiRevision.belongsTo(User, { foreignKey: 'editorId', as: 'editor', constraints: false });

// ========================================
// PasswordResetRequest — 비밀번호 초기화 요청 (사용자 요청 → 관리자 승인)
// ========================================
User.hasMany(PasswordResetRequest, {
  foreignKey: 'userId',
  as: 'passwordResetRequests',
  onDelete: 'CASCADE',
  hooks: true,
  constraints: false,
});
PasswordResetRequest.belongsTo(User, { foreignKey: 'userId', as: 'user', constraints: false });

// ========================================
// ✅ 정리된 모델 Export (필요한 모델만)
// ========================================

export {
  User,
  Post,
  Comment,
  Board,
  Role,
  BoardAccess,
  Event,
  EventPermission,
  Bookmark,
  SiteSettings,
  RateLimitSettings,
  SecurityLog,
  PostLike,
  CommentLike,
  Notification,
  PostBookmark,
  PostRead,
  Tag,
  PostTag,
  Memo,
  WikiPage,
  WikiRevision,
  ErrorLog,
  LoginHistory,
  AuditLog,
  UserSession,
  Report,
  IpRule,
  BoardManager,
  PasswordResetRequest,
};

// ========================================
// 데이터베이스 동기화 헬퍼
// ========================================

export async function syncDatabase(options?: { force?: boolean; alter?: boolean }) {
  const { sequelize } = await import('../config/sequelize');

  try {
    await sequelize.sync(options);
    logSuccess('데이터베이스 동기화 완료');
  } catch (error) {
    logError('데이터베이스 동기화 실패', error);
    throw error;
  }
}
