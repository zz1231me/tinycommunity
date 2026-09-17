// src/controllers/siteSettings.ts
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
  // 브랜드 색 — null 이면 기본 디자인 시스템 색
  themePrimaryColor: null as string | null,
  themeSecondaryColor: null as string | null,
  description: null as string | null,
  allowRegistration: true,
  requireApproval: false,
  maintenanceMode: false,
  maintenanceMessage: null as string | null,
  loginMessage: null as string | null,
  // 숫자/불리언 설정은 settingsCache.ts의 SETTINGS_DEFAULTS를 단일 소스로 사용
  ...SETTINGS_DEFAULTS,
  // 허용 확장자는 Sequelize TEXT 컬럼에 저장되므로 JSON 문자열로 직렬화
  allowedImageExtensions: JSON.stringify(SETTINGS_DEFAULTS.allowedImageExtensions),
  allowedDocumentExtensions: JSON.stringify(SETTINGS_DEFAULTS.allowedDocumentExtensions),
  allowedArchiveExtensions: JSON.stringify(SETTINGS_DEFAULTS.allowedArchiveExtensions),
  allowedMediaExtensions: JSON.stringify(SETTINGS_DEFAULTS.allowedMediaExtensions),
  // 업무 상태 이름도 같은 이유로 JSON 문자열이다 (빈 객체 = 코드 기본값 사용)
  workStatusLabels: JSON.stringify(SETTINGS_DEFAULTS.workStatusLabels),
  // 로또 상품표도 같은 이유로 JSON 문자열
  lotteryPrizes: JSON.stringify(SETTINGS_DEFAULTS.lotteryPrizes),
};

// ─── 허용 확장자 유효성 검사 ────────────────────────────────────────────────────

/**
 * 업무 상태 이름 검사.
 *
 * 키는 코드가 아는 것만 받는다 — 모르는 키를 저장하면 어디에도 안 쓰이는 값이 쌓이고,
 * 나중에 상태를 늘렸을 때 옛 오타가 되살아난다.
 * 빈 문자열은 "기본값을 쓰겠다" 는 뜻이므로 저장하지 않는다.
 */
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

/** 저장된 JSON 을 화면이 쓰는 객체로. 깨져 있으면 빈 객체 — 이름 하나로 설정 화면이 막히면 안 된다 */
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
  // 보안상 위험한 절대차단 확장자는 화이트리스트에 추가 불가 (인라인 서빙 이미지의 저장형 XSS 방지)
  for (const ext of normalized) {
    if (BLOCKED_EXTENSIONS_FLOOR.includes(ext)) {
      throw new Error(`${field}에 보안상 위험한 확장자(${ext})는 추가할 수 없습니다.`);
    }
  }
  return normalized;
}

// ─── DB → 응답 페이로드 변환 ─────────────────────────────────────────────────────

function parseExtensionField(raw: string | null | undefined, fallback: string[]): string[] {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/**
 * 익명 방문자도 받는 공개 설정.
 *
 * 브랜딩·업로드 한도·글자수 제한처럼 화면이 실제로 쓰는 값만 담는다.
 * 로그인 잠금 횟수, bcrypt 라운드, 토큰 수명, rate limit 상한, 로그 보관 기간은
 * 공격자에게 "몇 번까지 시도할 수 있고 얼마나 기다리면 되는지"를 그대로 알려주므로
 * adminOnlyPayload() 로 분리해 관리자만 받는다.
 */
/** 저장된 상품표를 화면용 배열로. 깨져 있으면 기본값 — 화면이 빈 표를 그리는 것보다 낫다 */
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
    // 업무 상태 이름 — 비어 있으면 화면이 코드 기본값을 쓴다
    workStatusLabels: parseLabelField(s.workStatusLabels),
    // 로또 규칙 — 확률표는 사용자에게도 보여야 한다(가려 두면 신뢰할 수 없는 뽑기가 된다)
    lotteryPrizes: parsePrizeField(s.lotteryPrizes),
    lotteryDailyLimit: s.lotteryDailyLimit ?? DEFAULTS.lotteryDailyLimit,
    lotteryDrawCost: s.lotteryDrawCost ?? DEFAULTS.lotteryDrawCost,
    attendanceBonus: s.attendanceBonus ?? DEFAULTS.attendanceBonus,
  };
}

/** 관리자 화면(설정 폼)만 받는 보안 설정 — 공개 응답에는 포함하지 않는다. */
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

/**
 * 숫자 설정값을 범위 안으로 받아들인다. 값이 없으면 기존 값을 유지한다.
 *
 * 로또 설정은 잘못된 값이 들어가도 화면에는 숫자가 정상으로 보인다. 하루 한도가 0 이면
 * 뽑기가 막히고 음수면 계산이 뒤집히므로 저장 시점에 검사한다.
 */
function intOrKeep(value: unknown, current: number, min: number, max: number): number {
  if (value === undefined || value === null || value === '') return current;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return current;
  return n;
}

