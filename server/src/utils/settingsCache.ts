// server/src/utils/settingsCache.ts
import { SiteSettings } from '../models/SiteSettings';
import { logInfo, logError } from './logger';

// ─── 허용 확장자 기본값 ────────────────────────────────────────────────────────

export const DEFAULT_ALLOWED_EXTENSIONS = {
  IMAGE: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.ico'],
  DOCUMENT: [
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.txt',
    '.csv',
    '.rtf',
    '.odt',
    '.ods',
    '.odp',
    '.hwp',
  ],
  ARCHIVE: ['.zip', '.rar', '.7z', '.tar', '.gz'],
  MEDIA: ['.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'],
};

// 보안상 항상 차단되어야 할 확장자 (DB 설정으로 덮어쓸 수 없음)
export const BLOCKED_EXTENSIONS_FLOOR = [
  '.php',
  '.php3',
  '.php4',
  '.php5',
  '.phtml',
  '.phps',
  '.asp',
  '.aspx',
  '.asa',
  '.asax',
  '.ascx',
  '.ashx',
  '.asmx',
  '.jsp',
  '.jspx',
  '.jsw',
  '.jsv',
  '.jspf',
  // 데스크톱 실행파일(.exe .bat .cmd .com .pif .scr .vbs .vbe)은 floor에서 제외.
  //  - 리눅스 서버에서 실행되지 않아 웹셸 위험 없음
  //  - 브라우저가 인라인 실행하지 않고 다운로드만 하므로 저장형 XSS도 아님
  //  → 다운로드받은 사람 PC에서만 위험(=서버 보안과 무관)하여 허용.
  //  ※ 서버 실행/저장형 XSS 위험이 있는 .js .html .svg 등은 아래에 그대로 유지.
  '.js',
  '.jar',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.csh',
  '.tcsh',
  '.pl',
  '.pm',
  '.t',
  '.pod',
  '.py',
  '.pyo',
  '.pyc',
  '.pyw',
  '.pyz',
  '.pywz',
  '.rb',
  '.rbw',
  '.cgi',
  '.fcgi',
  '.idc',
  '.shtm',
  '.shtml',
  '.stm',
  // 인라인 렌더링 시 저장형 XSS 벡터 (uploads에서 직접 서빙될 경우 스크립트 실행) — 항상 차단
  '.htm',
  '.html',
  '.xhtml',
  '.svg',
  '.svgz',
  '.htaccess',
  '.htpasswd',
  '.htgroup',
  '.htdigest',
  '.config',
  '.conf',
  '.cfg',
  '.ini',
];

// ─── JSON 파싱 헬퍼 ────────────────────────────────────────────────────────────

