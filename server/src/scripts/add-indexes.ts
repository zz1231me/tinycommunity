// server/src/scripts/add-indexes.ts
// 데이터베이스 성능 최적화를 위한 인덱스 추가 스크립트

import { sequelize } from '../config/sequelize';
import { logger } from '../utils/logger';

interface IndexDef {
  table: string;
  name: string;
  fields: string[];
  unique?: boolean;
  description: string;
}

export async function addDatabaseIndexes(): Promise<void> {
  try {
    logger.info('📊 데이터베이스 인덱스 추가 시작...');

    const queryInterface = sequelize.getQueryInterface();

    const indexes: IndexDef[] = [
      // ── Posts ────────────────────────────��─────────────
      {
        table: 'posts',
        name: 'idx_posts_board_created',
        fields: ['boardType', 'createdAt'],
        description: '게시판별 최신 게시글',
      },
      {
        table: 'posts',
        name: 'idx_posts_user_created',
        fields: ['UserId', 'createdAt'],
        description: '사용자별 게시글',
      },
      { table: 'posts', name: 'idx_posts_title', fields: ['title'], description: '제목 검색' },
      {
        table: 'posts',
        name: 'idx_posts_view_count',
        fields: ['viewCount'],
        description: '조회수 정렬',
      },
      // 전체 검색 (LIKE %term%) — content 길이 때문에 title만
      {
        table: 'posts',
        name: 'idx_posts_status_board',
        fields: ['status', 'boardType'],
        description: '상태+게시판 복합',
      },
      {
        table: 'posts',
        name: 'idx_posts_pinned_board',
        fields: ['isPinned', 'boardType', 'createdAt'],
        description: '핀 고정 게시글',
      },
      {
        table: 'posts',
        name: 'idx_posts_secret',
        fields: ['isSecret', 'UserId'],
        description: '비밀글 접근',
      },

      // ── Comments ───────────────────────────────────────
      {
        table: 'comments',
        name: 'idx_comments_post_created',
        fields: ['PostId', 'createdAt'],
        description: '게시글별 댓글',
      },
      {
        table: 'comments',
        name: 'idx_comments_user',
        fields: ['UserId'],
        description: '사용자별 댓글',
      },
      {
        table: 'comments',
        name: 'idx_comments_post_parent',
        fields: ['PostId', 'parentId', 'depth'],
        description: '댓글 트리 조회',
      },
      {
        table: 'comments',
        name: 'idx_comments_like_count',
        fields: ['likeCount'],
        description: '좋아요 순 정렬',
      },

      // ── Events ────────────────────────────────────────
      {
        table: 'events',
        name: 'idx_events_dates',
        fields: ['start', 'end'],
        description: '날짜 범위 조회',
      },
      {
        table: 'events',
        name: 'idx_events_user',
        fields: ['UserId'],
        description: '사용자별 이벤트',
      },
      {
        table: 'events',
        name: 'idx_events_parent',
        fields: ['parentEventId'],
        description: '반복 일정 인스턴스 조회',
      },
      { table: 'events', name: 'idx_events_title', fields: ['title'], description: '이벤트 검색' },

      // ── BoardAccess ───────────────────────────────────
      {
        table: 'board_access',
        name: 'idx_board_access_role',
        fields: ['roleId', 'boardId'],
        description: '역할별 게시판 권한',
      },
      {
        table: 'board_access',
        name: 'idx_board_access_read',
        fields: ['roleId', 'canRead'],
        description: '읽기 권한 조회',
      },

      // ── Users ─────────────────────────────────────────
      { table: 'users', name: 'idx_users_role', fields: ['role'], description: '역할별 사용자' },
      {
        table: 'users',
        name: 'idx_users_active',
        fields: ['isActive', 'role'],
        description: '활성 사용자',
      },
      {
        table: 'users',
        name: 'idx_users_last_login',
        fields: ['lastLoginAt'],
        description: '마지막 로그인 정렬',
      },

      // ── PostLike ──────────────────────────────────────
      {
        table: 'post_likes',
        name: 'idx_post_likes_post',
        fields: ['PostId'],
        description: '게시글 좋아요 집계',
      },

      // ── PostRead ──────────────────────────────────────
      {
        table: 'post_reads',
        name: 'idx_post_reads_post',
        fields: ['PostId'],
        description: '읽음 수 집계',
      },

      // ── PostBookmark ──────────────────────────────────
      {
        table: 'post_bookmarks',
        name: 'idx_post_bookmarks_user',
        fields: ['UserId', 'createdAt'],
        description: '사용자 북마크',
      },

      // ── Notifications ─────────────────────────────────
      {
        table: 'notifications',
        name: 'idx_notifications_user_read',
        fields: ['userId', 'isRead', 'createdAt'],
        description: '읽지 않은 알림',
      },

      // ── SecurityLog ───────────────────────────────────
      {
        table: 'security_logs',
        name: 'idx_security_logs_user',
        fields: ['userId', 'createdAt'],
        description: '사용자 보안 로그',
      },
      {
        table: 'security_logs',
        name: 'idx_security_logs_created',
        fields: ['createdAt'],
        description: '로그 날짜 정렬',
      },

      // ── WikiPages ─────────────────────────────────────
      {
        table: 'WikiPages',
        name: 'idx_wiki_published',
        fields: ['isPublished', 'updatedAt'],
        description: '발행된 위키',
      },
      {
        table: 'WikiPages',
        name: 'idx_wiki_title',
        fields: ['title'],
        description: '위키 제목 검색',
      },
      {
        table: 'WikiPages',
        name: 'idx_wiki_parent',
        fields: ['parentId'],
        description: '위키 트리 조회',
      },

      // ── Memos ─────────────────────────────────────────
      {
        table: 'Memos',
        name: 'idx_memos_user_pinned',
        fields: ['UserId', 'isPinned', 'order'],
        description: '사용자 메모 목록',
      },

      // ── Tags ─────────────────────────────────────────
      {
        table: 'Tags',
        name: 'idx_tags_name_board_unique',
        fields: ['name', 'boardId'],
        unique: true,
        description: '동일 게시판 내 태그명 중복 방지',
      },
      {
        table: 'Tags',
        name: 'idx_tags_board',
        fields: ['boardId'],
        description: '게시판별 태그 조회',
      },

      // ── Reports ──────────────────────────────────────
      {
        table: 'Reports',
        name: 'idx_reports_status',
        fields: ['status', 'createdAt'],
        description: '신고 상태별 조회',
      },
      {
        table: 'Reports',
        name: 'idx_reports_target',
        fields: ['targetType', 'targetId'],
        description: '대상별 신고 조회',
      },

      // ── UserSession ───────────────────────────────────
      {
        table: 'user_sessions',
        name: 'idx_user_sessions_expires',
        fields: ['expiresAt', 'isActive'],
        description: '만료 세션 정리',
      },

      // ── AuditLog ──────────────────────────────────────
      {
        table: 'audit_logs',
        name: 'idx_audit_logs_admin',
        fields: ['adminId', 'createdAt'],
        description: '관리자 감사 로그',
      },
      {
        table: 'audit_logs',
        name: 'idx_audit_logs_action',
        fields: ['action', 'createdAt'],
        description: '액션별 감사 로그',
      },

      // ── LoginHistory ──────────────────────────────────
      {
        table: 'login_histories',
        name: 'idx_login_history_user',
        fields: ['userId', 'createdAt'],
        description: '사용자 로그인 이력',
      },
    ];

    let added = 0;
    let skipped = 0;
    let failed = 0;

    for (const index of indexes) {
      try {
        // 테이블 존재 여부 먼저 확인
        const tableExists = await queryInterface
          .showIndex(index.table)
          .then(() => true)
          .catch(() => false);

        if (!tableExists) {
          logger.warn(`⏭️  테이블 없음: ${index.table} (${index.name})`);
          skipped++;
          continue;
        }

        const existingIndexes = (await queryInterface.showIndex(index.table)) as { name: string }[];
        const indexExists = existingIndexes.some(idx => idx.name === index.name);

        if (indexExists) {
          skipped++;
          continue;
        }

        await queryInterface.addIndex(index.table, {
          name: index.name,
          fields: index.fields,
          unique: index.unique,
        });

        logger.info(`✅ ${index.name} — ${index.description}`);
        added++;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`⚠️  ${index.name} 실패: ${msg}`);
        failed++;
      }
    }

    logger.info(`✅ 인덱스 처리 완료 — 추가: ${added}, 스킵: ${skipped}, 실패: ${failed}`);
  } catch (error) {
    logger.error('❌ 인덱스 추가 중 오류 발생:', error);
    throw error;
  }
}

// 직접 실행 시
if (require.main === module) {
  void (async () => {
    try {
      await sequelize.authenticate();
      await addDatabaseIndexes();
      await sequelize.close();
      process.exit(0);
    } catch (error) {
      logger.error('스크립트 실행 실패:', error);
      process.exit(1);
    }
  })();
}
