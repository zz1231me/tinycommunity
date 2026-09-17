// server/src/models/index.ts - 모델 관계 설정 (완전 정리됨)

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
import { SecurityLog } from './SecurityLog';
import { PostLike } from './PostLike';
import { CommentLike } from './CommentLike';
import { CommentReaction } from './CommentReaction';
import { Notification } from './Notification';
import { PostRead } from './PostRead';
import { PostScrap } from './PostScrap';
import { PostDraft } from './PostDraft';
import { PostAttachmentVersion } from './PostAttachmentVersion';
import { PostActivity } from './PostActivity';
import { FeatureFlag } from './FeatureFlag';
import { Subscription } from './Subscription';
import { NotificationSetting } from './NotificationSetting';
import { Conversation } from './Conversation';
import { Message } from './Message';
import { Tag } from './Tag';
import { PostTag } from './PostTag';
import { Memo } from './Memo';
import { UserPoint } from './UserPoint';
import { PointLedger } from './PointLedger';
import { WikiPage } from './WikiPage';
import { WikiRevision } from './WikiRevision';
import { PostRevision } from './PostRevision';
import { ErrorLog } from './ErrorLog';
import { LoginHistory } from './LoginHistory';
import { AuditLog } from './AuditLog';
import { UserSession } from './UserSession';
import { Report } from './Report';
import IpRule from './IpRule';
import { BoardManager } from './BoardManager';
import { PasswordResetRequest } from './PasswordResetRequest';
import { CustomPage } from './CustomPage';
import { Announcement } from './Announcement';
import { TempShare } from './TempShare';
import { AttendanceRecord } from './AttendanceRecord';
import { AttendanceChecklistItem } from './AttendanceChecklistItem';
import { AttendancePolicy } from './AttendancePolicy';

// User 관련 관계

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

// Post 관련 관계

// Post ↔ Comment
Post.hasMany(Comment, {
  foreignKey: 'PostId',
  as: 'comments',
  onDelete: 'CASCADE', // Post 삭제 시 Comment도 함께 삭제
  hooks: true, // Sequelize가 cascade를 제대로 처리하도록
});
Comment.belongsTo(Post, { foreignKey: 'PostId', as: 'post' });

// Post ↔ User (담당자) — 담당자가 탈퇴해도 글은 남아야 하므로 FK 제약을 걸지 않는다
Post.belongsTo(User, {
  foreignKey: 'assigneeId',
  as: 'assignee',
  constraints: false,
});

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

// Comment 관련 관계

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

// Board 관련 관계

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

// Event 관련 관계

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

// PostLike 관련 관계

// Post ↔ PostLike
Post.hasMany(PostLike, { foreignKey: 'PostId', as: 'likes', onDelete: 'CASCADE', hooks: true });
PostLike.belongsTo(Post, { foreignKey: 'PostId', as: 'post' });

// User ↔ PostLike — User hard-delete 시 행위 기록도 함께 제거 (paranoid가 기본이지만 force-destroy 대비)
User.hasMany(PostLike, { foreignKey: 'UserId', as: 'postLikes', onDelete: 'CASCADE', hooks: true });
PostLike.belongsTo(User, { foreignKey: 'UserId', as: 'user' });

// CommentLike 관련 관계 (PostLike와 동일 패턴)

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

// Comment/User ↔ CommentReaction — 이모지 리액션(CommentLike와 동일 정리 패턴)
Comment.hasMany(CommentReaction, {
  foreignKey: 'CommentId',
  as: 'reactions',
  onDelete: 'CASCADE',
  hooks: true,
});
CommentReaction.belongsTo(Comment, { foreignKey: 'CommentId', as: 'comment' });
User.hasMany(CommentReaction, {
  foreignKey: 'UserId',
  as: 'commentReactions',
  onDelete: 'CASCADE',
  hooks: true,
});
CommentReaction.belongsTo(User, { foreignKey: 'UserId', as: 'user' });

