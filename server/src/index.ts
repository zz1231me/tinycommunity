/// <reference path="./types/express/index.d.ts" />

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';

dotenv.config();
import { validateEnv, env } from './config/env';
validateEnv();

import { logger, requestLogger, logError } from './utils/logger';
import { getCacheStats } from './utils/cache';
import { sendSuccess, sendError } from './utils/response';
import { swaggerSpec } from './config/swagger';

import { authenticate } from './middlewares/auth.middleware';
import { errorHandler, notFoundHandler, AppError } from './middlewares/error.middleware';
import { maintenanceMiddleware } from './middlewares/maintenance.middleware';
import { csrfProtection } from './middlewares/csrf.middleware';

import { initializeUploadDirs } from './middlewares/upload/utils';

import { closeAllConnections as closeAllSseConnections } from './services/sse.service';

import authRoutes from './routes/auth.routes';
import postRoutes from './routes/post.routes';
import postDraftRoutes from './routes/postDraft.routes';
import { requireFeature } from './middlewares/featureGate.middleware';
import featureRoutes from './routes/feature.routes';
import socialRoutes from './routes/social.routes';
import messageRoutes from './routes/message.routes';
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
import pointRoutes from './routes/point.routes';
import wikiRoutes from './routes/wiki.routes';
import tagRoutes from './routes/tag.routes';
import reportRoutes from './routes/report.routes';
import boardManagerRoutes from './routes/boardManager.routes';
import customPageRoutes from './routes/customPage.routes';
import announcementRoutes from './routes/announcement.routes';
import tempShareRoutes from './routes/tempShare.routes';
import attendanceRoutes from './routes/attendance.routes';
import { cleanupExpiredTempShares } from './controllers/tempShare.controller';

import {
  sequelize,
  initializeDatabase,
  closeDatabaseConnection,
  checkDatabaseHealth,
} from './config/sequelize';

import { readAppVersion, renderIndexHtml } from './utils/indexHtml';

import './models';
import { User as UserModel } from './models/User';
import { Role as RoleModel } from './models/Role';
import { Post as PostModel } from './models/Post';
import { Comment as CommentModel } from './models/Comment';
import Board from './models/Board';
import BoardAccess from './models/BoardAccess';
import Event from './models/Event';
import EventPermission from './models/EventPermission';
import Bookmark from './models/Bookmark';
import { SiteSettings as SiteSettingsModel } from './models/SiteSettings';

import { addDatabaseIndexes } from './scripts/add-indexes';

import { getIpRuleCache } from './services/ipRule.service';
import { loadSettingsCache, getSettings } from './utils/settingsCache';

import {
  runLogCleanup,
  ensureAllModelColumns,
  backfillSearchText,
  consolidateSiteSettings,
  initializeDefaultData,
  verifyFeatureCatalog,
  widenGrowingEnums,
} from './config/bootstrap';
import { refreshUploaders } from './middlewares/upload/refresh';
import { sweepAllExpiredDuels } from './services/duel.service';

const app = express();
const PORT = env.PORT;

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:
          env.NODE_ENV === 'production'
            ? ["'self'"]
            : ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // 개발 모드에서만 허용
        // 폰트 CDN. client/index.html 이 Pretendard 를 여기서 받는다. 빠지면 프로덕션에서 시스템 폰트로 떨어진다.
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        fontSrc: ["'self'", 'data:', 'https://cdn.jsdelivr.net'],
        connectSrc: ["'self'"],
        // frame-src 만 넓게 연다. 관리자 커스텀 페이지와 게시글 동영상 임베드용이며 index.html 의 meta CSP 와 같게 맞춘다.
        frameSrc: ["'self'", 'https:', 'http:'],
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

// Proxy 신뢰 설정 (rate limiter 가 실제 클라이언트 IP 를 보게 한다)
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

/**
 * 요청이 이 서버 자신에게서 온 것인지(같은 출처인지).
 * 프로덕션에서는 Express 가 client/dist 를 직접 서빙하므로 화면과 API 가 같은 출처다.
 * 배포 주소가 바뀌어도 막히지 않도록 포트 나열 대신 요청 Host 와 비교하고, 프록시 때문에 host 만 본다.
 */
