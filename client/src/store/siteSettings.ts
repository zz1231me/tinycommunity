import { create } from 'zustand';
import { readCachedIdentity } from '../utils/siteIdentityCache';

export interface SiteSettings {
  siteName: string;
  siteTitle: string;
  faviconUrl: string | null;
  logoUrl: string | null;
  /** 관리자가 고른 브랜드 색 (null = 기본 디자인 시스템 색) */
  themePrimaryColor: string | null;
  themeSecondaryColor: string | null;
  description: string | null;
  allowRegistration: boolean;
  requireApproval: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  loginMessage: string | null;
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
  postTitleMaxLength: number;
  postContentMaxLength: number;
  postSecretPasswordMinLength: number;
  minPasswordLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumberOrSpecial: boolean;
  allowGuestComment: boolean;
  commentMaxDepth: number;
  commentMaxCount: number;
  avatarSizePx: number;
  avatarQuality: number;
  autoSaveIntervalSeconds: number;
  draftExpiryMinutes: number;
  memoMaxPerUser: number;
  /** 사이드바에서 위키가 게시판 목록 몇 번째에 오는지 */
  wikiOrder: number;
  commentContentMaxLength: number;
  eventBodyMaxLength: number;
  eventLocationMaxLength: number;
  workStatusLabels: Record<string, string>;
  lotteryPrizes: { amount: number; weight: number }[];
  lotteryDailyLimit: number;
  lotteryDrawCost: number;
  attendanceBonus: number;
  /** 포인트 대결 — 한 판에 걸 수 있는 금액의 아래위 */
  duelMinStake: number;
  duelMaxStake: number;
  /** 상대가 답하지 않으면 무효가 되기까지의 시간(분) */
  duelExpireMinutes: number;
  /** 한 사람이 동시에 걸어 둘 수 있는 판 수 */
  duelMaxOpenPerUser: number;
  /** 퇴근 방해 한 장 값 */
  attackCost: number;
  /** 퇴근 버튼 숨기기 한 장 값 */
  attackHideCost: number;
  /** 퇴근 버튼이 보이지 않는 시간(초) */
  attackHideSeconds: number;
  /** 방어권 한 장 값 */
  attackDefendCost: number;
  /** 퇴근 버튼이 말을 안 듣는 시간(초) */
  attackBlockSeconds: number;
  /** 한 사람이 하루에 쓸 수 있는 공격 횟수 */
  attackDailyLimit: number;
  maxLoginAttempts: number;
  accountLockMinutes: number;
  bcryptRounds: number;
  defaultPageSize: number;
  securityLogRetentionDays: number;
  errorLogRetentionDays: number;
  deletedPostRetentionDays: number;
  jwtAccessTokenHours: number;
  jwtRefreshTokenDays: number;
  globalSearchLimit: number;
  passwordResetTokenHours: number;
}

interface SiteSettingsStore {
  settings: SiteSettings;
  isLoadedFromServer: boolean; // 서버에서 설정을 실제로 받아왔는지
  setSettings: (settings: SiteSettings) => void;
  updateSettings: (settings: Partial<SiteSettings>) => void;
}

/**
 * 서버 응답에 없는 키를 메우는 기본값.
 * 공개 설정 응답에는 보안 설정(로그인 잠금·bcrypt·토큰 수명·rate limit·로그 보관)이 빠져 있다.
 */
export const DEFAULT_SETTINGS: SiteSettings = {
  siteName: 'TinyCommunity',
  siteTitle: 'TinyCommunity',
  faviconUrl: null,
  logoUrl: null,
  themePrimaryColor: null,
  themeSecondaryColor: null,
  description: null,
  allowRegistration: true,
  requireApproval: false,
  maintenanceMode: false,
  maintenanceMessage: null,
  loginMessage: null,
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
  postTitleMaxLength: 200,
  postContentMaxLength: 500000,
  postSecretPasswordMinLength: 4,
  minPasswordLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumberOrSpecial: true,
  allowGuestComment: false,
  commentMaxDepth: 3,
  commentMaxCount: 1000,
  avatarSizePx: 200,
  avatarQuality: 90,
  autoSaveIntervalSeconds: 30,
  draftExpiryMinutes: 60,
  memoMaxPerUser: 200,
  wikiOrder: 9999,
  commentContentMaxLength: 1000,
  eventBodyMaxLength: 10000,
  eventLocationMaxLength: 500,
  workStatusLabels: {},
  lotteryPrizes: [
    { amount: 1500, weight: 3 },
    { amount: 1000, weight: 10 },
    { amount: 700, weight: 30 },
    { amount: 50, weight: 50 },
  ],
  lotteryDailyLimit: 10,
  lotteryDrawCost: 0,
  attendanceBonus: 500,
  // 서버 config/duel.ts · config/attendanceAttack.ts 의 기본값과 같다. 응답이 오면 덮어쓴다.
  duelMinStake: 10,
  duelMaxStake: 10000,
  duelExpireMinutes: 10,
  duelMaxOpenPerUser: 3,
  attackCost: 300,
  attackHideCost: 300,
  attackHideSeconds: 20,
  attackDefendCost: 200,
  attackBlockSeconds: 60,
  attackDailyLimit: 5,
  maxLoginAttempts: 5,
  accountLockMinutes: 30,
  bcryptRounds: 10,
  defaultPageSize: 10,
  securityLogRetentionDays: 90,
  errorLogRetentionDays: 30,
  deletedPostRetentionDays: 7,
  jwtAccessTokenHours: 2,
  jwtRefreshTokenDays: 3,
  globalSearchLimit: 50,
  passwordResetTokenHours: 1,
};

export const useSiteSettings = create<SiteSettingsStore>(set => ({
  isLoadedFromServer: false,
  // 마지막으로 받아온 이름을 먼저 쓴다. 안 그러면 설정을 받기 전까지 코드에 박힌 기본 이름이 보인다.
  settings: { ...DEFAULT_SETTINGS, ...readCachedIdentity() },
  // 서버 값으로 교체하되, 응답에 없는 키는 기본값을 유지한다.
  setSettings: settings =>
    set({ settings: { ...DEFAULT_SETTINGS, ...settings }, isLoadedFromServer: true }),
  updateSettings: newSettings =>
    set(state => ({
      settings: { ...state.settings, ...newSettings },
    })),
}));
