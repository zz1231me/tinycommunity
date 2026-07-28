/// <reference path="./types/express/index.d.ts" />
// ============================================================================
// server/src/index.ts
// Express 5.1 + TypeScript 5.8 + 통합 업로드 미들웨어
// ============================================================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';

// ✅ 환경변수 먼저 로드 및 검증
dotenv.config();
import { validateEnv, env } from './config/env';
validateEnv();

// ✅ 유틸리티
import { logger, requestLogger, logError } from './utils/logger';
import { getCacheStats } from './utils/cache';
import { sendSuccess, sendError } from './utils/response';
// ✅ Swagger 설정
import { swaggerSpec } from './config/swagger';

// ✅ 미들웨어
import { authenticate } from './middlewares/auth.middleware';
import { errorHandler, notFoundHandler, AppError } from './middlewares/error.middleware';
import { dynamicRateLimit } from './middlewares/dynamicRateLimit';
import { maintenanceMiddleware } from './middlewares/maintenance.middleware';
import { csrfProtection } from './middlewares/csrf.middleware';

// ✅ 업로드 디렉토리 초기화
import { initializeUploadDirs } from './middlewares/upload/utils';

// ✅ 라우트
import authRoutes from './routes/auth.routes';
import postRoutes from './routes/post.routes';
import adminRoutes from './routes/admin.routes';
import eventRoutes from './routes/event.routes';
import uploadRoutes from './routes/upload.routes';
import boardRoutes from './routes/board.routes';
import commentRoutes from './routes/comment.routes';
import bookmarkRoutes from './routes/bookmark.routes';
import siteSettingsRoutes from './routes/siteSettings';
import twoFactorRoutes from './routes/twoFactor.routes';
import notificationRoutes from './routes/notification.routes';
import userRoutes from './routes/user.routes';
import memoRoutes from './routes/memo.routes';
import wikiRoutes from './routes/wiki.routes';
import tagRoutes from './routes/tag.routes';
import reportRoutes from './routes/report.routes';
import boardManagerRoutes from './routes/boardManager.routes';
import customPageRoutes from './routes/customPage.routes';
import announcementRoutes from './routes/announcement.routes';

// ✅ 데이터베이스 설정
import {
  sequelize,
  initializeDatabase,
  closeDatabaseConnection,
  checkDatabaseHealth,
} from './config/sequelize';

// ✅ SPA index.html OG 메타 주입(링크 미리보기용)
import { renderIndexHtml } from './utils/indexHtml';

// ✅ 검색용 평문 추출(contentText 백필)
import { extractSearchText } from './utils/contentRenderer';

// ✅ 모든 모델 import (관계 설정 포함)
import './models';
// ✅ 디버그 엔드포인트에서 직접 참조하기 위한 모델 import
import { User as UserModel } from './models/User';
import { Role as RoleModel } from './models/Role';
import { Post as PostModel } from './models/Post';
import { Comment as CommentModel } from './models/Comment';
import Board from './models/Board';
import BoardAccess from './models/BoardAccess';
import Event from './models/Event';
import EventPermission from './models/EventPermission';
import { WikiPage as WikiPageModel } from './models/WikiPage';
import Bookmark from './models/Bookmark';
import { SiteSettings as SiteSettingsModel } from './models/SiteSettings';

// ✅ DB 인덱스 생성
import { addDatabaseIndexes } from './scripts/add-indexes';

// ✅ 로그 자동 정리
import { securityLogService } from './services/securityLog.service';
import { errorLogService } from './services/errorLog.service';
import { loginHistoryService } from './services/loginHistory.service';
import { auditLogService } from './services/auditLog.service';
import { userSessionService } from './services/userSession.service';
import { getIpRuleCache } from './services/ipRule.service';
import { postService } from './services/post.service';
import { loadSettingsCache, getSettings } from './utils/settingsCache';
import { refreshUploaders } from './middlewares/upload/refresh';

/**
 * 오래된 로그 자동 정리
 * - 보안 로그: 90일 이상 보존 (기본값)
 * - 에러 로그: 30일 이상 보존 (기본값)
 */