function isSameOrigin(origin: string, host: string | undefined): boolean {
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// 요청별로 옵션을 만든다 — 같은 출처인지 판단하려면 그 요청의 Host 를 알아야 한다
app.use(
  cors((req, done) => {
    done(null, {
      origin: (origin, callback) => {
        // origin 없는 요청 (서버 간 호출, curl, nginx 내부 프록시 등) 허용
        if (!origin) return callback(null, true);

        // 자기 자신에게서 온 요청 — 프로덕션에서 화면과 API 가 같은 출처인 경우
        if (isSameOrigin(origin, req.headers.host)) return callback(null, true);

        if (isOriginAllowed(origin)) {
          return callback(null, true);
        }

        // 차단. AppError(403)로 넘겨야 errorHandler 가 4xx 로 처리한다(plain Error 는 500 이 된다).
        logger.warn(`CORS 차단: ${origin}`);
        callback(new AppError(403, `CORS 차단: ${origin}`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['Content-Range', 'X-Content-Range'],
      maxAge: 600,
    });
  })
);

// cors() 가 preflightContinue:false 로 OPTIONS 응답을 종료하므로 별도 app.options() 등록은 불필요.

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

// body 크기 제한을 런타임에 settingsCache 에서 읽어 재시작 없이 반영한다.
// 매 요청마다 인스턴스를 만들면 비용이 커서 limitMb 가 바뀔 때만 새로 만든다.
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
// Express 5 는 본문 없는 요청에서 req.body 를 undefined 로 남긴다(4 는 {}). 여기서 정규화해 컨트롤러가 500 으로 떨어지지 않게 한다.
app.use((req, _res, next) => {
  if (req.body === undefined) req.body = {};
  next();
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

// 보안 에러 로깅 (권한 거부 403·비정상 요청 429만 요청 패킷과 함께 에러 로그에 기록)
import { securityErrorLogger } from './middlewares/securityErrorLogger';
import { rejectNullBytes } from './middlewares/rejectNullBytes';
app.use(securityErrorLogger);

// 널 바이트가 섞인 주소는 입구에서 400 — 안 그러면 DB 가 거절해 500 이 된다
app.use('/api', rejectNullBytes);

// CSRF 보호 (X-Requested-With 헤더 검증, sameSite:lax 쿠키와 이중 방어)
app.use('/api', csrfProtection);

app.use('/api', maintenanceMiddleware);

app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/features', featureRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/drafts', requireFeature('post.drafts'), postDraftRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/events', requireFeature('tools.calendar'), eventRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/points', pointRoutes);
app.use('/api/boards', boardRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/site-settings', siteSettingsRoutes);
app.use('/api/2fa', twoFactorRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/memos', requireFeature('tools.memo'), memoRoutes);
app.use('/api/wiki', requireFeature('tools.wiki'), wikiRoutes);
app.use('/api/tags', requireFeature('post.tags'), tagRoutes);
app.use('/api/reports', requireFeature('post.report'), reportRoutes);
app.use('/api/board-managers', boardManagerRoutes);
app.use('/api/custom-pages', customPageRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/temp-share', requireFeature('tools.tempShare'), tempShareRoutes);
app.use('/api/attendance', requireFeature('tools.attendance'), attendanceRoutes);

const imageStaticOptions = {
  maxAge: env.NODE_ENV === 'production' ? '1y' : 0,
  etag: true,
  lastModified: true,
  index: false,
  setHeaders: (res: express.Response) => {
    // 이미지/아바타는 브라우저 표시 허용 (Inline)
    res.set('Content-Disposition', 'inline');
    res.set('X-Content-Type-Options', 'nosniff');
  },
};

app.use(
  '/uploads/images',
  authenticate as express.RequestHandler,
  express.static(path.resolve(__dirname, '../uploads/images'), imageStaticOptions)
);
// 첨부파일(uploads/files)은 정적 서빙하지 않는다. 읽기 권한·비밀글 검증을 우회하므로(IDOR)
// 다운로드는 인가 로직이 있는 GET /api/uploads/download/:filename 으로만 제공한다.
app.use(
  '/uploads/avatars',
  express.static(path.resolve(__dirname, '../uploads/avatars'), imageStaticOptions)
);

// 클라이언트 빌드 서빙 — NODE_ENV !== 'development' 이고 client/dist 가 있으면 Express 가 직접 서빙
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
  // 지금 서빙 중인 빌드의 표식. 열어 둔 탭이 배포가 일어났는지 이것으로 알아챈다.
  app.get('/api/app-version', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: { version: readAppVersion(clientIndexPath) } });
  });

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

  // 업로드 디렉토리 접근 가능 여부 확인
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

  // 캐시 통계
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

/** 종료할 때 새 연결을 막고 처리 중인 요청을 기다리기 위해 들고 있는다 */
let httpServer: import('http').Server | null = null;

const startServer = async () => {
  try {
    logger.info('🔄 API 서버 초기화 시작...');

    logger.info('📁 업로드 디렉토리 초기화 중...');
    await initializeUploadDirs();
    logger.info('✅ 업로드 디렉토리 초기화 완료');

    logger.info('🗄️ 데이터베이스 초기화 중...');
    await initializeDatabase();

    // 기능 카탈로그가 스스로 모순되지 않는지 먼저 확인한다 (DB 접근 없음)
    verifyFeatureCatalog();

    // 순서 주의: 컬럼 보강이 sync 보다 먼저다. 새 컬럼을 가리키는 인덱스를 sync 가 먼저 만들면 실패한다.
    logger.info('🧩 모델 컬럼 보강 중...');
    await ensureAllModelColumns();

    logger.info('🔄 테이블 동기화 시작...');
    // 모든 DB에서 alter:false. SQLite 는 FK 제약에서 실패할 수 있고, MySQL/MariaDB 는
    // 재시작마다 인덱스를 중복 추가해 'ER_TOO_MANY_KEYS' 로 깨진다.
    // 누락된 컬럼은 위 ensureAllModelColumns()가 직접 ADD 한다.
    const syncOptions = { alter: false, force: false };
    await sequelize.sync(syncOptions);
    logger.info('✅ 테이블 동기화 완료');
    // 기존 설치의 ENUM 컬럼(알림 종류·테마)을 문자열로 넓힌다 — 값이 계속 늘어나는 컬럼들
    await widenGrowingEnums();

    // 기존 게시글/위키/이벤트의 검색용 평문 백필 — 신규 컬럼이 추가된 직후 1회 실행
    await backfillSearchText();

    // 중복 site_settings 행 정리(싱글턴 보장) — 비결정적 읽기로 옛 설정값이 보이는 문제 방지
    await consolidateSiteSettings();

    await initializeDefaultData();

    logger.info('⚙️ 설정 캐시 로드 중...');
    await loadSettingsCache();
    // 캐시 로드 후 업로더를 재빌드해야 DB 에 저장된 파일 크기·개수 한도가 반영된다.
    refreshUploaders();
    logger.info('✅ 설정 캐시 로드 완료');

    logger.info('🔍 DB 인덱스 확인/생성 중...');
    await addDatabaseIndexes();
    logger.info('✅ DB 인덱스 확인/생성 완료');

    // 로그 자동 정리 (시작 시 1회 + 24시간 주기)
    await runLogCleanup();
    setInterval(
      () => {
        void runLogCleanup();
      },
      24 * 60 * 60 * 1000
    );

    // 임시 공유 파일 정리 (시작 시 1회 + 2분 주기) — 만료(기본 15분) 링크의 디스크 파일·레코드 삭제
    void cleanupExpiredTempShares();
    setInterval(() => void cleanupExpiredTempShares(), 2 * 60 * 1000);

    // 만료된 포인트 대결 환불 (시작 시 1회 + 2분 주기). 양쪽 다 접속하지 않으면 걸어 둔 포인트가 묶인다.
    void sweepAllExpiredDuels();
    setInterval(() => void sweepAllExpiredDuels(), 2 * 60 * 1000);

    httpServer = app.listen(PORT, '0.0.0.0', () => {
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
    // 시작 실패 원인은 항상 출력한다. Sequelize 에러는 error.sql / error.original 에 실제 SQL·ER코드가 있다.
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
    if (!e?.sql && !orig)
      console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exit(1);
  }
};

/**
 * 종료할 때 새 연결만 막고 처리 중인 요청을 마저 끝낸다.
 * 오래 매달린 연결 때문에 배포가 멈추지 않도록 시간 제한을 둔다.
 */
const SHUTDOWN_GRACE_MS = 10_000;

async function shutdown(signal: string): Promise<void> {
  logger.info(`⚠️ ${signal} 수신, 서버 종료 중...`);
  closeAllSseConnections(); // 열린 SSE 스트림을 닫아야 종료가 매달리지 않는다

  if (httpServer) {
    await Promise.race([
      new Promise<void>(resolve => httpServer?.close(() => resolve())),
      new Promise<void>(resolve => setTimeout(resolve, SHUTDOWN_GRACE_MS)),
    ]);
  }

  await closeDatabaseConnection();
  process.exit(0);
}

process.on('unhandledRejection', (reason, _promise) => {
  logger.error('❌ Unhandled Rejection:', reason);
  console.error(reason instanceof Error ? (reason.stack ?? reason.message) : reason);
  // 개발·테스트에서는 즉시 종료해 눈에 띄게 한다. 운영에서는 살려 둔다(대개 응답과 무관한 백그라운드 작업).
  // 상태가 깨졌을 수 있는 uncaughtException 은 그대로 종료한다.
  if (env.NODE_ENV !== 'production') process.exit(1);
});

process.on('uncaughtException', error => {
  logger.error('❌ Uncaught Exception:', error);
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

if (require.main === module) {
  void startServer();
}

export { app };