// Notification 관련 관계

// User ↔ Notification
User.hasMany(Notification, {
  foreignKey: 'userId',
  as: 'notifications',
  onDelete: 'CASCADE',
  hooks: true,
});
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Subscription / NotificationSetting — 구독·팔로우와 알림 설정
User.hasMany(Subscription, {
  foreignKey: 'userId',
  as: 'subscriptions',
  onDelete: 'CASCADE',
  hooks: true,
});
Subscription.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(NotificationSetting, {
  foreignKey: 'userId',
  as: 'notificationSettings',
  onDelete: 'CASCADE',
  hooks: true,
});
NotificationSetting.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Conversation / Message — 메시지
Conversation.hasMany(Message, {
  foreignKey: 'conversationId',
  as: 'messages',
  onDelete: 'CASCADE',
  hooks: true,
});
Message.belongsTo(Conversation, { foreignKey: 'conversationId', as: 'conversation' });
User.hasMany(Message, {
  foreignKey: 'senderId',
  as: 'sentMessages',
  onDelete: 'CASCADE',
  hooks: true,
});
Message.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });
Conversation.belongsTo(User, { foreignKey: 'userAId', as: 'userA' });
Conversation.belongsTo(User, { foreignKey: 'userBId', as: 'userB' });

// PostRead 관련 관계
Post.hasMany(PostRead, { foreignKey: 'PostId', as: 'reads', onDelete: 'CASCADE', hooks: true });
PostRead.belongsTo(Post, { foreignKey: 'PostId', as: 'post' });
User.hasMany(PostRead, {
  foreignKey: 'UserId',
  as: 'postReads',
  onDelete: 'CASCADE',
  hooks: true,
});
PostRead.belongsTo(User, { foreignKey: 'UserId', as: 'user' });

// PostScrap 관련 관계 — 개인 스크랩(나중에 보기)
Post.hasMany(PostScrap, { foreignKey: 'PostId', as: 'scraps', onDelete: 'CASCADE', hooks: true });
PostScrap.belongsTo(Post, { foreignKey: 'PostId', as: 'post' });
User.hasMany(PostScrap, {
  foreignKey: 'UserId',
  as: 'postScraps',
  onDelete: 'CASCADE',
  hooks: true,
});
PostScrap.belongsTo(User, { foreignKey: 'UserId', as: 'user' });

// PostDraft — 작성 중인 글 (본인만 접근)
User.hasMany(PostDraft, {
  foreignKey: 'UserId',
  as: 'postDrafts',
  onDelete: 'CASCADE',
  hooks: true,
});
PostDraft.belongsTo(User, { foreignKey: 'UserId', as: 'user' });

// Tag / PostTag 관련 관계
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

// ErrorLog — 로그 보존을 위해 User 삭제 시 userId만 null 처리 (로그 자체는 유지)
// ErrorLog는 User 삭제 후에도 보존해야 하므로 DB FK 제약 없이 애플리케이션 레벨만 관리

// LoginHistory — 로그인 이력 (User 삭제 후에도 로그 보존)
// FK 제약 없이 앱 레벨만 관리 (사용자 삭제 후에도 기록 유지)

// AuditLog — 관리자 작업 감사 로그 (adminId는 앱 레벨만 관리)
// adminId/targetId는 문자열로만 저장 — 사용자 삭제 후에도 기록 유지

// Report — 콘텐츠 신고
User.hasMany(Report, { foreignKey: 'reporterId', as: 'reports', constraints: false });
Report.belongsTo(User, { foreignKey: 'reporterId', as: 'reporter', constraints: false });

// UserSession — 활성 세션 관리
User.hasMany(UserSession, {
  foreignKey: 'userId',
  as: 'sessions',
  onDelete: 'CASCADE',
  hooks: true,
});
UserSession.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// BoardManager — 게시판별 담당자 (다대다: Board ↔ User through BoardManager)
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

