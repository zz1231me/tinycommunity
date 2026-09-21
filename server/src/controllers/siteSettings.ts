import { Request, Response } from 'express';
import { SiteSettings } from '../models';
import { logInfo, logError } from '../utils/logger';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types/auth-request';
import { refreshMaintenanceCache } from '../middlewares/maintenance.middleware';
import {
  refreshSettingsCache,
  SETTINGS_DEFAULTS,
  DEFAULT_ALLOWED_EXTENSIONS,
  BLOCKED_EXTENSIONS_FLOOR,
} from '../utils/settingsCache';
import { refreshUploaders } from '../middlewares/upload/refresh';
import { validatePrizes, type LotteryPrize } from '../config/lottery';
import { invalidateIndexHtmlCache } from '../utils/indexHtml';
import { auditLogService } from '../services/auditLog.service';
import { isWorkStatus } from '../config/workStatus';

/** All fields we expose / accept */
const DEFAULTS = {
  siteName: 'TinyCommunity',
  siteTitle: 'TinyCommunity',
  faviconUrl: null as string | null,
  logoUrl: null as string | null,
  // null 이면 기본 디자인 시스템 색
  themePrimaryColor: null as string | null,
  themeSecondaryColor: null as string | null,
  description: null as string | null,
  allowRegistration: true,
  requireApproval: false,
  maintenanceMode: false,
  maintenanceMessage: null as string | null,
  loginMessage: null as string | null,
  // 숫자/불리언 설정의 단일 소스는 settingsCache.ts 의 SETTINGS_DEFAULTS 이다.
  ...SETTINGS_DEFAULTS,
  // TEXT 컬럼에 저장되므로 JSON 문자열로 직렬화한다.
  allowedImageExtensions: JSON.stringify(SETTINGS_DEFAULTS.allowedImageExtensions),
  allowedDocumentExtensions: JSON.stringify(SETTINGS_DEFAULTS.allowedDocumentExtensions),
  allowedArchiveExtensions: JSON.stringify(SETTINGS_DEFAULTS.allowedArchiveExtensions),
  allowedMediaExtensions: JSON.stringify(SETTINGS_DEFAULTS.allowedMediaExtensions),
  // 빈 객체는 코드 기본값을 쓴다는 뜻이다.
  workStatusLabels: JSON.stringify(SETTINGS_DEFAULTS.workStatusLabels),
  lotteryPrizes: JSON.stringify(SETTINGS_DEFAULTS.lotteryPrizes),
};

/** 업무 상태 이름 검사. 코드가 아는 키만 받고, 빈 문자열은 저장하지 않는다. */
function validateLabels(value: unknown): Record<string, string> {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('업무 상태 이름은 객체여야 합니다.');
  }
  const out: Record<string, string> = {};
  for (const [key, label] of Object.entries(value as Record<string, unknown>)) {
    if (!isWorkStatus(key)) continue;
    if (label === null || label === undefined || label === '') continue;
    if (typeof label !== 'string') throw new Error('업무 상태 이름은 문자열이어야 합니다.');
    const trimmed = label.trim();
    if (!trimmed) continue;
    if (trimmed.length > 20) throw new Error('업무 상태 이름은 20자를 넘을 수 없습니다.');
    out[key] = trimmed;
  }
  return out;
}

