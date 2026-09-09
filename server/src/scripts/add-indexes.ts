// server/src/scripts/add-indexes.ts
// 데이터베이스 성능 최적화를 위한 인덱스 추가 스크립트

import { sequelize } from '../config/sequelize';
import { logger } from '../utils/logger';

interface IndexDef {
  /**
   * 모델의 tableName 과 대소문자까지 일치해야 한다.
   *
   * SQLite 는 테이블 이름의 대소문자를 가리지 않지만 리눅스의 MySQL/MariaDB 는 가린다.
   * 이름이 어긋나면 이 스크립트가 '테이블 없음' 으로 건너뛰고 실패 0 으로 보고하므로,
   * 인덱스가 만들어지지 않은 것을 알아채기 어렵다. indexTableNames.test.ts 가 지킨다.
   */
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
      // ── PostTags ───────────────────────────────────────
      // 복합 PK 가 (PostId, TagId) 라 TagId 로 시작하는 조회(태그 클라우드,
      // 태그별 글)에는 쓰이지 못한다. 반대 순서 인덱스를 따로 둔다.
      {
        table: 'PostTags',
        name: 'idx_posttags_tag_post',
        fields: ['TagId', 'PostId'],
        description: '태그별 게시글 (태그 클라우드·태그 필터)',
      },
      // ── Posts ────────────────────────────��─────────────
      {
        table: 'Posts',
        name: 'idx_posts_user_created',
        fields: ['UserId', 'createdAt'],
        description: '사용자별 게시글',
      },
      { table: 'Posts', name: 'idx_posts_title', fields: ['title'], description: '제목 검색' },
      {
        table: 'Posts',
        name: 'idx_posts_view_count',
        fields: ['viewCount'],
        description: '조회수 정렬',
      },
      // 전체 검색 (LIKE %term%) — content 길이 때문에 title만
      {
        table: 'Posts',
        name: 'idx_posts_status_board',
        fields: ['status', 'boardType'],
        description: '상태+게시판 복합',
      },
      {
        table: 'Posts',
        name: 'idx_posts_pinned_board',
        fields: ['isPinned', 'boardType', 'createdAt'],
        description: '핀 고정 게시글',
      },
      {
        table: 'Posts',
        name: 'idx_posts_secret',
        fields: ['isSecret', 'UserId'],
        description: '비밀글 접근',
      },

      // ── Comments ───────────────────────────────────────
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
      { table: 'Events', name: 'idx_events_title', fields: ['title'], description: '이벤트 검색' },

      // ── BoardAccess ───────────────────────────────────
      // ⚠️ 테이블명은 Sequelize 가 만든 실제 이름과 정확히 일치해야 한다('board_accesses').
      //    BoardAccess 모델에는 indexes 정의가 없어 이 스크립트가 유일한 인덱스 출처다.
      {
        table: 'board_accesses',
        name: 'idx_board_access_role',
        fields: ['roleId', 'boardId'],
        description: '역할별 게시판 권한',
      },
      {
        table: 'board_accesses',
        name: 'idx_board_access_read',
        fields: ['roleId', 'canRead'],
        description: '읽기 권한 조회(접근 가능 게시판 목록)',
      },

      // ── Users ─────────────────────────────────────────
      {
        table: 'users',
        name: 'idx_users_active',
        fields: ['isActive', 'role'],
        description: '활성 사용자',
      },

      // 여기에 적지 않는 것들 — 모델의 indexes 옵션이 이미 같은 인덱스를 만든다.
      //
      // 두 곳에서 만들면 이름만 다른 같은 인덱스가 두 벌 생긴다. 읽기 이득은 없고
      // INSERT/UPDATE/DELETE 마다 두 벌을 갱신하는 비용만 늘어난다.
      //
      // 대상: PostLike · PostRead · LoginHistory · Posts(boardType,createdAt)
      //      comments(PostId,createdAt) · comments(UserId) · Events(start,end)
      //      Events(UserId) · Events(parentEventId) · users(role) · users(lastLoginAt)
      //      security_logs(createdAt) · WikiPages(parentId) · Reports(targetType,targetId)
      //      audit_logs(adminId,createdAt) · Tags(name,boardId)
      //
      // 새 인덱스를 넣기 전에 해당 모델의 indexes 옵션을 먼저 확인할 것.

      // ── Notifications ─────────────────────────────────
      {
        table: 'Notifications',
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
        name: 'idx_audit_logs_action',
        fields: ['action', 'createdAt'],
        description: '액션별 감사 로그',
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
