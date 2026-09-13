// server/src/config/bootstrap.ts
// 서버 기동 시 DB를 사용 가능한 상태로 만드는 절차와, 주기적 정리 작업.
//
// index.ts 에서 분리했다 — 미들웨어·라우트 설정과 섞여 있어 "부팅 시 무슨 일이
// 일어나는가"를 따라가기 어려웠다. 여기 있는 함수는 모두 idempotent 라서
// 재기동을 반복해도 안전하다.

import { DataTypes } from 'sequelize';
import { sequelize } from './sequelize';
import { assertFeatureCatalog } from './features';
import { env } from './env';
import { logger } from '../utils/logger';
import { extractSearchText } from '../utils/contentRenderer';
import { getSettings } from '../utils/settingsCache';
import { Post as PostModel } from '../models/Post';
import { WikiPage as WikiPageModel } from '../models/WikiPage';
import Event from '../models/Event';
import { securityLogService } from '../services/securityLog.service';
import { errorLogService } from '../services/errorLog.service';
import { loginHistoryService } from '../services/loginHistory.service';
import { auditLogService } from '../services/auditLog.service';
import { userSessionService } from '../services/userSession.service';
import { postService } from '../services/post.service';

/**
 * 오래된 로그 자동 정리
 * - 보안 로그: 90일 이상 보존 (기본값)
 * - 에러 로그: 30일 이상 보존 (기본값)
 */
export async function runLogCleanup(): Promise<void> {
  try {
    const { securityLogRetentionDays, errorLogRetentionDays, deletedPostRetentionDays } =
      getSettings();

    const [secDeleted, errDeleted, loginDeleted, auditDeleted, sessionDeleted, postsPurged] =
      await Promise.all([
        securityLogService.deleteOldLogs(securityLogRetentionDays),
        errorLogService.deleteOldLogs(errorLogRetentionDays),
        loginHistoryService.deleteOldRecords(90),
        auditLogService.deleteOldLogs(365),
        userSessionService.cleanExpiredSessions(),
        // 삭제된 게시글: soft-delete 후 보관 기간(관리자 설정값)이 지나면 DB에서 영구 삭제
        postService.purgeExpiredPosts(deletedPostRetentionDays),
      ]);

    if (
      secDeleted > 0 ||
      errDeleted > 0 ||
      loginDeleted > 0 ||
      auditDeleted > 0 ||
      sessionDeleted > 0 ||
      postsPurged > 0
    ) {
      logger.info(
        `🗑️ 자동 정리 완료 — 보안로그: ${secDeleted}건, 에러로그: ${errDeleted}건, 로그인이력: ${loginDeleted}건, 감사로그: ${auditDeleted}건, 세션: ${sessionDeleted}건, 만료게시글: ${postsPurged}건 삭제`
      );
    }
  } catch (error) {
    logger.error('자동 정리 실패:', error);
  }
}