// Memo 관련 관계
User.hasMany(Memo, { foreignKey: 'UserId', as: 'memos', onDelete: 'CASCADE', hooks: true });
Memo.belongsTo(User, { foreignKey: 'UserId', as: 'user' });

// 출퇴근 기록 — 사용자를 지우면 기록도 함께 지운다
User.hasMany(AttendanceRecord, {
  foreignKey: 'UserId',
  as: 'attendanceRecords',
  onDelete: 'CASCADE',
  hooks: true,
});
AttendanceRecord.belongsTo(User, { foreignKey: 'UserId', as: 'user' });

// 포인트 관련 관계
User.hasOne(UserPoint, { foreignKey: 'UserId', as: 'point', onDelete: 'CASCADE', hooks: true });
UserPoint.belongsTo(User, { foreignKey: 'UserId', as: 'user' });
User.hasMany(PointLedger, {
  foreignKey: 'UserId',
  as: 'pointLedgers',
  onDelete: 'CASCADE',
  hooks: true,
});
PointLedger.belongsTo(User, { foreignKey: 'UserId', as: 'user' });

// WikiPage 관련 관계
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

// WikiRevision — 위키 수정 이력 (append-only)
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

// PostAttachmentVersion — 첨부 이전 버전 (append-only)
Post.hasMany(PostAttachmentVersion, {
  foreignKey: 'postId',
  as: 'attachmentVersions',
  onDelete: 'CASCADE',
  hooks: true,
  constraints: false,
});
PostAttachmentVersion.belongsTo(Post, { foreignKey: 'postId', as: 'post', constraints: false });

// PostRevision — 게시글 수정 이력 (append-only)
Post.hasMany(PostRevision, {
  foreignKey: 'postId',
  as: 'revisions',
  onDelete: 'CASCADE',
  hooks: true,
  constraints: false,
});
PostRevision.belongsTo(Post, { foreignKey: 'postId', as: 'post', constraints: false });
User.hasMany(PostRevision, {
  foreignKey: 'editorId',
  as: 'postRevisions',
  onDelete: 'SET NULL',
  hooks: true,
  constraints: false,
});
PostRevision.belongsTo(User, { foreignKey: 'editorId', as: 'editor', constraints: false });

// PostActivity — 상태·담당자 변경 기록 (append-only)
Post.hasMany(PostActivity, {
  foreignKey: 'postId',
  as: 'activities',
  onDelete: 'CASCADE',
  hooks: true,
  constraints: false,
});
PostActivity.belongsTo(Post, { foreignKey: 'postId', as: 'post', constraints: false });
PostActivity.belongsTo(User, { foreignKey: 'actorId', as: 'actor', constraints: false });

// PasswordResetRequest — 비밀번호 초기화 요청 (사용자 요청 → 관리자 승인)
User.hasMany(PasswordResetRequest, {
  foreignKey: 'userId',
  as: 'passwordResetRequests',
  onDelete: 'CASCADE',
  hooks: true,
  constraints: false,
});
PasswordResetRequest.belongsTo(User, { foreignKey: 'userId', as: 'user', constraints: false });

// 정리된 모델 Export (필요한 모델만)

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
  SecurityLog,
  PostLike,
  CommentLike,
  CommentReaction,
  Notification,
  PostRead,
  PostScrap,
  PostDraft,
  PostAttachmentVersion,
  PostActivity,
  FeatureFlag,
  Subscription,
  NotificationSetting,
  Conversation,
  Message,
  Tag,
  PostTag,
  UserPoint,
  PointLedger,
  Memo,
  WikiPage,
  WikiRevision,
  PostRevision,
  ErrorLog,
  LoginHistory,
  AuditLog,
  UserSession,
  Report,
  IpRule,
  BoardManager,
  PasswordResetRequest,
  CustomPage,
  Announcement,
  TempShare,
  AttendanceRecord,
  AttendanceChecklistItem,
  AttendancePolicy,
};

// 데이터베이스 동기화 헬퍼