/** 저장된 JSON 을 화면이 쓰는 객체로. 깨져 있으면 빈 객체를 준다. */
function parseLabelField(raw: unknown): Record<string, string> {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

function validateExtensionList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${field}은 배열이어야 합니다.`);
  for (const ext of value) {
    if (typeof ext !== 'string' || !ext.startsWith('.')) {
      throw new Error(`${field}의 각 항목은 '.'으로 시작하는 문자열이어야 합니다. (예: .jpg)`);
    }
  }
  const normalized = (value as string[]).map(e => e.toLowerCase().trim());
  // 절대차단 확장자는 화이트리스트에 넣을 수 없다(저장형 XSS 방지).
  for (const ext of normalized) {
    if (BLOCKED_EXTENSIONS_FLOOR.includes(ext)) {
      throw new Error(`${field}에 보안상 위험한 확장자(${ext})는 추가할 수 없습니다.`);
    }
  }
  return normalized;
}

function parseExtensionField(raw: string | null | undefined, fallback: string[]): string[] {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** 저장된 상품표를 화면용 배열로. 깨져 있으면 기본값을 준다. */
function parsePrizeField(raw: string | null | undefined): LotteryPrize[] {
  if (!raw) return SETTINGS_DEFAULTS.lotteryPrizes;
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) && v.length > 0
      ? (v as LotteryPrize[])
      : SETTINGS_DEFAULTS.lotteryPrizes;
  } catch {
    return SETTINGS_DEFAULTS.lotteryPrizes;
  }
}

/** 익명 방문자도 받는 공개 설정. 보안 관련 값은 adminOnlyPayload 로 분리한다. */
function toPayload(s: SiteSettings) {
  return {
    siteName: s.siteName,
    siteTitle: s.siteTitle,
    faviconUrl: s.faviconUrl,
    logoUrl: s.logoUrl,
    themePrimaryColor: s.themePrimaryColor ?? null,
    themeSecondaryColor: s.themeSecondaryColor ?? null,
    description: s.description,
    allowRegistration: s.allowRegistration,
    requireApproval: s.requireApproval,
    maintenanceMode: s.maintenanceMode,
    maintenanceMessage: s.maintenanceMessage,
    loginMessage: s.loginMessage,
    maxFileCount: s.maxFileCount ?? DEFAULTS.maxFileCount,
    maxFileSizeMb: s.maxFileSizeMb ?? DEFAULTS.maxFileSizeMb,
    maxImageSizeMb: s.maxImageSizeMb ?? DEFAULTS.maxImageSizeMb,
    maxAvatarSizeMb: s.maxAvatarSizeMb ?? DEFAULTS.maxAvatarSizeMb,
    maxArchiveSizeMb: s.maxArchiveSizeMb ?? DEFAULTS.maxArchiveSizeMb,
    maxImageCount: s.maxImageCount ?? DEFAULTS.maxImageCount,
    allowedImageExtensions: parseExtensionField(
      s.allowedImageExtensions,
      DEFAULT_ALLOWED_EXTENSIONS.IMAGE
    ),
    allowedDocumentExtensions: parseExtensionField(
      s.allowedDocumentExtensions,
      DEFAULT_ALLOWED_EXTENSIONS.DOCUMENT
    ),
    allowedArchiveExtensions: parseExtensionField(
      s.allowedArchiveExtensions,
      DEFAULT_ALLOWED_EXTENSIONS.ARCHIVE
    ),
    allowedMediaExtensions: parseExtensionField(
      s.allowedMediaExtensions,
      DEFAULT_ALLOWED_EXTENSIONS.MEDIA
    ),
    defaultPageSize: s.defaultPageSize ?? DEFAULTS.defaultPageSize,
    postTitleMaxLength: s.postTitleMaxLength ?? DEFAULTS.postTitleMaxLength,
    postContentMaxLength: s.postContentMaxLength ?? DEFAULTS.postContentMaxLength,
    postSecretPasswordMinLength:
      s.postSecretPasswordMinLength ?? DEFAULTS.postSecretPasswordMinLength,
    globalSearchLimit: s.globalSearchLimit ?? DEFAULTS.globalSearchLimit,
    allowGuestComment: s.allowGuestComment ?? DEFAULTS.allowGuestComment,
    minPasswordLength: s.minPasswordLength ?? DEFAULTS.minPasswordLength,
    requireUppercase: s.requireUppercase ?? DEFAULTS.requireUppercase,
    requireLowercase: s.requireLowercase ?? DEFAULTS.requireLowercase,
    requireNumberOrSpecial: s.requireNumberOrSpecial ?? DEFAULTS.requireNumberOrSpecial,
    commentMaxDepth: s.commentMaxDepth ?? DEFAULTS.commentMaxDepth,
    commentMaxCount: s.commentMaxCount ?? DEFAULTS.commentMaxCount,
    avatarSizePx: s.avatarSizePx ?? DEFAULTS.avatarSizePx,
    avatarQuality: s.avatarQuality ?? DEFAULTS.avatarQuality,
    autoSaveIntervalSeconds: s.autoSaveIntervalSeconds ?? DEFAULTS.autoSaveIntervalSeconds,
    draftExpiryMinutes: s.draftExpiryMinutes ?? DEFAULTS.draftExpiryMinutes,
    memoMaxPerUser: s.memoMaxPerUser ?? DEFAULTS.memoMaxPerUser,
    wikiOrder: s.wikiOrder ?? DEFAULTS.wikiOrder,
    commentContentMaxLength: s.commentContentMaxLength ?? DEFAULTS.commentContentMaxLength,
    eventBodyMaxLength: s.eventBodyMaxLength ?? DEFAULTS.eventBodyMaxLength,
    eventLocationMaxLength: s.eventLocationMaxLength ?? DEFAULTS.eventLocationMaxLength,
    workStatusLabels: parseLabelField(s.workStatusLabels),
    // 확률표는 사용자에게도 보여야 한다.
    lotteryPrizes: parsePrizeField(s.lotteryPrizes),
    lotteryDailyLimit: s.lotteryDailyLimit ?? DEFAULTS.lotteryDailyLimit,
    lotteryDrawCost: s.lotteryDrawCost ?? DEFAULTS.lotteryDrawCost,
    attendanceBonus: s.attendanceBonus ?? DEFAULTS.attendanceBonus,
    duelMinStake: s.duelMinStake ?? DEFAULTS.duelMinStake,
    duelMaxStake: s.duelMaxStake ?? DEFAULTS.duelMaxStake,
    duelExpireMinutes: s.duelExpireMinutes ?? DEFAULTS.duelExpireMinutes,
    duelMaxOpenPerUser: s.duelMaxOpenPerUser ?? DEFAULTS.duelMaxOpenPerUser,
    attackCost: s.attackCost ?? DEFAULTS.attackCost,
    attackHideCost: s.attackHideCost ?? DEFAULTS.attackHideCost,
    attackHideSeconds: s.attackHideSeconds ?? DEFAULTS.attackHideSeconds,
    attackDefendCost: s.attackDefendCost ?? DEFAULTS.attackDefendCost,
    attackBlockSeconds: s.attackBlockSeconds ?? DEFAULTS.attackBlockSeconds,
    attackDailyLimit: s.attackDailyLimit ?? DEFAULTS.attackDailyLimit,
  };
}

/** 관리자만 받는 보안 설정. 공개 응답에는 넣지 않는다. */
function adminOnlyPayload(s: SiteSettings) {
  return {
    maxLoginAttempts: s.maxLoginAttempts ?? DEFAULTS.maxLoginAttempts,
    accountLockMinutes: s.accountLockMinutes ?? DEFAULTS.accountLockMinutes,
    bcryptRounds: s.bcryptRounds ?? DEFAULTS.bcryptRounds,
    securityLogRetentionDays: s.securityLogRetentionDays ?? DEFAULTS.securityLogRetentionDays,
    errorLogRetentionDays: s.errorLogRetentionDays ?? DEFAULTS.errorLogRetentionDays,
    deletedPostRetentionDays: s.deletedPostRetentionDays ?? DEFAULTS.deletedPostRetentionDays,
    jwtAccessTokenHours: s.jwtAccessTokenHours ?? DEFAULTS.jwtAccessTokenHours,
    jwtRefreshTokenDays: s.jwtRefreshTokenDays ?? DEFAULTS.jwtRefreshTokenDays,
    passwordResetTokenHours: s.passwordResetTokenHours ?? DEFAULTS.passwordResetTokenHours,
  };
}

/** 숫자 설정값을 범위 안에서만 받는다. 범위 밖이거나 비어 있으면 기존 값을 유지한다. */
function intOrKeep(value: unknown, current: number, min: number, max: number): number {
  if (value === undefined || value === null || value === '') return current;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return current;
  return n;
}

/** GET /api/site-settings — public */
export const getSiteSettings = async (_req: Request, res: Response) => {
  try {
    // findOrCreate 로 동시 요청 시 설정 행이 중복 생성되는 것을 막는다.
    const [settings] = await SiteSettings.findOrCreate({ where: {}, defaults: DEFAULTS });
    sendSuccess(res, toPayload(settings));
  } catch (error) {
    logError('사이트 설정 조회 실패', error);
    sendError(res, 500, '사이트 설정을 불러오는데 실패했습니다.');
  }
};

/** GET /api/site-settings/admin — admin only. 공개 설정 + 보안 설정 전체 */
export const getAdminSiteSettings = async (_req: Request, res: Response) => {
  try {
    const [settings] = await SiteSettings.findOrCreate({ where: {}, defaults: DEFAULTS });
    sendSuccess(res, { ...toPayload(settings), ...adminOnlyPayload(settings) });
  } catch (error) {
    logError('사이트 설정(관리자) 조회 실패', error);
    sendError(res, 500, '사이트 설정을 불러오는데 실패했습니다.');
  }
};

/** PUT /api/site-settings — admin only */
export const updateSiteSettings = async (req: Request, res: Response) => {
  try {
    const {
      siteName,
      siteTitle,
      faviconUrl,
      logoUrl,
      themePrimaryColor,
      themeSecondaryColor,
      description,
      allowRegistration,
      requireApproval,
      maintenanceMode,
      maintenanceMessage,
      loginMessage,
      maxLoginAttempts,
      accountLockMinutes,
      maxFileCount,
      maxFileSizeMb,
      maxImageSizeMb,
      maxAvatarSizeMb,
      maxArchiveSizeMb,
      maxImageCount,
      bcryptRounds,
      allowedImageExtensions,
      allowedDocumentExtensions,
      allowedArchiveExtensions,
      allowedMediaExtensions,
      defaultPageSize,
      securityLogRetentionDays,
      errorLogRetentionDays,
      deletedPostRetentionDays,
      jwtAccessTokenHours,
      jwtRefreshTokenDays,
      postTitleMaxLength,
      postContentMaxLength,
      postSecretPasswordMinLength,
      globalSearchLimit,
      allowGuestComment,
      minPasswordLength,
      requireUppercase,
      requireLowercase,
      requireNumberOrSpecial,
      commentMaxDepth,
      commentMaxCount,
      avatarSizePx,
      avatarQuality,
      passwordResetTokenHours,
      autoSaveIntervalSeconds,
      draftExpiryMinutes,
      memoMaxPerUser,
      wikiOrder,
      commentContentMaxLength,
      eventBodyMaxLength,
      eventLocationMaxLength,
      workStatusLabels,
      lotteryPrizes,
      lotteryDailyLimit,
      lotteryDrawCost,
      attendanceBonus,
      duelMinStake,
      duelMaxStake,
      duelExpireMinutes,
      duelMaxOpenPerUser,
      attackCost,
      attackHideCost,
      attackHideSeconds,
      attackDefendCost,
      attackBlockSeconds,
      attackDailyLimit,
    } = req.body;

    if (bcryptRounds !== undefined) {
      const rounds = Number(bcryptRounds);
      if (!Number.isInteger(rounds) || rounds < 10 || rounds > 14) {
        return sendError(res, 400, 'bcryptRounds는 10~14 사이의 정수여야 합니다.');
      }
    }

    function validateInt(value: unknown, field: string, min: number, max: number): string | null {
      const v = Number(value);
      if (!Number.isInteger(v) || v < min || v > max) {
        return `${field}는 ${min}~${max} 사이의 정수여야 합니다.`;
      }
      return null;
    }

    const numericChecks: Array<[unknown, string, number, number]> = [
      [maxLoginAttempts, 'maxLoginAttempts', 1, 20],
      [accountLockMinutes, 'accountLockMinutes', 1, 1440],
      [minPasswordLength, 'minPasswordLength', 6, 72],
      [maxFileCount, 'maxFileCount', 1, 20],
      [maxFileSizeMb, 'maxFileSizeMb', 1, 1000],
      [maxImageSizeMb, 'maxImageSizeMb', 1, 500],
      [maxAvatarSizeMb, 'maxAvatarSizeMb', 1, 100],
      [maxArchiveSizeMb, 'maxArchiveSizeMb', 1, 1000],
      [maxImageCount, 'maxImageCount', 1, 20],
      [defaultPageSize, 'defaultPageSize', 5, 100],
      // 제목 컬럼 중 가장 작은 것이 WikiPage.title STRING(200) 이다
      [postTitleMaxLength, 'postTitleMaxLength', 10, 200],
      [postContentMaxLength, 'postContentMaxLength', 1000, 2000000],
      [postSecretPasswordMinLength, 'postSecretPasswordMinLength', 4, 20],
      [globalSearchLimit, 'globalSearchLimit', 10, 200],
      [securityLogRetentionDays, 'securityLogRetentionDays', 7, 365],
      [errorLogRetentionDays, 'errorLogRetentionDays', 7, 365],
      [deletedPostRetentionDays, 'deletedPostRetentionDays', 1, 365],
      [jwtAccessTokenHours, 'jwtAccessTokenHours', 1, 168],
      [jwtRefreshTokenDays, 'jwtRefreshTokenDays', 1, 30],
      [commentMaxDepth, 'commentMaxDepth', 1, 5],
      [commentMaxCount, 'commentMaxCount', 100, 5000],
      [avatarSizePx, 'avatarSizePx', 50, 500],
      [avatarQuality, 'avatarQuality', 50, 100],
      [passwordResetTokenHours, 'passwordResetTokenHours', 1, 48],
      [autoSaveIntervalSeconds, 'autoSaveIntervalSeconds', 10, 300],
      [draftExpiryMinutes, 'draftExpiryMinutes', 10, 1440],
      [memoMaxPerUser, 'memoMaxPerUser', 10, 2000],
      [wikiOrder, 'wikiOrder', 0, 9999],
      [commentContentMaxLength, 'commentContentMaxLength', 100, 10000],
      [eventBodyMaxLength, 'eventBodyMaxLength', 100, 100000],
      [eventLocationMaxLength, 'eventLocationMaxLength', 10, 2000],
    ];

    for (const [value, field, min, max] of numericChecks) {
      if (value !== undefined) {
        const err = validateInt(value, field, min, max);
        if (err) return sendError(res, 400, err);
      }
    }

    // 최대 길이는 DB 컬럼 길이와 맞춘다.
    function validateString(
      value: unknown,
      field: string,
      maxLen: number,
      allowEmpty: boolean
    ): string | null {
      if (value === null && allowEmpty) return null;
      if (typeof value !== 'string') return `${field}는 문자열이어야 합니다.`;
      if (!allowEmpty && value.trim().length === 0) {
        return `${field}는 비어 있을 수 없습니다.`;
      }
      if (value.length > maxLen) return `${field}는 ${maxLen}자 이내여야 합니다.`;
      return null;
    }

    const stringChecks: Array<[unknown, string, number, boolean]> = [
      [siteName, 'siteName', 100, false],
      [siteTitle, 'siteTitle', 100, false],
      [faviconUrl, 'faviconUrl', 255, true],
      [logoUrl, 'logoUrl', 255, true],
      [description, 'description', 5000, true],
      [maintenanceMessage, 'maintenanceMessage', 5000, true],
      [loginMessage, 'loginMessage', 500, true],
    ];
    for (const [value, field, max, allowEmpty] of stringChecks) {
      if (value !== undefined) {
        const err = validateString(value, field, max, allowEmpty);
        if (err) return sendError(res, 400, err);
      }
    }

    // javascript:, data: 같은 스킴을 막는다.
    function validateSafeUrl(value: unknown, field: string): string | null {
      if (value === null || value === '') return null;
      if (typeof value !== 'string') return `${field}는 문자열이어야 합니다.`;
      // 허용: http(s)://, 상대 경로(/uploads/...)
      if (/^(https?:\/\/|\/)/i.test(value)) return null;
      return `${field}는 http(s):// 또는 / 로 시작해야 합니다.`;
    }
    if (faviconUrl !== undefined) {
      const err = validateSafeUrl(faviconUrl, 'faviconUrl');
      if (err) return sendError(res, 400, err);
    }
    if (logoUrl !== undefined) {
      const err = validateSafeUrl(logoUrl, 'logoUrl');
      if (err) return sendError(res, 400, err);
    }

    // 이 값은 클라이언트에서 CSS 변수로 그대로 주입되므로 #rgb/#rrggbb 만 허용한다.
    function validateHexColor(value: unknown, field: string): string | null {
      if (value === null || value === '') return null;
      if (typeof value !== 'string') return `${field}는 문자열이어야 합니다.`;
      if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) {
        return `${field}는 #RGB 또는 #RRGGBB 형식이어야 합니다.`;
      }
      return null;
    }
    for (const [value, field] of [
      [themePrimaryColor, 'themePrimaryColor'],
      [themeSecondaryColor, 'themeSecondaryColor'],
    ] as Array<[unknown, string]>) {
      if (value !== undefined) {
        const err = validateHexColor(value, field);
        if (err) return sendError(res, 400, err);
      }
    }

    let parsedAllowedImage: string[] | undefined;
    let parsedAllowedDocument: string[] | undefined;
    let parsedAllowedArchive: string[] | undefined;
    let parsedAllowedMedia: string[] | undefined;
    let parsedLotteryPrizes: LotteryPrize[] | undefined;
    let parsedWorkStatusLabels: Record<string, string> | undefined;

    try {
      if (allowedImageExtensions !== undefined) {
        parsedAllowedImage = validateExtensionList(allowedImageExtensions, '이미지 허용 확장자');
      }
      if (allowedDocumentExtensions !== undefined) {
        parsedAllowedDocument = validateExtensionList(
          allowedDocumentExtensions,
          '문서 허용 확장자'
        );
      }
      if (allowedArchiveExtensions !== undefined) {
        parsedAllowedArchive = validateExtensionList(
          allowedArchiveExtensions,
          '압축파일 허용 확장자'
        );
      }
      if (allowedMediaExtensions !== undefined) {
        parsedAllowedMedia = validateExtensionList(allowedMediaExtensions, '미디어 허용 확장자');
      }
      // 저장 구문 안에서 검사하면 이 catch 를 지나쳐 400 이 아니라 500 으로 나간다.
      if (workStatusLabels !== undefined) {
        parsedWorkStatusLabels = validateLabels(workStatusLabels);
      }
      if (lotteryPrizes !== undefined) {
        parsedLotteryPrizes = validatePrizes(lotteryPrizes);
      }
    } catch (validationError) {
      const msg = validationError instanceof Error ? validationError.message : '입력 형식 오류';
      return sendError(res, 400, msg);
    }

    // findOrCreate 로 동시 요청 시 설정 행이 중복 생성되는 것을 막는다.
    const [settings] = await SiteSettings.findOrCreate({ where: {}, defaults: DEFAULTS });

    // 보내온 값이 아니라 '저장될 값' 끼리 비교해야 실제 저장되는 쌍을 검사한다.
    const nextDuelMin = intOrKeep(duelMinStake, settings.duelMinStake, 1, 1000000);
    const nextDuelMax = intOrKeep(duelMaxStake, settings.duelMaxStake, 1, 1000000);
    if (nextDuelMin > nextDuelMax) {
      return sendError(res, 400, '대결 최소 판돈이 최대 판돈보다 클 수 없습니다.');
    }

    await settings.update({
      siteName: siteName !== undefined ? siteName : settings.siteName,
      siteTitle: siteTitle !== undefined ? siteTitle : settings.siteTitle,
      faviconUrl: faviconUrl !== undefined ? faviconUrl : settings.faviconUrl,
      // 빈 문자열은 기본색으로 되돌리라는 뜻이다.
      themePrimaryColor:
        themePrimaryColor !== undefined ? themePrimaryColor || null : settings.themePrimaryColor,
      themeSecondaryColor:
        themeSecondaryColor !== undefined
          ? themeSecondaryColor || null
          : settings.themeSecondaryColor,
      logoUrl: logoUrl !== undefined ? logoUrl : settings.logoUrl,
      description: description !== undefined ? description : settings.description,
      allowRegistration:
        allowRegistration !== undefined ? allowRegistration : settings.allowRegistration,
      requireApproval: requireApproval !== undefined ? requireApproval : settings.requireApproval,
      maintenanceMode: maintenanceMode !== undefined ? maintenanceMode : settings.maintenanceMode,
      maintenanceMessage:
        maintenanceMessage !== undefined ? maintenanceMessage : settings.maintenanceMessage,
      loginMessage: loginMessage !== undefined ? loginMessage : settings.loginMessage,
      maxLoginAttempts:
        maxLoginAttempts !== undefined ? maxLoginAttempts : settings.maxLoginAttempts,
      accountLockMinutes:
        accountLockMinutes !== undefined ? accountLockMinutes : settings.accountLockMinutes,
      maxFileCount: maxFileCount !== undefined ? maxFileCount : settings.maxFileCount,
      maxFileSizeMb: maxFileSizeMb !== undefined ? maxFileSizeMb : settings.maxFileSizeMb,
      maxImageSizeMb: maxImageSizeMb !== undefined ? maxImageSizeMb : settings.maxImageSizeMb,
      maxAvatarSizeMb: maxAvatarSizeMb !== undefined ? maxAvatarSizeMb : settings.maxAvatarSizeMb,
      maxArchiveSizeMb:
        maxArchiveSizeMb !== undefined ? maxArchiveSizeMb : settings.maxArchiveSizeMb,
      maxImageCount: maxImageCount !== undefined ? maxImageCount : settings.maxImageCount,
      bcryptRounds: bcryptRounds !== undefined ? bcryptRounds : settings.bcryptRounds,
      allowedImageExtensions:
        parsedAllowedImage !== undefined
          ? JSON.stringify(parsedAllowedImage)
          : settings.allowedImageExtensions,
      allowedDocumentExtensions:
        parsedAllowedDocument !== undefined
          ? JSON.stringify(parsedAllowedDocument)
          : settings.allowedDocumentExtensions,
      allowedArchiveExtensions:
        parsedAllowedArchive !== undefined
          ? JSON.stringify(parsedAllowedArchive)
          : settings.allowedArchiveExtensions,
      allowedMediaExtensions:
        parsedAllowedMedia !== undefined
          ? JSON.stringify(parsedAllowedMedia)
          : settings.allowedMediaExtensions,
      defaultPageSize: defaultPageSize !== undefined ? defaultPageSize : settings.defaultPageSize,
      securityLogRetentionDays:
        securityLogRetentionDays !== undefined
          ? securityLogRetentionDays
          : settings.securityLogRetentionDays,
      errorLogRetentionDays:
        errorLogRetentionDays !== undefined
          ? errorLogRetentionDays
          : settings.errorLogRetentionDays,
      deletedPostRetentionDays:
        deletedPostRetentionDays !== undefined
          ? deletedPostRetentionDays
          : settings.deletedPostRetentionDays,
      jwtAccessTokenHours:
        jwtAccessTokenHours !== undefined ? jwtAccessTokenHours : settings.jwtAccessTokenHours,
      jwtRefreshTokenDays:
        jwtRefreshTokenDays !== undefined ? jwtRefreshTokenDays : settings.jwtRefreshTokenDays,
      postTitleMaxLength:
        postTitleMaxLength !== undefined ? postTitleMaxLength : settings.postTitleMaxLength,
      postContentMaxLength:
        postContentMaxLength !== undefined ? postContentMaxLength : settings.postContentMaxLength,
      postSecretPasswordMinLength:
        postSecretPasswordMinLength !== undefined
          ? postSecretPasswordMinLength
          : settings.postSecretPasswordMinLength,
      globalSearchLimit:
        globalSearchLimit !== undefined ? globalSearchLimit : settings.globalSearchLimit,
      allowGuestComment:
        allowGuestComment !== undefined ? allowGuestComment : settings.allowGuestComment,
      minPasswordLength:
        minPasswordLength !== undefined ? minPasswordLength : settings.minPasswordLength,
      requireUppercase:
        requireUppercase !== undefined ? requireUppercase : settings.requireUppercase,
      requireLowercase:
        requireLowercase !== undefined ? requireLowercase : settings.requireLowercase,
      requireNumberOrSpecial:
        requireNumberOrSpecial !== undefined
          ? requireNumberOrSpecial
          : settings.requireNumberOrSpecial,
      commentMaxDepth: commentMaxDepth !== undefined ? commentMaxDepth : settings.commentMaxDepth,
      commentMaxCount: commentMaxCount !== undefined ? commentMaxCount : settings.commentMaxCount,
      avatarSizePx: avatarSizePx !== undefined ? avatarSizePx : settings.avatarSizePx,
      avatarQuality: avatarQuality !== undefined ? avatarQuality : settings.avatarQuality,
      passwordResetTokenHours:
        passwordResetTokenHours !== undefined
          ? passwordResetTokenHours
          : settings.passwordResetTokenHours,
      autoSaveIntervalSeconds:
        autoSaveIntervalSeconds !== undefined
          ? autoSaveIntervalSeconds
          : settings.autoSaveIntervalSeconds,
      draftExpiryMinutes:
        draftExpiryMinutes !== undefined ? draftExpiryMinutes : settings.draftExpiryMinutes,
      memoMaxPerUser: memoMaxPerUser !== undefined ? memoMaxPerUser : settings.memoMaxPerUser,
      wikiOrder: wikiOrder !== undefined ? wikiOrder : settings.wikiOrder,
      commentContentMaxLength:
        commentContentMaxLength !== undefined
          ? commentContentMaxLength
          : settings.commentContentMaxLength,
      eventBodyMaxLength:
        eventBodyMaxLength !== undefined ? eventBodyMaxLength : settings.eventBodyMaxLength,
      eventLocationMaxLength:
        eventLocationMaxLength !== undefined
          ? eventLocationMaxLength
          : settings.eventLocationMaxLength,
      lotteryPrizes:
        parsedLotteryPrizes !== undefined
          ? JSON.stringify(parsedLotteryPrizes)
          : settings.lotteryPrizes,
      lotteryDailyLimit: intOrKeep(lotteryDailyLimit, settings.lotteryDailyLimit, 1, 200),
      lotteryDrawCost: intOrKeep(lotteryDrawCost, settings.lotteryDrawCost, 0, 100000),
      attendanceBonus: intOrKeep(attendanceBonus, settings.attendanceBonus, 0, 100000),
      duelMinStake: nextDuelMin,
      duelMaxStake: nextDuelMax,
      duelExpireMinutes: intOrKeep(duelExpireMinutes, settings.duelExpireMinutes, 1, 120),
      duelMaxOpenPerUser: intOrKeep(duelMaxOpenPerUser, settings.duelMaxOpenPerUser, 1, 20),
      attackCost: intOrKeep(attackCost, settings.attackCost, 0, 100000),
      attackHideCost: intOrKeep(attackHideCost, settings.attackHideCost, 0, 100000),
      // 숨기는 동안은 실제로 누를 수 없으므로 상한을 짧게 둔다.
      attackHideSeconds: intOrKeep(attackHideSeconds, settings.attackHideSeconds, 3, 60),
      attackDefendCost: intOrKeep(attackDefendCost, settings.attackDefendCost, 0, 100000),
      attackBlockSeconds: intOrKeep(attackBlockSeconds, settings.attackBlockSeconds, 5, 600),
      attackDailyLimit: intOrKeep(attackDailyLimit, settings.attackDailyLimit, 1, 100),
      workStatusLabels:
        parsedWorkStatusLabels !== undefined
          ? JSON.stringify(parsedWorkStatusLabels)
          : settings.workStatusLabels,
    });

    refreshMaintenanceCache();
    await refreshSettingsCache();
    // 업로드 제한이 바뀔 수 있으므로 multer 인스턴스를 다시 만든다.
    refreshUploaders();
    // OG 메타를 다시 주입하려면 index.html 캐시를 버려야 한다.
    invalidateIndexHtmlCache();

    const authReq = req as unknown as AuthRequest;
    auditLogService
      .createAuditLog({
        actorId: authReq.user?.id ?? 'unknown',
        actorName: authReq.user?.name ?? 'unknown',
        action: 'update_site_settings',
        targetType: 'setting',
        targetId: 'site-settings',
        afterValue: { siteName: settings.siteName },
        ipAddress: req.ip ?? null,
      })
      .catch(err => logError('사이트 설정 감사 로그 기록 실패', err));

    logInfo('사이트 설정 업데이트', { siteName: settings.siteName });
    sendSuccess(res, toPayload(settings), '사이트 설정이 업데이트되었습니다.');
  } catch (error) {
    logError('사이트 설정 업데이트 실패', error);
    sendError(res, 500, '사이트 설정 업데이트에 실패했습니다.');
  }
};

/** POST /api/site-settings/upload-asset — admin only, multer applied in route */
export const uploadSiteAsset = async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    return sendError(res, 400, '파일을 선택해주세요.');
  }
  const assetUrl = `/uploads/images/${req.file.filename}`;
  sendSuccess(res, { url: assetUrl }, '파일이 업로드되었습니다.');
};