function parseJsonArray(raw: string | null | undefined, fallback: string[]): string[] {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(v => typeof v === 'string')) {
      return parsed;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

// ─── 기본값 ────────────────────────────────────────────────────────────────────

// ✅ export해서 siteSettings 컨트롤러 등 다른 곳에서 재사용 (중복 정의 방지)
export const SETTINGS_DEFAULTS = {
  maxLoginAttempts: 5,
  accountLockMinutes: 30,
  maxFileCount: 5,
  maxFileSizeMb: 100,
  maxImageSizeMb: 10,
  maxAvatarSizeMb: 5,
  maxArchiveSizeMb: 100,
  maxImageCount: 1,
  bcryptRounds: 10,
  defaultPageSize: 10,
  securityLogRetentionDays: 90,
  errorLogRetentionDays: 30,
  deletedPostRetentionDays: 7,
  jwtAccessTokenHours: 2,
  jwtRefreshTokenDays: 3,
  postTitleMaxLength: 200,
  postContentMaxLength: 500000,
  postSecretPasswordMinLength: 4,
  globalSearchLimit: 50,
  allowGuestComment: false,
  minPasswordLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumberOrSpecial: true,
  commentMaxDepth: 3,
  commentMaxCount: 1000,
  avatarSizePx: 200,
  avatarQuality: 90,
  passwordResetTokenHours: 1,
  rateLimitApiMax: 200,
  rateLimitAuthMax: 10,
  rateLimitUploadMax: 20,
  rateLimitDownloadMax: 100,
  autoSaveIntervalSeconds: 30,
  draftExpiryMinutes: 60,
  // ── 신규 ────────────────────────────────────────────────────────────────
  memoMaxPerUser: 200,
  commentContentMaxLength: 1000,
  eventBodyMaxLength: 10000,
  eventLocationMaxLength: 500,
  // 허용 확장자 (배열 형태)
  allowedImageExtensions: DEFAULT_ALLOWED_EXTENSIONS.IMAGE,
  allowedDocumentExtensions: DEFAULT_ALLOWED_EXTENSIONS.DOCUMENT,
  allowedArchiveExtensions: DEFAULT_ALLOWED_EXTENSIONS.ARCHIVE,
  allowedMediaExtensions: DEFAULT_ALLOWED_EXTENSIONS.MEDIA,
};

const DEFAULTS = SETTINGS_DEFAULTS;
let cachedSettings: typeof DEFAULTS = { ...DEFAULTS };

// ─── 캐시 로드 ─────────────────────────────────────────────────────────────────

export async function loadSettingsCache(): Promise<void> {
  try {
    const settings = await SiteSettings.findOne();
    if (settings) {
      cachedSettings = {
        maxLoginAttempts: settings.maxLoginAttempts ?? DEFAULTS.maxLoginAttempts,
        accountLockMinutes: settings.accountLockMinutes ?? DEFAULTS.accountLockMinutes,
        maxFileCount: settings.maxFileCount ?? DEFAULTS.maxFileCount,
        maxFileSizeMb: settings.maxFileSizeMb ?? DEFAULTS.maxFileSizeMb,
        maxImageSizeMb: settings.maxImageSizeMb ?? DEFAULTS.maxImageSizeMb,
        maxAvatarSizeMb: settings.maxAvatarSizeMb ?? DEFAULTS.maxAvatarSizeMb,
        maxArchiveSizeMb: settings.maxArchiveSizeMb ?? DEFAULTS.maxArchiveSizeMb,
        maxImageCount: settings.maxImageCount ?? DEFAULTS.maxImageCount,
        bcryptRounds: Math.min(Math.max(settings.bcryptRounds ?? DEFAULTS.bcryptRounds, 10), 14),
        defaultPageSize: settings.defaultPageSize ?? DEFAULTS.defaultPageSize,
        securityLogRetentionDays:
          settings.securityLogRetentionDays ?? DEFAULTS.securityLogRetentionDays,
        errorLogRetentionDays: settings.errorLogRetentionDays ?? DEFAULTS.errorLogRetentionDays,
        deletedPostRetentionDays:
          settings.deletedPostRetentionDays ?? DEFAULTS.deletedPostRetentionDays,
        jwtAccessTokenHours: settings.jwtAccessTokenHours ?? DEFAULTS.jwtAccessTokenHours,
        jwtRefreshTokenDays: settings.jwtRefreshTokenDays ?? DEFAULTS.jwtRefreshTokenDays,
        postTitleMaxLength: settings.postTitleMaxLength ?? DEFAULTS.postTitleMaxLength,
        postContentMaxLength: settings.postContentMaxLength ?? DEFAULTS.postContentMaxLength,
        postSecretPasswordMinLength:
          settings.postSecretPasswordMinLength ?? DEFAULTS.postSecretPasswordMinLength,
        globalSearchLimit: settings.globalSearchLimit ?? DEFAULTS.globalSearchLimit,
        allowGuestComment: settings.allowGuestComment ?? DEFAULTS.allowGuestComment,
        minPasswordLength: settings.minPasswordLength ?? DEFAULTS.minPasswordLength,
        requireUppercase: settings.requireUppercase ?? DEFAULTS.requireUppercase,
        requireLowercase: settings.requireLowercase ?? DEFAULTS.requireLowercase,
        requireNumberOrSpecial: settings.requireNumberOrSpecial ?? DEFAULTS.requireNumberOrSpecial,
        commentMaxDepth: settings.commentMaxDepth ?? DEFAULTS.commentMaxDepth,
        commentMaxCount: settings.commentMaxCount ?? DEFAULTS.commentMaxCount,
        avatarSizePx: settings.avatarSizePx ?? DEFAULTS.avatarSizePx,
        avatarQuality: settings.avatarQuality ?? DEFAULTS.avatarQuality,
        passwordResetTokenHours:
          settings.passwordResetTokenHours ?? DEFAULTS.passwordResetTokenHours,
        rateLimitApiMax: settings.rateLimitApiMax ?? DEFAULTS.rateLimitApiMax,
        rateLimitAuthMax: settings.rateLimitAuthMax ?? DEFAULTS.rateLimitAuthMax,
        rateLimitUploadMax: settings.rateLimitUploadMax ?? DEFAULTS.rateLimitUploadMax,
        rateLimitDownloadMax: settings.rateLimitDownloadMax ?? DEFAULTS.rateLimitDownloadMax,
        autoSaveIntervalSeconds:
          settings.autoSaveIntervalSeconds ?? DEFAULTS.autoSaveIntervalSeconds,
        draftExpiryMinutes: settings.draftExpiryMinutes ?? DEFAULTS.draftExpiryMinutes,
        // ── 신규 ────────────────────────────────────────────────────────
        memoMaxPerUser: settings.memoMaxPerUser ?? DEFAULTS.memoMaxPerUser,
        commentContentMaxLength:
          settings.commentContentMaxLength ?? DEFAULTS.commentContentMaxLength,
        eventBodyMaxLength: settings.eventBodyMaxLength ?? DEFAULTS.eventBodyMaxLength,
        eventLocationMaxLength: settings.eventLocationMaxLength ?? DEFAULTS.eventLocationMaxLength,
        // 허용 확장자 — TEXT(JSON) 파싱
        allowedImageExtensions: parseJsonArray(
          settings.allowedImageExtensions,
          DEFAULTS.allowedImageExtensions
        ),
        allowedDocumentExtensions: parseJsonArray(
          settings.allowedDocumentExtensions,
          DEFAULTS.allowedDocumentExtensions
        ),
        allowedArchiveExtensions: parseJsonArray(
          settings.allowedArchiveExtensions,
          DEFAULTS.allowedArchiveExtensions
        ),
        allowedMediaExtensions: parseJsonArray(
          settings.allowedMediaExtensions,
          DEFAULTS.allowedMediaExtensions
        ),
      };
      logInfo('설정 캐시 로드 완료', {
        maxImageSizeMb: cachedSettings.maxImageSizeMb,
        maxFileSizeMb: cachedSettings.maxFileSizeMb,
        bcryptRounds: cachedSettings.bcryptRounds,
      });
    }
  } catch (err) {
    logError('설정 캐시 로드 실패 - 기본값 사용', err);
  }
}

export function getSettings(): typeof DEFAULTS {
  return cachedSettings;
}

export function refreshSettingsCache(): Promise<void> {
  return loadSettingsCache();
}

// ─── 개별 게터 함수 ────────────────────────────────────────────────────────────

export function getPostTitleMaxLength(): number {
  return cachedSettings?.postTitleMaxLength ?? 200;
}

export function getPostContentMaxLength(): number {
  return cachedSettings?.postContentMaxLength ?? 500000;
}

export function getPostSecretPasswordMinLength(): number {
  return cachedSettings?.postSecretPasswordMinLength ?? 4;
}

export function getGlobalSearchLimit(): number {
  return Math.min(Math.max(cachedSettings?.globalSearchLimit ?? 50, 1), 500);
}

export function getMinPasswordLength(): number {
  return Math.min(Math.max(cachedSettings?.minPasswordLength ?? 8, 6), 72);
}

export function getPasswordComplexityRules(): {
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumberOrSpecial: boolean;
} {
  return {
    requireUppercase: cachedSettings?.requireUppercase ?? DEFAULTS.requireUppercase,
    requireLowercase: cachedSettings?.requireLowercase ?? DEFAULTS.requireLowercase,
    requireNumberOrSpecial:
      cachedSettings?.requireNumberOrSpecial ?? DEFAULTS.requireNumberOrSpecial,
  };
}

export function getBcryptRounds(): number {
  return Math.min(Math.max(cachedSettings?.bcryptRounds ?? DEFAULTS.bcryptRounds, 10), 14);
}

/** 파일 크기 제한 (바이트 단위) */
export function getFileSizeLimits(): {
  IMAGE: number;
  AVATAR: number;
  DOCUMENT: number;
  ARCHIVE: number;
} {
  const s = cachedSettings;
  return {
    IMAGE: (s?.maxImageSizeMb ?? DEFAULTS.maxImageSizeMb) * 1024 * 1024,
    AVATAR: (s?.maxAvatarSizeMb ?? DEFAULTS.maxAvatarSizeMb) * 1024 * 1024,
    DOCUMENT: (s?.maxFileSizeMb ?? DEFAULTS.maxFileSizeMb) * 1024 * 1024,
    ARCHIVE: (s?.maxArchiveSizeMb ?? DEFAULTS.maxArchiveSizeMb) * 1024 * 1024,
  };
}

export function getMaxImageCount(): number {
  return cachedSettings?.maxImageCount ?? DEFAULTS.maxImageCount;
}

/** 허용 확장자 (카테고리별) */
export function getAllowedExtensions(): {
  IMAGE: string[];
  DOCUMENT: string[];
  ARCHIVE: string[];
  MEDIA: string[];
} {
  const s = cachedSettings;
  return {
    IMAGE: s?.allowedImageExtensions ?? DEFAULTS.allowedImageExtensions,
    DOCUMENT: s?.allowedDocumentExtensions ?? DEFAULTS.allowedDocumentExtensions,
    ARCHIVE: s?.allowedArchiveExtensions ?? DEFAULTS.allowedArchiveExtensions,
    MEDIA: s?.allowedMediaExtensions ?? DEFAULTS.allowedMediaExtensions,
  };
}

/** 댓글 설정 */
export function getCommentSettings(): { maxDepth: number; maxCount: number } {
  return {
    maxDepth: Math.min(
      Math.max(cachedSettings?.commentMaxDepth ?? DEFAULTS.commentMaxDepth, 1),
      10
    ),
    maxCount: Math.min(
      Math.max(cachedSettings?.commentMaxCount ?? DEFAULTS.commentMaxCount, 1),
      10000
    ),
  };
}

/** 아바타 처리 설정 */
export function getAvatarSettings(): { sizePx: number; quality: number } {
  return {
    sizePx: cachedSettings?.avatarSizePx ?? DEFAULTS.avatarSizePx,
    quality: cachedSettings?.avatarQuality ?? DEFAULTS.avatarQuality,
  };
}

/** 비밀번호 재설정 토큰 유효시간 (밀리초) */
export function getPasswordResetTokenMs(): number {
  return (cachedSettings?.passwordResetTokenHours ?? DEFAULTS.passwordResetTokenHours) * 3600000;
}

/** Rate Limit 설정 */
export function getRateLimitSettings(): {
  apiMax: number;
  authMax: number;
  uploadMax: number;
  downloadMax: number;
} {
  return {
    apiMax: cachedSettings?.rateLimitApiMax ?? DEFAULTS.rateLimitApiMax,
    authMax: cachedSettings?.rateLimitAuthMax ?? DEFAULTS.rateLimitAuthMax,
    uploadMax: cachedSettings?.rateLimitUploadMax ?? DEFAULTS.rateLimitUploadMax,
    downloadMax: cachedSettings?.rateLimitDownloadMax ?? DEFAULTS.rateLimitDownloadMax,
  };
}
