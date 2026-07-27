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
import { invalidateIndexHtmlCache } from '../utils/indexHtml';
import { auditLogService } from '../services/auditLog.service';

/** All fields we expose / accept */
const DEFAULTS = {
  siteName: 'TinyCommunity',
  siteTitle: 'TinyCommunity',
  faviconUrl: null as string | null,
  logoUrl: null as string | null,
  description: null as string | null,
  allowRegistration: true,
  requireApproval: false,
  maintenanceMode: false,
  maintenanceMessage: null as string | null,
  loginMessage: null as string | null,
  // ✅ 숫자/불리언 설정은 settingsCache.ts의 SETTINGS_DEFAULTS를 단일 소스로 사용
  ...SETTINGS_DEFAULTS,
  // ✅ 허용 확장자는 Sequelize TEXT 컬럼에 저장되므로 JSON 문자열로 직렬화
  allowedImageExtensions: JSON.stringify(SETTINGS_DEFAULTS.allowedImageExtensions),
  allowedDocumentExtensions: JSON.stringify(SETTINGS_DEFAULTS.allowedDocumentExtensions),
  allowedArchiveExtensions: JSON.stringify(SETTINGS_DEFAULTS.allowedArchiveExtensions),
  allowedMediaExtensions: JSON.stringify(SETTINGS_DEFAULTS.allowedMediaExtensions),
};

// ─── 허용 확장자 유효성 검사 ────────────────────────────────────────────────────

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

function toPayload(s: SiteSettings) {
  return {
    siteName: s.siteName,
    siteTitle: s.siteTitle,
    faviconUrl: s.faviconUrl,
    logoUrl: s.logoUrl,
    description: s.description,
    allowRegistration: s.allowRegistration,
    requireApproval: s.requireApproval,
    maintenanceMode: s.maintenanceMode,
    maintenanceMessage: s.maintenanceMessage,
    loginMessage: s.loginMessage,
    maxLoginAttempts: s.maxLoginAttempts ?? DEFAULTS.maxLoginAttempts,
    accountLockMinutes: s.accountLockMinutes ?? DEFAULTS.accountLockMinutes,
    maxFileCount: s.maxFileCount ?? DEFAULTS.maxFileCount,
    maxFileSizeMb: s.maxFileSizeMb ?? DEFAULTS.maxFileSizeMb,
    maxImageSizeMb: s.maxImageSizeMb ?? DEFAULTS.maxImageSizeMb,
    maxAvatarSizeMb: s.maxAvatarSizeMb ?? DEFAULTS.maxAvatarSizeMb,
    maxArchiveSizeMb: s.maxArchiveSizeMb ?? DEFAULTS.maxArchiveSizeMb,
    maxImageCount: s.maxImageCount ?? DEFAULTS.maxImageCount,
    bcryptRounds: s.bcryptRounds ?? DEFAULTS.bcryptRounds,
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
    securityLogRetentionDays: s.securityLogRetentionDays ?? DEFAULTS.securityLogRetentionDays,
    errorLogRetentionDays: s.errorLogRetentionDays ?? DEFAULTS.errorLogRetentionDays,
    deletedPostRetentionDays: s.deletedPostRetentionDays ?? DEFAULTS.deletedPostRetentionDays,
    jwtAccessTokenHours: s.jwtAccessTokenHours ?? DEFAULTS.jwtAccessTokenHours,
    jwtRefreshTokenDays: s.jwtRefreshTokenDays ?? DEFAULTS.jwtRefreshTokenDays,
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
    passwordResetTokenHours: s.passwordResetTokenHours ?? DEFAULTS.passwordResetTokenHours,
    rateLimitApiMax: s.rateLimitApiMax ?? DEFAULTS.rateLimitApiMax,
    rateLimitAuthMax: s.rateLimitAuthMax ?? DEFAULTS.rateLimitAuthMax,
    rateLimitUploadMax: s.rateLimitUploadMax ?? DEFAULTS.rateLimitUploadMax,
    rateLimitDownloadMax: s.rateLimitDownloadMax ?? DEFAULTS.rateLimitDownloadMax,
    autoSaveIntervalSeconds: s.autoSaveIntervalSeconds ?? DEFAULTS.autoSaveIntervalSeconds,
    draftExpiryMinutes: s.draftExpiryMinutes ?? DEFAULTS.draftExpiryMinutes,
    memoMaxPerUser: s.memoMaxPerUser ?? DEFAULTS.memoMaxPerUser,
    commentContentMaxLength: s.commentContentMaxLength ?? DEFAULTS.commentContentMaxLength,
    eventBodyMaxLength: s.eventBodyMaxLength ?? DEFAULTS.eventBodyMaxLength,
    eventLocationMaxLength: s.eventLocationMaxLength ?? DEFAULTS.eventLocationMaxLength,
  };
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

/** PUT /api/site-settings — admin only */
export const updateSiteSettings = async (req: Request, res: Response) => {
  try {
    const {
      siteName,
      siteTitle,
      faviconUrl,
      logoUrl,
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
      rateLimitApiMax,
      rateLimitAuthMax,
      rateLimitUploadMax,
      rateLimitDownloadMax,
      autoSaveIntervalSeconds,
      draftExpiryMinutes,
      memoMaxPerUser,
      commentContentMaxLength,
      eventBodyMaxLength,
      eventLocationMaxLength,
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
      [postTitleMaxLength, 'postTitleMaxLength', 10, 500],
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
      [rateLimitApiMax, 'rateLimitApiMax', 50, 1000],
      [rateLimitAuthMax, 'rateLimitAuthMax', 3, 100],
      [rateLimitUploadMax, 'rateLimitUploadMax', 5, 200],
      [rateLimitDownloadMax, 'rateLimitDownloadMax', 10, 500],
      // 에디터
      [autoSaveIntervalSeconds, 'autoSaveIntervalSeconds', 10, 300],
      [draftExpiryMinutes, 'draftExpiryMinutes', 10, 1440],
      // 신규 (관리자 조정 가능 항목 — 사용자 메모 한도/댓글·이벤트 길이)
      [memoMaxPerUser, 'memoMaxPerUser', 10, 2000],
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

    let parsedAllowedImage: string[] | undefined;
    let parsedAllowedDocument: string[] | undefined;
    let parsedAllowedArchive: string[] | undefined;
    let parsedAllowedMedia: string[] | undefined;

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
    } catch (validationError) {
      const msg = validationError instanceof Error ? validationError.message : '확장자 형식 오류';
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
      rateLimitApiMax: rateLimitApiMax !== undefined ? rateLimitApiMax : settings.rateLimitApiMax,
      rateLimitAuthMax:
        rateLimitAuthMax !== undefined ? rateLimitAuthMax : settings.rateLimitAuthMax,
      rateLimitUploadMax:
        rateLimitUploadMax !== undefined ? rateLimitUploadMax : settings.rateLimitUploadMax,
      rateLimitDownloadMax:
        rateLimitDownloadMax !== undefined ? rateLimitDownloadMax : settings.rateLimitDownloadMax,
      autoSaveIntervalSeconds:
        autoSaveIntervalSeconds !== undefined
          ? autoSaveIntervalSeconds
          : settings.autoSaveIntervalSeconds,
      draftExpiryMinutes:
        draftExpiryMinutes !== undefined ? draftExpiryMinutes : settings.draftExpiryMinutes,
      memoMaxPerUser: memoMaxPerUser !== undefined ? memoMaxPerUser : settings.memoMaxPerUser,
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
        adminId: authReq.user?.id ?? 'unknown',
        adminName: authReq.user?.name ?? 'unknown',
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