async function runLogCleanup(): Promise<void> {
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

const app = express();
const PORT = env.PORT;

// ============================================================================
// ✅ SQLite 마이그레이션 헬퍼 — 모델에 추가된 신규 컬럼을 누락 없이 보강
// ============================================================================
// 모델에 추가된 신규 컬럼을 DB에 보강한다(모든 dialect + 모든 테이블).
// Sequelize QueryInterface(describeTable/addColumn)를 사용하므로 dialect에 맞는 SQL이 자동 생성된다.
// SQLite는 sync({alter})를 못 쓰고, 그 외 DB(MariaDB 등)도 alter:true가 컬럼을 못 붙이는 경우가
// 있어, 이 보강을 안전망으로 모든 DB에서 실행한다. 마이그레이션 도구가 없는 환경에서 모델에
// 컬럼이 추가돼도 재시작만으로 "no such column" 류 오류를 막는다.
// - 이미 있는 컬럼은 건너뜀 (idempotent)
// - VIRTUAL(가상 컬럼)·PK는 보강 대상 아님
// - NOT NULL인데 기본값 없는 신규 컬럼은 기존 행 때문에 추가 실패할 수 있어 경고만 남김(수동 처리 필요)
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
    // sync가 테이블을 생성했어야 정상 — 조회 실패 시 해당 테이블 보강을 건너뛰되,
    // 스키마 진단이 목적인 기능이므로 조용히 넘기지 않고 경고를 남긴다.
    const msg = err instanceof Error ? err.message : String(err);
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
async function ensureAllModelColumns(): Promise<void> {
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
async function backfillSearchText(): Promise<void> {
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
async function consolidateSiteSettings(): Promise<void> {
  const { SiteSettings } = await import('./models/SiteSettings');
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

// ============================================================================
// ✅ 초기 데이터 자동 생성
// ============================================================================
async function initializeDefaultData() {
  try {
    const { Role } = await import('./models/Role');
    const { User } = await import('./models/User');
    const { SiteSettings } = await import('./models/SiteSettings');

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
      // ✅ 기존 admin 계정이 비활성화되어 있으면 활성화
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
    const { default: EventPermission } = await import('./models/EventPermission');
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

    logger.info('✅ 초기 데이터 확인/생성 완료');
  } catch (error) {
    logger.error('❌ 초기 데이터 생성 실패:', error);
    throw error;
  }
}

// ============================================================================
// ✅ Express 설정
// ============================================================================
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:
          env.NODE_ENV === 'production'
            ? ["'self'"]
            : ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // 개발 모드에서만 허용
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        // 동영상 임베드 신뢰 호스트만 허용 — client/server sanitizer allowlist와 동기화
        frameSrc: [
          "'self'",
          'https://www.youtube.com',
          'https://youtube.com',
          'https://www.youtube-nocookie.com',
          'https://youtube-nocookie.com',
          'https://player.vimeo.com',
        ],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    dnsPrefetchControl: { allow: false },
    ieNoOpen: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  })
);

app.disable('x-powered-by');

// ✅ Proxy 신뢰 설정 (rate limiter가 실제 클라이언트 IP를 올바르게 인식하도록)
if (env.NODE_ENV === 'production') {
  app.set('trust proxy', 1); // 프로덕션: 첫 번째 프록시(nginx 등)만 신뢰
} else {
  app.set('trust proxy', false); // 개발: 프록시 신뢰 비활성화
}

app.use(
  compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);

// CORS_ALLOW_ALL=true 이면 모든 origin 허용
// nginx가 이미 IP 수준에서 외부를 차단하는 인트라넷 환경에서 권장
const CORS_ALLOW_ALL = process.env.CORS_ALLOW_ALL === 'true';

// 표준 사설망 IP 대역 (192.168.x.x / 10.x.x.x / 172.16-31.x.x)
const PRIVATE_NETWORK_REGEX =
  /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

// 회사 전용 IP/hostname 패턴 — 환경변수로 추가 가능
// 예: CORS_IP_PATTERN=^https?:\/\/20\.\d+\.\d+\.\d+(:\d+)?$
const CORS_IP_PATTERN = process.env.CORS_IP_PATTERN
  ? new RegExp(process.env.CORS_IP_PATTERN)
  : null;

const LOCALHOST_ORIGINS = [
  'http://localhost',
  'http://localhost:80',
  'http://localhost:5173',
  'http://localhost:8080',
  'http://127.0.0.1',
  'http://127.0.0.1:80',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
];

// 추가 허용 origin 목록 — 환경변수로 지정
// 예: CORS_ORIGINS=https://example.com,http://tinycommunity.local:8080
const EXTRA_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

/** origin 이 허용 목록에 속하는지 검사 */
function isOriginAllowed(origin: string): boolean {
  if (CORS_ALLOW_ALL) return true;
  if (LOCALHOST_ORIGINS.includes(origin)) return true;
  if (PRIVATE_NETWORK_REGEX.test(origin)) return true;
  if (CORS_IP_PATTERN?.test(origin)) return true;
  if (EXTRA_ORIGINS.includes(origin)) return true;
  return false;
}

app.use(
  cors({
    origin: (origin, callback) => {
      // origin 없는 요청 (서버 간 호출, curl, nginx 내부 프록시 등) 허용
      if (!origin) return callback(null, true);

      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }

      // 차단 — 로그에 origin 명시하여 디버깅 용이하게
      // AppError(403)로 전달해야 errorHandler가 클라이언트 오류(4xx)로 처리한다.
      // plain Error는 statusCode가 없어 500 + critical 에러로그로 오인된다.
      logger.warn(`CORS 차단: ${origin}`);
      callback(new AppError(403, `CORS 차단: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 600,
  })
);

// ✅ app.use(cors()) 가 preflightContinue:false(기본값) 로 OPTIONS 응답을 이미 종료하므로
//    별도의 app.options() 등록은 불필요. 잘못된 인자 없는 cors()는 모든 origin 허용 → 제거.

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

if (env.NODE_ENV === 'development') {
  app.use((req, _res, next) => {
    logger.info(`📥 ${req.method} ${req.url} from ${req.get('origin') || req.ip}`);
    next();
  });
}

// ✅ body 크기 제한을 런타임에 settingsCache에서 읽어 동적으로 적용
//    관리자가 maxFileSizeMb를 변경해도 재시작 없이 즉시 반영됨 (lazy wrapper 패턴)
//    매 요청마다 인스턴스를 새로 생성하면 raw-body 등 의존성이 매번 재초기화되어 비용 큼 →
//    현재 limitMb를 기억하고 변경 시에만 새 미들웨어 인스턴스 생성하는 메모이제이션 적용.
let _jsonLimitMb = -1;
let _jsonMiddleware: express.RequestHandler | null = null;
let _urlLimitMb = -1;
let _urlMiddleware: express.RequestHandler | null = null;

app.use((req, res, next) => {
  const limitMb = (getSettings().maxFileSizeMb ?? 100) + 10; // 10MB 여유 버퍼
  if (limitMb !== _jsonLimitMb || !_jsonMiddleware) {
    _jsonLimitMb = limitMb;
    _jsonMiddleware = express.json({
      limit: `${limitMb}mb`,
      strict: true,
      type: 'application/json',
    });
  }
  return _jsonMiddleware(req, res, next);
});
app.use((req, res, next) => {
  const limitMb = (getSettings().maxFileSizeMb ?? 100) + 10;
  if (limitMb !== _urlLimitMb || !_urlMiddleware) {
    _urlLimitMb = limitMb;
    _urlMiddleware = express.urlencoded({
      extended: true,
      limit: `${limitMb}mb`,
      parameterLimit: 10000,
    });
  }
  return _urlMiddleware(req, res, next);
});
app.use(cookieParser());

if (env.NODE_ENV === 'development') {
  app.use(requestLogger);
}

if (env.NODE_ENV === 'development') {
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'TinyCommunity API 문서',
    })
  );
  logger.info('📚 Swagger UI: http://127.0.0.1:' + PORT + '/api-docs');
}

// ✅ 보안 에러 로깅 (권한 거부 403·비정상 요청 429만 요청 패킷과 함께 에러 로그에 기록)
import { securityErrorLogger } from './middlewares/securityErrorLogger';
app.use(securityErrorLogger);

// ✅ CSRF 보호 (X-Requested-With 헤더 검증, sameSite:lax 쿠키와 이중 방어)
app.use('/api', csrfProtection);

app.use('/api', dynamicRateLimit);
app.use('/api', maintenanceMiddleware);

app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/boards', boardRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/site-settings', siteSettingsRoutes);
app.use('/api/2fa', twoFactorRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/memos', memoRoutes);
app.use('/api/wiki', wikiRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/board-managers', boardManagerRoutes);
app.use('/api/custom-pages', customPageRoutes);
app.use('/api/announcements', announcementRoutes);

const imageStaticOptions = {
  maxAge: env.NODE_ENV === 'production' ? '1y' : 0,
  etag: true,
  lastModified: true,
  index: false,
  setHeaders: (res: express.Response) => {
    // ✅ 이미지/아바타는 브라우저 표시 허용 (Inline)
    res.set('Content-Disposition', 'inline');
    res.set('X-Content-Type-Options', 'nosniff');
  },
};

app.use(
  '/uploads/images',
  authenticate as express.RequestHandler,
  express.static(path.resolve(__dirname, '../uploads/images'), imageStaticOptions)
);
// ⚠️ 첨부파일(uploads/files)은 정적 서빙하지 않는다.
//    정적 서빙은 authenticate만 거쳐 게시판 읽기 권한/비밀글 접근 검증을 우회하므로(IDOR),
//    모든 첨부 다운로드는 인가 로직이 있는 GET /api/uploads/download/:filename 으로만 제공한다.
//    (fileStaticOptions의 Content-Disposition:attachment 등 보안 헤더는 해당 라우트에서 동일하게 설정됨)
app.use(
  '/uploads/avatars',
  express.static(path.resolve(__dirname, '../uploads/avatars'), imageStaticOptions)
);

// ✅ 클라이언트 빌드 서빙 (npm 프로덕션 모드 — 별도 정적 서버 불필요)
// NODE_ENV !== 'development' 이고 client/dist가 존재하면 Express가 직접 서빙
const clientDistPath = path.resolve(__dirname, '../../client/dist');
const clientIndexPath = path.join(clientDistPath, 'index.html');
const clientBuildExists = env.NODE_ENV !== 'development' && fs.existsSync(clientIndexPath);

if (clientBuildExists) {
  app.use(
    express.static(clientDistPath, {
      index: false,
      maxAge: env.NODE_ENV === 'production' ? '1d' : 0,
      etag: true,
    })
  );
  // SPA 폴백: /api, /uploads 이외 모든 경로에 index.html 반환
  // Express 5는 app.get(/regex/) 미지원 → app.use + path 검사 방식 사용
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      next();
      return;
    }
    res.set('Cache-Control', 'no-store');
    // 현재 사이트 설정을 OG/타이틀 메타에 주입해 응답 (링크 미리보기 크롤러 대응)
    void renderIndexHtml(clientIndexPath)
      .then(html => res.type('html').send(html))
      .catch(err => {
        logError('index.html 렌더 실패 — sendFile 폴백', err);
        res.sendFile(clientIndexPath, sendErr => {
          if (sendErr) sendError(res, 500, '클라이언트 파일을 불러올 수 없습니다.');
        });
      });
  });
  logger.info(`✅ 클라이언트 빌드 서빙 활성화: ${clientDistPath}`);
} else {
  // 클라이언트 빌드 없음(개발 모드 등) — API 상태 확인용 루트 엔드포인트
  app.get('/', (_req, res) => {
    res.json({ success: true, message: 'API 서버가 정상 작동 중입니다.', version: '1.0.0' });
  });
}

app.get('/api/health', async (_req, res) => {
  const dbHealth = await checkDatabaseHealth();
  const dbInfo =
    env.NODE_ENV !== 'production'
      ? {
          ...dbHealth,
          type: env.DB_TYPE,
          host: env.DB_TYPE !== 'sqlite' ? env.DB_HOST : 'file',
          port: env.DB_TYPE !== 'sqlite' ? env.DB_PORT : null,
          name: env.DB_TYPE !== 'sqlite' ? env.DB_NAME : env.DB_STORAGE,
        }
      : {
          ...dbHealth,
          status: 'connected',
        };

  // ✅ 업로드 디렉토리 접근 가능 여부 확인
  const uploadDirs = {
    images: path.resolve(__dirname, '../uploads/images'),
    files: path.resolve(__dirname, '../uploads/files'),
    avatars: path.resolve(__dirname, '../uploads/avatars'),
  };
  const uploadStatus: Record<string, boolean> = {};
  for (const [key, dir] of Object.entries(uploadDirs)) {
    uploadStatus[key] = fs.existsSync(dir);
  }
  const uploadsHealthy = Object.values(uploadStatus).every(Boolean);

  // ✅ 캐시 통계
  const cacheStats = getCacheStats();

  sendSuccess(
    res,
    {
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      database: dbInfo,
      port: PORT,
      cache: {
        status: 'ok',
        keys: cacheStats.keys,
        hits: cacheStats.hits,
        misses: cacheStats.misses,
      },
      uploads: {
        status: uploadsHealthy ? 'ok' : 'degraded',
        directories: uploadStatus,
      },
      features: {
        swagger: env.NODE_ENV === 'development',
        rateLimit: true,
        cache: true,
        logger: true,
        multiDatabase: true,
        avatar: true,
        helmet: true,
        compression: true,
        uploadMiddleware: 'unified',
        csrfProtection: true,
        zodValidation: true,
      },
    },
    '✅ API 서버 정상 작동'
  );
});

if (env.NODE_ENV === 'development') {
  app.get('/api/__cache-stats', (_req, res) => {
    sendSuccess(res, getCacheStats());
  });

  app.get('/api/__debug-upload-path', (_req, res) => {
    const imagePath = path.resolve(__dirname, '../uploads/images');
    const filePath = path.resolve(__dirname, '../uploads/files');
    const avatarPath = path.resolve(__dirname, '../uploads/avatars');
    const listFiles = (dir: string) => {
      try {
        return fs.readdirSync(dir).slice(0, 20); // 최대 20개
      } catch {
        return [];
      }
    };
    sendSuccess(res, {
      paths: { images: imagePath, files: filePath, avatars: avatarPath },
      exists: {
        images: fs.existsSync(imagePath),
        files: fs.existsSync(filePath),
        avatars: fs.existsSync(avatarPath),
      },
      files: {
        images: listFiles(imagePath),
        files: listFiles(filePath),
        avatars: listFiles(avatarPath),
      },
    });
  });

  app.get('/api/__debug-models', (_req, res) => {
    sendSuccess(res, {
      models: {
        User: !!UserModel,
        Role: !!RoleModel,
        Post: !!PostModel,
        Comment: !!CommentModel,
        Board: !!Board,
        BoardAccess: !!BoardAccess,
        Event: !!Event,
        EventPermission: !!EventPermission,
        Bookmark: !!Bookmark,
        SiteSettings: !!SiteSettingsModel,
      },
      associations: {
        User: Object.keys(UserModel.associations || {}),
        Role: Object.keys(RoleModel.associations || {}),
        Post: Object.keys(PostModel.associations || {}),
        Comment: Object.keys(CommentModel.associations || {}),
        Board: Object.keys(Board.associations || {}),
        BoardAccess: Object.keys(BoardAccess.associations || {}),
        Event: Object.keys(Event.associations || {}),
        EventPermission: Object.keys(EventPermission.associations || {}),
      },
    });
  });

  app.get('/api/__debug-database', (_req, res) => {
    sendSuccess(res, {
      type: env.DB_TYPE,
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      ssl: env.DB_SSL,
      storage: env.DB_STORAGE,
    });
  });

  app.get('/api/__debug-cookies', (req, res) => {
    sendSuccess(res, {
      cookies: req.cookies,
      signedCookies: req.signedCookies,
      headers: req.headers.cookie,
    });
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async () => {
  try {
    logger.info('🔄 API 서버 초기화 시작...');

    // ✅ 업로드 디렉토리 초기화
    logger.info('📁 업로드 디렉토리 초기화 중...');
    await initializeUploadDirs();
    logger.info('✅ 업로드 디렉토리 초기화 완료');

    logger.info('🗄️ 데이터베이스 초기화 중...');
    await initializeDatabase();

    logger.info('🔄 테이블 동기화 시작...');
    // ★모든 DB에서 alter:false. alter:true는 위험하다:
    //   - SQLite: column 변경 시 backup→drop→rename 패턴이라 FK 제약에서 실패 가능.
    //   - MySQL/MariaDB: 재시작마다 unique/인덱스를 기존 것 감지 못 하고 중복 추가(email_2, email_3 …)
    //     → 결국 'ER_TOO_MANY_KEYS: max 64 keys' 로 시작이 깨진다(치명).
    //   누락된 컬럼은 아래 ensureAllModelColumns()가 QueryInterface(dialect 무관)로 직접 ADD한다.
    const syncOptions = { alter: false, force: false };
    await sequelize.sync(syncOptions);
    logger.info('✅ 테이블 동기화 완료');

    // 모델에 추가된 신규 컬럼 보강 — 모든 DB(sqlite/mysql/mariadb/postgres) + 모든 테이블.
    // sync alter가 컬럼을 못 붙인 경우의 안전망(QueryInterface로 dialect 자동 처리).
    await ensureAllModelColumns();

    // 기존 게시글/위키/이벤트의 검색용 평문 백필 — 신규 컬럼이 추가된 직후 1회 실행
    await backfillSearchText();

    // 중복 site_settings 행 정리(싱글턴 보장) — 비결정적 읽기로 옛 설정값이 보이는 문제 방지
    await consolidateSiteSettings();

    await initializeDefaultData();

    logger.info('⚙️ 설정 캐시 로드 중...');
    await loadSettingsCache();
    // 캐시 로드 후 업로더를 재빌드해 DB에 저장된 파일 크기·개수 한도를 반영한다.
    // (업로더 인스턴스는 import 시점에 기본값으로 빌드되므로 재빌드하지 않으면 DB 설정이 무시된다.)
    refreshUploaders();
    logger.info('✅ 설정 캐시 로드 완료');

    logger.info('🔍 DB 인덱스 확인/생성 중...');
    await addDatabaseIndexes();
    logger.info('✅ DB 인덱스 확인/생성 완료');

    logger.info('🚦 Rate Limiting 매니저 초기화 시작...');
    const { rateLimitManager } = await import('./middlewares/dynamicRateLimit');
    await rateLimitManager.initialize();
    logger.info('✅ Rate Limiting 매니저 초기화 완료');

    // ✅ 로그 자동 정리 (시작 시 1회 + 24시간 주기)
    await runLogCleanup();
    setInterval(
      () => {
        void runLogCleanup();
      },
      24 * 60 * 60 * 1000
    );

    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 API 서버 시작: http://0.0.0.0:${PORT}`);
      logger.info(`   📍 로컬 접속: http://127.0.0.1:${PORT}`);
      logger.info(`   📍 로컬 접속: http://localhost:${PORT}`);
      logger.info('   ✅ 통합 업로드 미들웨어 활성화');
      logger.info('');
      logger.info(
        '📌 기본 관리자 계정: ID=admin (비밀번호는 환경변수 ADMIN_DEFAULT_PASSWORD 참조)'
      );
      logger.warn('   ⚠️  보안을 위해 admin 비밀번호를 반드시 변경하세요!');

      // 프로덕션에서 관리자 IP 화이트리스트가 비어 있으면 관리자 페이지가 전 IP에 노출됨 → 부팅 시 경고
      void getIpRuleCache()
        .then(cache => {
          const envWhitelist = (process.env.ALLOWED_ADMIN_IPS ?? '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
          const total = cache.whitelist.length + envWhitelist.length;
          if (process.env.NODE_ENV === 'production' && total === 0) {
            logger.error(
              '🚨 [보안경고] 관리자 IP 화이트리스트가 설정되지 않았습니다 — 관리자 엔드포인트가 모든 IP에 노출됩니다. ALLOWED_ADMIN_IPS 또는 DB 화이트리스트를 설정하세요.'
            );
          }
        })
        .catch(() => {});
    });
  } catch (error) {
    logger.error('❌ API 서버 시작 실패:', error);
    // ★시작 실패 원인은 환경(NODE_ENV)과 무관하게 항상 출력. Sequelize DB 에러는 실제 SQL·ER코드가
    //   error.sql / error.original(parent)에 들어있으므로 그 필드를 직접 뽑아 보여준다.
    console.error('─── 시작 실패 상세 ───');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = error as any;
    console.error('name   :', e?.name);
    console.error('message:', e?.message);
    if (e?.sql) console.error('SQL    :', e.sql);
    const orig = e?.original || e?.parent;
    if (orig) {
      console.error('DB code:', orig.code, '| errno:', orig.errno, '| sqlState:', orig.sqlState);
      console.error('DB msg :', orig.sqlMessage || orig.message);
    }
    if (!e?.sql && !orig) console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exit(1);
  }
};

process.on('unhandledRejection', (reason, _promise) => {
  logger.error('❌ Unhandled Rejection:', reason);
  console.error(reason instanceof Error ? (reason.stack ?? reason.message) : reason);
  process.exit(1);
});

process.on('uncaughtException', error => {
  logger.error('❌ Uncaught Exception:', error);
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});

process.on('SIGTERM', () => {
  void (async () => {
    logger.info('⚠️ SIGTERM 수신, 서버 종료 중...');
    await closeDatabaseConnection();
    process.exit(0);
  })();
});

process.on('SIGINT', () => {
  void (async () => {
    logger.info('⚠️ SIGINT 수신, 서버 종료 중...');
    await closeDatabaseConnection();
    process.exit(0);
  })();
});

// 테스트 환경에서는 서버를 시작하지 않음
if (require.main === module) {
  void startServer();
}

export { app };
