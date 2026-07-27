// client/src/store/siteSettings.ts
import { create } from 'zustand';

export interface SiteSettings {
  siteName: string;
  siteTitle: string;
  faviconUrl: string | null;
  logoUrl: string | null;
  description: string | null;
  allowRegistration: boolean;
  requireApproval: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  loginMessage: string | null;
  // ── 업로드 제한 ────────────────────────────────────────────────────────────
  maxFileCount: number;
  maxFileSizeMb: number;
  maxImageSizeMb: number;
  maxAvatarSizeMb: number;
  maxArchiveSizeMb: number;
  maxImageCount: number;
  allowedImageExtensions: string[];
  allowedDocumentExtensions: string[];
  allowedArchiveExtensions: string[];
  allowedMediaExtensions: string[];
  // ── 게시글 제한 ────────────────────────────────────────────────────────────
  postTitleMaxLength: number;
  postContentMaxLength: number;
  postSecretPasswordMinLength: number;
  // ── 계정 보안 ──────────────────────────────────────────────────────────────
  minPasswordLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumberOrSpecial: boolean;
  allowGuestComment: boolean;
  // ── 댓글 설정 ──────────────────────────────────────────────────────────────
  commentMaxDepth: number;
  commentMaxCount: number;
  // ── 아바타 처리 ────────────────────────────────────────────────────────────
  avatarSizePx: number;
  avatarQuality: number;
  // ── 에디터 설정 ────────────────────────────────────────────────────────────
  autoSaveIntervalSeconds: number;
  draftExpiryMinutes: number;
  // ── 신규: 관리자 조정 가능 ────────────────────────────────────────────────
  memoMaxPerUser: number;
  commentContentMaxLength: number;
  eventBodyMaxLength: number;
  eventLocationMaxLength: number;
  // ── 계정/잠금 설정 ─────────────────────────────────────────────────────────
  maxLoginAttempts: number;
  accountLockMinutes: number;
  bcryptRounds: number;
  defaultPageSize: number;
  // ── 로그 보존 ──────────────────────────────────────────────────────────────
  securityLogRetentionDays: number;
  errorLogRetentionDays: number;
  deletedPostRetentionDays: number;
  // ── JWT 만료 ───────────────────────────────────────────────────────────────
  jwtAccessTokenHours: number;
  jwtRefreshTokenDays: number;
  // ── 기타 설정 ──────────────────────────────────────────────────────────────
  globalSearchLimit: number;
  passwordResetTokenHours: number;
  // ── Rate Limit ─────────────────────────────────────────────────────────────
  rateLimitApiMax: number;
  rateLimitAuthMax: number;
  rateLimitUploadMax: number;
  rateLimitDownloadMax: number;
}

interface SiteSettingsStore {
  settings: SiteSettings;
  isLoadedFromServer: boolean; // ✅ 서버에서 설정을 실제로 받아왔는지 여부
  setSettings: (settings: SiteSettings) => void;
  updateSettings: (settings: Partial<SiteSettings>) => void;
}

export const useSiteSettings = create<SiteSettingsStore>(set => ({
  isLoadedFromServer: false,
  settings: {
    siteName: 'TinyCommunity',
    siteTitle: 'TinyCommunity',
    faviconUrl: null,
    logoUrl: null,
    description: null,
    allowRegistration: true,
    requireApproval: false,
    maintenanceMode: false,
    maintenanceMessage: null,
    loginMessage: null,
    // 업로드 제한 기본값
    maxFileCount: 5,
    maxFileSizeMb: 100,
    maxImageSizeMb: 10,
    maxAvatarSizeMb: 5,
    maxArchiveSizeMb: 100,
    maxImageCount: 1,
    allowedImageExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.ico'],
    allowedDocumentExtensions: [
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
    allowedArchiveExtensions: ['.zip', '.rar', '.7z', '.tar', '.gz'],
    allowedMediaExtensions: ['.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm'],
    // 게시글 제한 기본값
    postTitleMaxLength: 200,
    postContentMaxLength: 500000,
    postSecretPasswordMinLength: 4,
    // 계정 보안 기본값
    minPasswordLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumberOrSpecial: true,
    allowGuestComment: false,
    // 댓글 설정 기본값
    commentMaxDepth: 3,
    commentMaxCount: 1000,
    // 아바타 처리 기본값
    avatarSizePx: 200,
    avatarQuality: 90,
    // 에디터 설정 기본값
    autoSaveIntervalSeconds: 30,
    draftExpiryMinutes: 60,
    // 신규: 관리자 조정 가능 기본값
    memoMaxPerUser: 200,
    commentContentMaxLength: 1000,
    eventBodyMaxLength: 10000,
    eventLocationMaxLength: 500,
    // 계정/잠금 설정 기본값
    maxLoginAttempts: 5,
    accountLockMinutes: 30,
    bcryptRounds: 10,
    defaultPageSize: 10,
    // 로그 보존 기본값
    securityLogRetentionDays: 90,
    errorLogRetentionDays: 30,
    deletedPostRetentionDays: 7,
    // JWT 만료 기본값
    jwtAccessTokenHours: 2,
    jwtRefreshTokenDays: 3,
    // 기타 설정 기본값
    globalSearchLimit: 50,
    passwordResetTokenHours: 1,
    // Rate Limit 기본값
    rateLimitApiMax: 200,
    rateLimitAuthMax: 10,
    rateLimitUploadMax: 20,
    rateLimitDownloadMax: 100,
  },
  setSettings: settings => set({ settings, isLoadedFromServer: true }),
  updateSettings: newSettings =>
    set(state => ({
      settings: { ...state.settings, ...newSettings },
    })),
}));
