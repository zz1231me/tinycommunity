// client/src/api/siteSettings.ts
import api, { uploadApi } from './axios';

export interface SiteSettings {
  siteName: string;
  siteTitle: string;
  faviconUrl: string | null;
  logoUrl: string | null;
  /** 관리자가 고른 브랜드 색 (null = 기본 색) */
  themePrimaryColor: string | null;
  themeSecondaryColor: string | null;
  description: string | null;
  allowRegistration: boolean;
  requireApproval: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  loginMessage: string | null;
  maxLoginAttempts: number;
  accountLockMinutes: number;
  maxFileCount: number;
  maxFileSizeMb: number;
  /** 이미지 파일 1개당 최대 크기 (MB) */
  maxImageSizeMb: number;
  /** 아바타 이미지 최대 크기 (MB) */
  maxAvatarSizeMb: number;
  /** 압축파일 최대 크기 (MB) */
  maxArchiveSizeMb: number;
  /** 에디터 이미지 업로드 최대 개수 */
  maxImageCount: number;
  /** bcrypt 해싱 라운드 (10~14) */
  bcryptRounds: number;
  /** 허용 이미지 확장자 목록 (예: ['.jpg', '.png']) */
  allowedImageExtensions: string[];
  /** 허용 문서 확장자 목록 */
  allowedDocumentExtensions: string[];
  /** 허용 압축파일 확장자 목록 */
  allowedArchiveExtensions: string[];
  /** 허용 미디어 확장자 목록 */
  allowedMediaExtensions: string[];
  defaultPageSize: number;
  securityLogRetentionDays: number;
  errorLogRetentionDays: number;
  deletedPostRetentionDays: number;
  jwtAccessTokenHours: number;
  jwtRefreshTokenDays: number;
  postTitleMaxLength: number;
  postContentMaxLength: number;
  postSecretPasswordMinLength: number;
  globalSearchLimit: number;
  allowGuestComment: boolean;
  minPasswordLength: number;
  /** 비밀번호 영문 대문자 포함 필수 여부 */
  requireUppercase: boolean;
  /** 비밀번호 영문 소문자 포함 필수 여부 */
  requireLowercase: boolean;
  /** 비밀번호 숫자 또는 특수문자 포함 필수 여부 */
  requireNumberOrSpecial: boolean;
  /** 대댓글 최대 깊이 (1~5단계) */
  commentMaxDepth: number;
  /** 게시글당 최대 댓글 수 */
  commentMaxCount: number;
  /** 아바타 리사이징 크기 (px) */
  avatarSizePx: number;
  /** 아바타 JPEG 품질 (50~100) */
  avatarQuality: number;
  /** 비밀번호 재설정 토큰 유효시간 (시간) */
  passwordResetTokenHours: number;
  /** PostEditor 자동저장 주기 (초) */
  autoSaveIntervalSeconds: number;
  /** PostEditor 임시저장 복원 유효시간 (분) */
  draftExpiryMinutes: number;
  /** 사용자당 최대 메모 개수 */
  memoMaxPerUser: number;
  /** 사이드바에서 위키가 게시판 목록 몇 번째에 오는지 */
  wikiOrder: number;
  /** 댓글 본문 최대 글자수 */
  commentContentMaxLength: number;
  /** 이벤트 본문 최대 글자수 */
  eventBodyMaxLength: number;
  /** 이벤트 장소 최대 글자수 */
  eventLocationMaxLength: number;
  /** 업무 상태 표시 이름. 비어 있는 키는 기본 이름을 쓴다 */
  workStatusLabels: Record<string, string>;
  /** 로또 상품표. 확률 합이 100 미만이면 나머지가 꽝 */
  lotteryPrizes: { amount: number; weight: number }[];
  /** 하루에 뽑을 수 있는 횟수 */
  lotteryDailyLimit: number;
  lotteryDrawCost: number;
  /** 하루 한 번 접속 시 주는 포인트 */
  attendanceBonus: number;
}

/**
 * 사이트 설정 조회 (공개).
 *
 * 서버는 로그인 잠금·bcrypt 라운드·토큰 수명·rate limit·로그 보관 기간을 이 응답에서 빼므로
 * 그 값들은 스토어의 기본값으로 채워진다. 실제 값이 필요한 관리자 설정 폼은
 * getAdminSiteSettings() 를 쓴다.
 */
export const getSiteSettings = async (): Promise<SiteSettings> => {
  const response = await api.get('/site-settings');
  return response.data.data;
};

/** 보안 설정까지 포함한 전체 조회 (관리자 전용) */
export const getAdminSiteSettings = async (): Promise<SiteSettings> => {
  const response = await api.get('/site-settings/admin');
  return response.data.data;
};

/** 사이트 설정 업데이트 (관리자 전용) */
export const updateSiteSettings = async (data: Partial<SiteSettings>): Promise<SiteSettings> => {
  const response = await api.put('/site-settings', data);
  return response.data.data;
};

/** 로고/파비콘 파일 업로드 → URL 반환 */
export const uploadSiteAsset = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);
  // uploadApi: axios 인스턴스 사용 → 토큰 만료 시 자동 갱신 인터셉터 적용
  const res = await uploadApi.post('/site-settings/upload-asset', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  const data = res.data;
  const url = data?.data?.url ?? data?.url;
  if (!url) throw new Error('업로드 응답에 URL이 없습니다.');
  return url;
};