// 모델에 추가된 신규 컬럼을 DB 에 보강한다(모든 dialect + 모든 테이블).
// Sequelize QueryInterface(describeTable/addColumn)를 쓰므로 dialect 에 맞는 SQL 이 생성된다.
// SQLite 는 sync({alter}) 를 쓸 수 없고 MariaDB 등도 alter:true 가 컬럼을 붙이지 못하는
// 경우가 있어, 마이그레이션 도구 없이도 재시작만으로 "no such column" 을 막는 안전망이다.
// - 이미 있는 컬럼은 건너뜀 (idempotent)
// - VIRTUAL(가상 컬럼)·PK 는 보강 대상 아님
// - NOT NULL 인데 기본값 없는 신규 컬럼은 기존 행 때문에 실패할 수 있어 경고만 남김(수동 처리)
async function ensureModelColumns(model: (typeof sequelize.models)[string]): Promise<void> {
  const qi = sequelize.getQueryInterface();
  const rawTableName = model.getTableName();
  const tableName = typeof rawTableName === 'string' ? rawTableName : rawTableName.tableName;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawAttributes = (model as any).rawAttributes as Record<string, any>;

  let existing: Record<string, unknown>;
  try {
    existing = await qi.describeTable(tableName);
  } catch (err) {
    // 이 함수는 sync 보다 먼저 돌기 때문에(index.ts 의 순서 주석 참고) 새 DB 에서는
    // 아직 테이블이 없는 것이 정상이다. 그 경우까지 경고를 찍으면 첫 기동 로그가
    // 경고로 뒤덮여 진짜 문제가 묻힌다. 뒤따르는 sync 가 테이블을 제대로 만든다.
    const msg = err instanceof Error ? err.message : String(err);
    if (/no such table|doesn't exist|does not exist/i.test(msg)) return;
    logger.warn(`[${tableName}] 컬럼 보강 스킵 (테이블 조회 실패): ${msg}`);
    return;
  }

  // 타임스탬프/PK는 항상 존재 — 건너뛴다 (underscored: created_at/updated_at)
  const SKIP = new Set(['id', 'created_at', 'updated_at', 'createdAt', 'updatedAt']);

  for (const key of Object.keys(rawAttributes)) {
    const attr = rawAttributes[key];
    // VIRTUAL(DB 컬럼 없음)·PK는 ADD COLUMN 대상이 아님
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((attr.type as any)?.key === 'VIRTUAL' || attr.primaryKey) continue;
    // underscored:true면 Sequelize가 attr.field에 snake_case 컬럼명을 설정한다
    const fieldName: string = attr.field ?? key;
    if (SKIP.has(fieldName) || existing[fieldName]) continue;

    try {
      // addColumn은 dialect에 맞는 타입/기본값/NOT NULL SQL을 알아서 생성한다.
      // references는 의도적으로 생략 — 누락 컬럼 복구가 목적이며 FK 제약은 추가하지 않는다.
      await qi.addColumn(tableName, fieldName, {
        type: attr.type,
        allowNull: attr.allowNull ?? true,
        defaultValue: attr.defaultValue,
      });
      logger.info(`➕ [${tableName}] 컬럼 추가: ${fieldName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(
        `[${tableName}] 컬럼 추가 실패 (이미 있거나 NOT NULL+기본값없음): ${fieldName} - ${msg}`
      );
    }
  }
}

// 등록된 모든 모델에 대해 누락 컬럼 보강 (한 모델 실패가 전체를 막지 않도록 개별 try)
export async function ensureAllModelColumns(): Promise<void> {
  for (const model of Object.values(sequelize.models)) {
    try {
      await ensureModelColumns(model);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[${model.name}] 컬럼 보강 중 오류: ${msg}`);
    }
  }
}

// 검색용 평문 백필 — 게시글(content→contentText)/위키(content→contentText)/이벤트(body→bodyText).
// 신규 컬럼 추가 직후 기존 행은 NULL이라 검색에 잡히지 않으므로 1회 채운다.
// 원본을 건드리지 않으므로 silent(updatedAt 유지)+hooks:false로 개별 업데이트한다.
// 평문 컬럼이 NULL인 행만 대상이라 idempotent(다음 기동 시 0건).
export async function backfillSearchText(): Promise<void> {
  try {
    const posts = await PostModel.findAll({
      where: { contentText: null },
      attributes: ['id', 'content'],
    });
    for (const post of posts) {
      await PostModel.update(
        { contentText: extractSearchText(post.content || '') },
        { where: { id: post.id }, silent: true, hooks: false }
      );
    }

    const wikis = await WikiPageModel.findAll({
      where: { contentText: null },
      attributes: ['id', 'content'],
    });
    for (const wiki of wikis) {
      await WikiPageModel.update(
        { contentText: extractSearchText(wiki.content || '') },
        { where: { id: wiki.id }, silent: true, hooks: false }
      );
    }

    const events = await Event.findAll({
      where: { bodyText: null },
      attributes: ['id', 'body'],
    });
    for (const event of events) {
      await Event.update(
        { bodyText: extractSearchText(event.body || '') },
        { where: { id: event.id }, silent: true, hooks: false }
      );
    }

    if (posts.length + wikis.length + events.length > 0) {
      logger.info(
        `🔎 검색용 평문 백필 완료 — 게시글 ${posts.length} / 위키 ${wikis.length} / 이벤트 ${events.length}건`
      );
    }
  } catch (error) {
    logger.error('검색용 평문 백필 실패:', error);
  }
}

// site_settings는 싱글턴이어야 하지만 모델에 unique 제약이 없어, 과거 race(빈 테이블에 동시 요청 등)로
// 중복 행이 생겼을 수 있다. 코드 전반은 ORDER BY 없는 SiteSettings.findOne()으로 설정을 읽는데,
// 행이 2개 이상이면 DB(특히 MySQL/MariaDB)가 호출마다 다른 행을 반환할 수 있다 → 저장한 행과
// 읽는 행이 달라 "새 사이트 이름을 저장해도 옛 값이 계속 보이는" 문제가 발생한다.
// 시작 시 가장 최근 수정된 행 1개만 남기고 정리해 싱글턴을 보장한다(읽기가 결정적이 됨).
export async function consolidateSiteSettings(): Promise<void> {
  const { SiteSettings } = await import('../models/SiteSettings');
  const rows = await SiteSettings.findAll({
    order: [
      ['updatedAt', 'DESC'],
      ['id', 'ASC'],
    ],
  });
  if (rows.length <= 1) return; // 정상(0 또는 1행)이면 아무것도 하지 않음
  const [keep, ...extras] = rows;
  const extraIds = extras.map(r => r.id);
  await SiteSettings.destroy({ where: { id: extraIds } });
  logger.warn(
    `⚙️ 중복 site_settings 행 정리: 가장 최근 수정 행(id=${keep.id}) 유지, 나머지 ${extras.length}개 삭제(id=[${extraIds.join(', ')}])`
  );
}

// 초기 데이터 자동 생성
/**
 * ENUM 컬럼을 문자열로 넓힌다 (기존 설치용).
 *
 * sync({alter:false}) 로 뜨므로 모델에서 ENUM 을 문자열로 바꿔도 이미 만들어진
 * 테이블은 그대로다. MySQL/PostgreSQL 에서는 새 값을 넣는 순간 INSERT 가 깨진다.
 * SQLite 는 ENUM 을 TEXT 로 만들므로 대상이 아니다.
 *
 * 실패해도 기동은 막지 않고, 직접 실행할 SQL 을 로그에 남긴다.
 */
async function widenEnumColumn(
  table: string,
  column: string,
  length: number,
  /** 넓히지 못했을 때 무엇이 안 되는지 — 로그만 보고 판단할 수 있게 */
  symptom: string,
  /** 컬럼의 기본값. 있으면 타입을 바꾸면서 다시 붙여 준다(아래 설명) */
  defaultValue?: string
): Promise<void> {
  const dialect = sequelize.getDialect();
  if (dialect === 'sqlite') return;

  const qi = sequelize.getQueryInterface();
  try {
    const describe = await qi.describeTable(table);
    const current = String(
      (describe as Record<string, { type?: unknown }>)[column]?.type ?? ''
    ).toUpperCase();
    // 이미 문자열이면 할 일이 없다 (재기동마다 ALTER 를 돌리지 않는다)
    if (!current.includes('ENUM')) return;

    if (dialect === 'postgres') {
      // PostgreSQL 은 enum → varchar 변환에 USING 절이 필요하다.
      // 기본값이 걸려 있으면 그것부터 떼야 한다 — enum 리터럴을 varchar 로 자동 변환하지
      // 못해 "default for column cannot be cast automatically" 로 거절한다.
      if (defaultValue !== undefined) {
        await sequelize.query(`ALTER TABLE "${table}" ALTER COLUMN "${column}" DROP DEFAULT`);
      }
      await sequelize.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE VARCHAR(${length}) USING "${column}"::text`
      );
      if (defaultValue !== undefined) {
        await sequelize.query(
          `ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DEFAULT '${defaultValue}'`
        );
      }
    } else {
      // MySQL/MariaDB 의 MODIFY 는 넘긴 정의로 통째로 갈아 끼운다 —
      // 기본값을 함께 주지 않으면 조용히 사라진다.
      await qi.changeColumn(table, column, {
        type: DataTypes.STRING(length),
        allowNull: false,
        ...(defaultValue !== undefined && { defaultValue }),
      });
    }
    logger.info(`[${table}] ${column} 컬럼을 문자열로 넓혔습니다`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const mysqlDefault = defaultValue !== undefined ? ` DEFAULT '${defaultValue}'` : '';
    const pgDrop =
      defaultValue !== undefined
        ? `ALTER TABLE "${table}" ALTER COLUMN "${column}" DROP DEFAULT; `
        : '';
    const pgSet =
      defaultValue !== undefined
        ? ` ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DEFAULT '${defaultValue}';`
        : '';
    logger.warn(
      `[${table}] ${column} 컬럼 확장 실패: ${msg}\n` +
        `  ${symptom}\n` +
        `  MySQL/MariaDB: ALTER TABLE ${table} MODIFY COLUMN ${column} VARCHAR(${length}) NOT NULL${mysqlDefault};\n` +
        `  PostgreSQL:    ${pgDrop}ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE VARCHAR(${length}) USING "${column}"::text;${pgSet}`
    );
  }
}

/**
 * 값이 늘어나는 컬럼들을 문자열로 넓힌다.
 *  - Notifications.type: 알림 종류가 계속 는다 (구독·담당자 지정·메시지…)
 *  - users.theme: 테마가 계속 는다 (라이트·다크·시스템·드라큘라…)
 */
export async function widenGrowingEnums(): Promise<void> {
  await widenEnumColumn(
    'Notifications',
    'type',
    20,
    '새로운 종류의 알림이 저장되지 않을 수 있습니다.'
  );
  // theme 은 기본값이 걸려 있는 컬럼이라 기본값을 함께 넘긴다
  await widenEnumColumn(
    'users',
    'theme',
    20,
    '드라큘라 등 새 테마를 저장할 수 없습니다.',
    'system'
  );
  // 감사 종류는 기능이 늘 때마다 늘어난다. ENUM 으로 두면 새 종류가 조용히
  // 누락된다 (감사 로그 기록은 실패해도 요청을 막지 않는다).
  await widenEnumColumn('audit_logs', 'action', 40, '새 종류의 관리자 작업이 남지 않습니다.');
  await widenEnumColumn('audit_logs', 'targetType', 20, '새 대상 종류가 남지 않습니다.');
}

/**
 * 기능 카탈로그의 의존성 오타를 기동 시점에 잡는다.
 * requires 에 없는 키를 적어 두면 그 의존성은 조용히 무시되어,
 * 선행 기능을 껐는데도 파생 기능이 살아 있는 상태가 된다.
 */
export function verifyFeatureCatalog(): void {
  assertFeatureCatalog();
}

export async function initializeDefaultData() {
  try {
    const { Role } = await import('../models/Role');
    const { User } = await import('../models/User');
    const { SiteSettings } = await import('../models/SiteSettings');

    // 1. 역할 초기화
    logger.info('🔄 기본 역할 확인 중...');
    const roleCount = await Role.count();

    if (roleCount === 0) {
      logger.info('📝 기본 역할 생성 중...');
      const roles = [
        {
          id: 'admin',
          name: '관리자',
          description: '모든 권한을 가진 최고 관리자',
          isActive: true,
        },
        {
          id: 'manager',
          name: '매니저',
          description: '게시판 및 사용자 관리 권한',
          isActive: true,
        },
        { id: 'user', name: '일반 사용자', description: '기본 사용자 권한', isActive: true },
        { id: 'guest', name: '게스트', description: '읽기 전용 권한', isActive: true },
      ];

      for (const roleData of roles) {
        await Role.create(roleData);
        logger.info(`  ✅ 역할 생성: ${roleData.name}`);
      }
    } else {
      logger.info(`✅ 역할 ${roleCount}개 존재`);
    }

    // 2. 기본 admin 계정 생성
    logger.info('🔄 기본 admin 계정 확인 중...');
    const adminUser = await User.findByPk('admin', { paranoid: false }); // ✅ deletedAt 컬럼 없어도 동작

    const defaultAdminPw = env.ADMIN_DEFAULT_PASSWORD;

    if (!adminUser) {
      logger.info('📝 기본 admin 계정 생성 중...');
      await User.create({
        id: 'admin',
        password: defaultAdminPw, // 평문 전달 — beforeCreate 훅에서 해시
        name: '관리자',
        email: 'admin@tinycommunity.local',
        roleId: 'admin',
        isActive: true,
      });
      logger.info(`  ✅ admin 계정 생성 완료 (비밀번호: ADMIN_DEFAULT_PASSWORD 환경변수 값)`);
      logger.warn('  ⚠️  보안을 위해 admin 비밀번호를 반드시 변경하세요!');
    } else {
      // 기존 admin 계정이 비활성화되어 있으면 활성화
      if (!adminUser.isActive) {
        adminUser.isActive = true;
        await adminUser.save();
        logger.info('  ✅ admin 계정 활성화 완료');
      } else {
        logger.info('  ✅ admin 계정 존재 (활성화 상태)');
      }
    }

    // 3. 사이트 설정 초기화
    logger.info('🔄 사이트 설정 확인 중...');
    const siteSettings = await SiteSettings.findOne();

    if (!siteSettings) {
      logger.info('📝 기본 사이트 설정 생성 중...');
      await SiteSettings.create({
        siteName: 'TinyCommunity',
        siteTitle: 'TinyCommunity',
        description: '',
        logoUrl: null,
        faviconUrl: null,
        allowRegistration: true,
        requireApproval: false,
        maintenanceMode: false,
        maintenanceMessage: null,
        loginMessage: null,
      });
      logger.info('  ✅ 사이트 설정 생성 완료');
    } else {
      logger.info('✅ 사이트 설정 존재');
    }

    // 4. 이벤트 권한 기본값 초기화
    logger.info('🔄 이벤트 권한 확인 중...');
    const { default: EventPermission } = await import('../models/EventPermission');
    const permCount = await EventPermission.count();

    if (permCount === 0) {
      logger.info('📝 기본 이벤트 권한 생성 중...');
      const defaultPerms = [
        { roleId: 'admin', canCreate: true, canRead: true, canUpdate: true, canDelete: true },
        { roleId: 'manager', canCreate: true, canRead: true, canUpdate: true, canDelete: true },
        { roleId: 'user', canCreate: true, canRead: true, canUpdate: true, canDelete: true },
        { roleId: 'guest', canCreate: false, canRead: true, canUpdate: false, canDelete: false },
      ];
      for (const perm of defaultPerms) {
        await EventPermission.create(perm);
        logger.info(`  ✅ 이벤트 권한 생성: ${perm.roleId}`);
      }
    } else {
      logger.info(`✅ 이벤트 권한 ${permCount}개 존재`);
    }

    // 5. 출퇴근 설정·확인 항목 초기화
    //    설정 행이 없을 때만 만든다. 관리자가 항목을 모두 지웠는데 다시 생기면 안 된다.
    logger.info('🔄 출퇴근 설정 확인 중...');
    const { AttendancePolicy } = await import('../models/AttendancePolicy');
    const { AttendanceChecklistItem } = await import('../models/AttendanceChecklistItem');
    const policyExists = await AttendancePolicy.count();

    if (policyExists === 0) {
      logger.info('📝 기본 출퇴근 설정 생성 중...');
      await AttendancePolicy.create({});
      const defaultItems = [
        { label: '보안 수칙을 확인했습니다.', required: true, order: 1 },
        { label: '오늘 처리할 업무를 확인했습니다.', required: true, order: 2 },
        { label: '건강 상태에 이상이 없습니다.', required: false, order: 3 },
      ];
      for (const item of defaultItems) await AttendanceChecklistItem.create(item);
      logger.info(`  ✅ 출근 확인 항목 ${defaultItems.length}개 생성`);
    } else {
      logger.info('✅ 출퇴근 설정 존재');
    }

    logger.info('✅ 초기 데이터 확인/생성 완료');
  } catch (error) {
    logger.error('❌ 초기 데이터 생성 실패:', error);
    throw error;
  }
}
