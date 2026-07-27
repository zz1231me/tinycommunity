// server/src/middlewares/dynamicRateLimit.ts - 동적 Rate Limiting (초기화 수정됨)
import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { RateLimitSettings } from '../models/RateLimitSettings';
import { logInfo, logSuccess, logError, logWarning } from '../utils/logger';

interface CreateRateLimitSettingsData {
  category: string;
  name: string;
  description: string;
  windowMs: number;
  maxRequests: number;
  enabled: boolean;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
  message: string;
  statusCode: number;
  applyTo: string;
  priority?: number;
  whitelistIPs?: string;
  blacklistIPs?: string;
  headers?: string;
}

// ✅ 메모리 캐시로 성능 최적화
interface RateLimitSettingsSnapshot {
  windowMs: number;
  maxRequests: number;
  message: string;
  statusCode: number;
  applyTo: string;
  // createRateLimiter가 closure에 캡처하므로 변경 시 미들웨어 재생성 필요
  whitelistIPs?: string;
  blacklistIPs?: string;
  headers?: string;
}

interface CachedRateLimit {
  middleware: RequestHandler;
  lastUpdated: Date;
  settings: RateLimitSettingsSnapshot;
}

class DynamicRateLimitManager {
  private cache = new Map<string, CachedRateLimit>();
  private isInitialized = false;
  private initializingPromise: Promise<void> | null = null;
  // ✅ 싱글턴 기본 미들웨어 — 매 요청마다 새 인스턴스를 만들면 카운터가 공유되지 않아
  //    실질적으로 rate limit이 동작하지 않는 문제를 방지
  private readonly _defaultMiddleware: RequestHandler = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { error: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.' },
  });

  // ✅ 설정 캐시 새로고침 (5분마다) - 초기화 후에만
  constructor() {
    logInfo('DynamicRateLimitManager 생성됨 (초기화 대기 중...)');
  }

  // ✅ 지연 초기화 메서드 추가
  async initialize() {
    if (this.isInitialized) return;

    if (this.initializingPromise) {
      return this.initializingPromise;
    }

    this.initializingPromise = (async () => {
      try {
        logInfo('Rate Limiting 매니저 초기화 시작...');
        await this.createDefaultSettings();
        await this.refreshCache();

        // 주기적 캐시 새로고침 설정 (5분마다)
        setInterval(
          () => {
            void this.refreshCache();
          },
          5 * 60 * 1000
        );

        this.isInitialized = true;
        logSuccess('Rate Limiting 매니저 초기화 완료');
      } catch (error) {
        this.initializingPromise = null; // 실패 시 재시도 허용
        logError('Rate Limiting 매니저 초기화 실패', error);
      }
    })();

    return this.initializingPromise;
  }

  // ✅ 기본 설정 생성 (없는 경우) - 수정됨
  async createDefaultSettings() {
    try {
      logInfo('기본 Rate Limiting 설정 확인 중...');

      const defaultConfigs = [
        {
          category: 'auth',
          name: 'login',
          description: '로그인 시도 제한',
          windowMs: 15 * 60 * 1000, // 15분
          maxRequests: 10,
          enabled: true,
          skipSuccessfulRequests: true,
          skipFailedRequests: false,
          message: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.',
          statusCode: 429,
          applyTo: '/api/auth/login',
          priority: 10,
          whitelistIPs: '[]',
          blacklistIPs: '[]',
          headers: '{}',
        },
        {
          category: 'api',
          name: 'general',
          description: '일반 API 요청 제한',
          windowMs: 15 * 60 * 1000, // 15분
          maxRequests: 1000,
          enabled: true,
          skipSuccessfulRequests: false,
          skipFailedRequests: false,
          message: 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
          statusCode: 429,
          applyTo: '/api',
          priority: 100,
          whitelistIPs: '[]',
          blacklistIPs: '[]',
          headers: '{}',
        },
        {
          category: 'upload',
          name: 'file_upload',
          description: '파일 업로드 제한',
          windowMs: 60 * 60 * 1000, // 1시간
          maxRequests: 50,
          enabled: true,
          skipSuccessfulRequests: false,
          skipFailedRequests: false,
          message: '파일 업로드 한도를 초과했습니다. 1시간 후 다시 시도해주세요.',
          statusCode: 429,
          applyTo: '/api/uploads',
          priority: 20,
          whitelistIPs: '[]',
          blacklistIPs: '[]',
          headers: '{}',
        },
        {
          category: 'admin',
          name: 'admin_panel',
          description: '관리자 페이지 제한',
          windowMs: 15 * 60 * 1000, // 15분
          maxRequests: 200,
          enabled: true,
          skipSuccessfulRequests: false,
          skipFailedRequests: false,
          message: '관리자 페이지 요청이 너무 많습니다.',
          statusCode: 429,
          applyTo: '/api/admin',
          priority: 30,
          whitelistIPs: '[]',
          blacklistIPs: '[]',
          headers: '{}',
        },
      ];

      let createdCount = 0;
      for (const config of defaultConfigs) {
        const existing = await RateLimitSettings.findOne({
          where: { category: config.category, name: config.name },
        });

        if (!existing) {
          await RateLimitSettings.create(config);
          logSuccess(`기본 Rate Limit 설정 생성: ${config.category}.${config.name}`);
          createdCount++;
        }
      }

      if (createdCount > 0) {
        logSuccess(`기본 설정 생성됨`, { count: createdCount });
      } else {
        logInfo('기존 설정이 있어서 새로 생성하지 않음');
      }
    } catch (error) {
      logError('기본 설정 생성 실패', error);
      throw error;
    }
  }

  // ✅ 설정이 변경되었는지 비교하는 헬퍼 (deep equal — 미들웨어 재생성 여부 판단용)
  private settingsChanged(
    prev: RateLimitSettingsSnapshot | undefined,
    next: RateLimitSettings
  ): boolean {
    if (!prev) return true;
    if (prev.windowMs !== next.windowMs) return true;
    if (prev.maxRequests !== next.maxRequests) return true;
    if (prev.statusCode !== next.statusCode) return true;
    if (prev.message !== next.message) return true;
    if (prev.applyTo !== next.applyTo) return true;
    // ✅ whitelist/blacklist/headers도 변경 시 새 미들웨어 필요
    //    (createRateLimiter가 setting의 getXxx()를 호출해 closure에 캡처하므로
    //     비교 누락 시 IP 규칙 변경이 다음 캐시 만료까지 반영되지 않음)
    if ((prev.whitelistIPs ?? '') !== (next.whitelistIPs ?? '')) return true;
    if ((prev.blacklistIPs ?? '') !== (next.blacklistIPs ?? '')) return true;
    if ((prev.headers ?? '') !== (next.headers ?? '')) return true;
    return false;
  }

  // ✅ 캐시 새로고침
  // ⚠ 변경되지 않은 설정의 미들웨어는 재사용해야 함 — 매번 재생성하면 express-rate-limit의 내부
  //   MemoryStore가 새로 생성되어 모든 카운터가 리셋됨. 그 결과 windowMs와 무관하게 5분마다
  //   사용자 quota가 갱신되어 rate limit이 사실상 약화됨 (15분 윈도우가 5분처럼 동작).
  async refreshCache() {
    try {
      logInfo('Rate Limit 캐시 새로고침 중...');

      const settings = await RateLimitSettings.findAll({
        where: { enabled: true },
        order: [['priority', 'ASC']],
      });

      logInfo(`활성화된 설정 발견`, { count: settings.length });

      const newCache = new Map<string, CachedRateLimit>();
      let reused = 0;
      let recreated = 0;

      for (const setting of settings) {
        const key = `${setting.category}.${setting.name}`;
        const existing = this.cache.get(key);

        let middleware: RequestHandler;
        if (existing && !this.settingsChanged(existing.settings, setting)) {
          // 변경 없음 — 기존 미들웨어 재사용해 카운터 보존
          middleware = existing.middleware;
          reused++;
        } else {
          middleware = this.createRateLimiter(setting);
          recreated++;
        }

        newCache.set(key, {
          middleware,
          lastUpdated:
            existing && middleware === existing.middleware ? existing.lastUpdated : new Date(),
          settings: setting.toJSON(),
        });
      }

      this.cache = newCache;
      logSuccess(`Rate Limit 캐시 새로고침 완료`, {
        loaded: settings.length,
        reused,
        recreated,
      });
    } catch (error) {
      logError('Rate Limit 캐시 새로고침 실패', error);
    }
  }

  // ✅ Rate Limiter 생성 — 블랙리스트 즉시 차단 + 화이트리스트 우회 + 레이트 리밋 순으로 처리
  private createRateLimiter(setting: RateLimitSettings): RequestHandler {
    const whitelistIPs = setting.getWhitelistIPs();
    const blacklistIPs = setting.getBlacklistIPs();
    const customHeaders = setting.getHeaders();

    const limiter = rateLimit({
      windowMs: setting.windowMs,
      max: setting.maxRequests,
      skipSuccessfulRequests: setting.skipSuccessfulRequests,
      skipFailedRequests: setting.skipFailedRequests,
      message: {
        error: setting.message,
        retryAfter: Math.ceil(setting.windowMs / 1000),
      },
      standardHeaders: 'draft-6',
      legacyHeaders: false,

      // 화이트리스트만 건너뛰기 (블랙리스트는 아래 래퍼에서 사전 차단)
      skip: (req: Request) => {
        const clientIP = req.ip || req.socket.remoteAddress || '';
        return whitelistIPs.length > 0 && whitelistIPs.includes(clientIP);
      },

      handler: (req: Request, res: Response) => {
        const clientIP = req.ip || req.socket.remoteAddress || '';
        logWarning(`Rate limit 초과`, {
          category: setting.category,
          name: setting.name,
          ip: clientIP,
          url: req.url,
        });

        Object.entries(customHeaders).forEach(([key, value]) => {
          res.setHeader(key, value);
        });

        res.status(setting.statusCode).json({
          message: setting.message,
          retryAfter: Math.ceil(setting.windowMs / 1000),
          category: setting.category,
          limit: setting.maxRequests,
        });
      },
    });

    // 블랙리스트 IP를 레이트리미터 이전에 즉시 403 차단하는 래퍼
    return (req: Request, res: Response, next: NextFunction) => {
      if (blacklistIPs.length > 0) {
        const clientIP = req.ip || req.socket.remoteAddress || '';
        if (blacklistIPs.includes(clientIP)) {
          logWarning(`블랙리스트 IP 차단`, { ip: clientIP, url: req.url });
          res.status(403).json({ message: '접근이 차단되었습니다.' });
          return;
        }
      }
      limiter(req, res, next);
    };
  }

  // ✅ 경로별 미들웨어 가져오기
  getMiddleware(path: string): RequestHandler[] {
    // 초기화되지 않은 경우 기본 미들웨어만 반환
    if (!this.isInitialized) {
      return [this.getDefaultMiddleware()];
    }

    const middlewares: RequestHandler[] = [];

    for (const [, cached] of this.cache.entries()) {
      const settings = cached.settings;

      // 경로 매칭 (간단한 패턴 매칭)
      if (this.pathMatches(path, settings.applyTo)) {
        middlewares.push(cached.middleware);
      }
    }

    // 매칭되는 미들웨어가 없으면 기본 미들웨어
    if (middlewares.length === 0) {
      middlewares.push(this.getDefaultMiddleware());
    }

    return middlewares;
  }

  // ✅ 경로 매칭 함수
  private pathMatches(requestPath: string, pattern: string): boolean {
    // 정확한 매칭
    if (requestPath === pattern) return true;

    // 접두사 매칭 (/api/auth* 형태)
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return requestPath.startsWith(prefix);
    }

    // 하위 경로 매칭 (/api/auth로 시작하는 모든 경로) — 세그먼트 경계 확인
    if (
      requestPath.startsWith(pattern) &&
      (requestPath.length === pattern.length || requestPath[pattern.length] === '/')
    ) {
      return true;
    }

    return false;
  }

  // ✅ 기본 미들웨어 — 싱글턴 반환 (매 요청마다 새 인스턴스 생성 방지)
  private getDefaultMiddleware(): RequestHandler {
    return this._defaultMiddleware;
  }

  // ✅ catch 블록에서 사용하는 공개 폴백 (private 메서드 외부 접근 불가 우회)
  getDefaultMiddlewareFallback(): RequestHandler {
    return this._defaultMiddleware;
  }

  // ✅ 특정 설정 가져오기
  async getSettings(): Promise<RateLimitSettings[]> {
    // 초기화되지 않았으면 먼저 초기화
    await this.initialize();

    return await RateLimitSettings.findAll({
      order: [
        ['priority', 'ASC'],
        ['category', 'ASC'],
      ],
    });
  }

  // ✅ 설정 업데이트
  async updateSettings(id: number, data: Partial<RateLimitSettings>): Promise<boolean> {
    try {
      const [updatedCount] = await RateLimitSettings.update(data, {
        where: { id },
      });

      if (updatedCount > 0) {
        await this.refreshCache();
        logSuccess(`Rate Limit 설정 업데이트`, { id });
        return true;
      }

      return false;
    } catch (error) {
      logError('Rate Limit 설정 업데이트 실패', error);
      return false;
    }
  }

  // ✅ 설정 생성
  async createSettings(data: CreateRateLimitSettingsData): Promise<RateLimitSettings | null> {
    try {
      const newSettings = await RateLimitSettings.create(data);
      await this.refreshCache();
      logSuccess(`Rate Limit 설정 생성`, { category: data.category, name: data.name });
      return newSettings;
    } catch (error) {
      logError('Rate Limit 설정 생성 실패', error);
      return null;
    }
  }

  // ✅ 설정 삭제
  async deleteSettings(id: number): Promise<boolean> {
    try {
      const deletedCount = await RateLimitSettings.destroy({
        where: { id },
      });

      if (deletedCount > 0) {
        await this.refreshCache();
        logSuccess(`Rate Limit 설정 삭제`, { id });
        return true;
      }

      return false;
    } catch (error) {
      logError('Rate Limit 설정 삭제 실패', error);
      return false;
    }
  }

  // ✅ 통계 정보
  getStats() {
    return {
      cachedSettings: this.cache.size,
      categories: [...new Set(Array.from(this.cache.keys()).map(key => key.split('.')[0]))],
      lastRefresh:
        this.cache.size > 0
          ? Math.min(...Array.from(this.cache.values()).map(c => c.lastUpdated.getTime()))
          : 0,
    };
  }
}

// ✅ 싱글톤 인스턴스
export const rateLimitManager = new DynamicRateLimitManager();

// ✅ 동적 Rate Limiting 미들웨어
export const dynamicRateLimit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 초기화되지 않았으면 먼저 초기화
    await rateLimitManager.initialize();

    // req.baseUrl + req.path = full path (e.g. /api/auth/login), not just relative path
    const middlewares = rateLimitManager.getMiddleware(req.baseUrl + req.path);

    // 여러 미들웨어 순차 실행
    let index = 0;

    const runNext = (err?: unknown) => {
      if (err) return next(err);

      if (index >= middlewares.length) {
        return next();
      }

      const middleware = middlewares[index++];
      void middleware(req, res, runNext);
    };

    runNext();
  } catch (error) {
    logError('dynamicRateLimit 오류', error);
    // 오류 발생 시에도 기본 rate limiter는 적용 (next() 직접 호출 시 rate limit 완전 우회됨)
    void rateLimitManager.getDefaultMiddlewareFallback()(req, res, next);
  }
};