/** GET /api/site-settings — public */
export const getSiteSettings = async (_req: Request, res: Response) => {
  try {
    // findOrCreate로 원자적 처리 — 동시 요청 시 설정 행 중복 생성 방지
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
    } = req.body;

    // ── 입력 유효성 검사 ──────────────────────────────────────────────────────
    if (bcryptRounds !== undefined) {
      const rounds = Number(bcryptRounds);
      if (!Number.isInteger(rounds) || rounds < 10 || rounds > 14) {
        return sendError(res, 400, 'bcryptRounds는 10~14 사이의 정수여야 합니다.');
      }
    }

    // 숫자 범위 검증 헬퍼
    function validateInt(value: unknown, field: string, min: number, max: number): string | null {
      const v = Number(value);
      if (!Number.isInteger(v) || v < min || v > max) {
        return `${field}는 ${min}~${max} 사이의 정수여야 합니다.`;
      }
      return null;
    }

    const numericChecks: Array<[unknown, string, number, number]> = [
      // 계정 보안
      [maxLoginAttempts, 'maxLoginAttempts', 1, 20],
      [accountLockMinutes, 'accountLockMinutes', 1, 1440],
      [minPasswordLength, 'minPasswordLength', 6, 72],
      // 파일 업로드
      [maxFileCount, 'maxFileCount', 1, 20],
      [maxFileSizeMb, 'maxFileSizeMb', 1, 1000],
      [maxImageSizeMb, 'maxImageSizeMb', 1, 500],
      [maxAvatarSizeMb, 'maxAvatarSizeMb', 1, 100],
      [maxArchiveSizeMb, 'maxArchiveSizeMb', 1, 1000],
      [maxImageCount, 'maxImageCount', 1, 20],
      // 게시글 설정
      [defaultPageSize, 'defaultPageSize', 5, 100],
      // 제목 컬럼 중 가장 작은 것이 WikiPage.title STRING(200) 이다
      [postTitleMaxLength, 'postTitleMaxLength', 10, 200],
      [postContentMaxLength, 'postContentMaxLength', 1000, 2000000],
      [postSecretPasswordMinLength, 'postSecretPasswordMinLength', 4, 20],
      [globalSearchLimit, 'globalSearchLimit', 10, 200],
      // 로그 보존
      [securityLogRetentionDays, 'securityLogRetentionDays', 7, 365],
      [errorLogRetentionDays, 'errorLogRetentionDays', 7, 365],
      [deletedPostRetentionDays, 'deletedPostRetentionDays', 1, 365],
      // JWT 토큰 유효시간
      [jwtAccessTokenHours, 'jwtAccessTokenHours', 1, 168],
      [jwtRefreshTokenDays, 'jwtRefreshTokenDays', 1, 30],
      // 댓글 설정
      [commentMaxDepth, 'commentMaxDepth', 1, 5],
      [commentMaxCount, 'commentMaxCount', 100, 5000],
      // 아바타 처리
      [avatarSizePx, 'avatarSizePx', 50, 500],
      [avatarQuality, 'avatarQuality', 50, 100],
      // 비밀번호 재설정
      [passwordResetTokenHours, 'passwordResetTokenHours', 1, 48],
      // Rate limit
      // 에디터
      [autoSaveIntervalSeconds, 'autoSaveIntervalSeconds', 10, 300],
      [draftExpiryMinutes, 'draftExpiryMinutes', 10, 1440],
      // 신규 (관리자 조정 가능 항목 — 사용자 메모 한도/댓글·이벤트 길이)
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

    // ── 문자열 길이 검증 (DB 컬럼 길이와 정합) ────────────────────────────────
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

    // ── URL 형식 검증 (javascript:/data: 등 차단) ─────────────────────────────
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

    // ── 색상 형식 검증 ────────────────────────────────────────────────────────
    // 이 값은 클라이언트에서 CSS 변수로 그대로 주입되므로, 형식이 느슨하면
    // 스타일시트에 임의 문자열이 들어간다. #rgb/#rrggbb 만 허용한다.
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
      // 업무 상태 이름도 저장 전에 여기서 검사한다.
      // DB 저장 구문 안에서 검사하면 잘못된 값이 이 catch 를 지나쳐 바깥으로 튀어,
      // 400 이어야 할 응답이 500 으로 나간다.
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

    // ── DB 저장 ───────────────────────────────────────────────────────────────
    // findOrCreate로 원자적 처리 — 동시 요청 시 설정 행 중복 생성 방지
    // 신규 생성 시: settings.field = DEFAULTS.field → 아래 update의 `settings.field` 폴백이 곧 DEFAULTS
    const [settings] = await SiteSettings.findOrCreate({ where: {}, defaults: DEFAULTS });

    await settings.update({
      siteName: siteName !== undefined ? siteName : settings.siteName,
      siteTitle: siteTitle !== undefined ? siteTitle : settings.siteTitle,
      faviconUrl: faviconUrl !== undefined ? faviconUrl : settings.faviconUrl,
      // 빈 문자열은 "기본색으로 되돌리기" 로 본다
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
      lotteryDailyLimit: intOrKeep(lotteryDailyLimit, settings.lotteryDailyLimit, 1, 100),
      lotteryDrawCost: intOrKeep(lotteryDrawCost, settings.lotteryDrawCost, 0, 100000),
      attendanceBonus: intOrKeep(attendanceBonus, settings.attendanceBonus, 0, 100000),
      workStatusLabels:
        parsedWorkStatusLabels !== undefined
          ? JSON.stringify(parsedWorkStatusLabels)
          : settings.workStatusLabels,
    });

    // ── 캐시 갱신 ─────────────────────────────────────────────────────────────
    refreshMaintenanceCache();
    await refreshSettingsCache();
    // 파일 크기·허용 확장자·이미지 개수가 변경될 수 있으므로 multer 인스턴스 재빌드
    refreshUploaders();
    // 사이트 이름/타이틀/설명 변경 시 링크 미리보기 OG 메타 재주입을 위해 캐시 무효화
    invalidateIndexHtmlCache();

    // ── 감사 로그 ─────────────────────────────────────────────────────────────
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
