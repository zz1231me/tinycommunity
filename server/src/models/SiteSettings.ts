// src/models/SiteSettings.ts
import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from 'sequelize';
import { sequelize } from '../config/sequelize';
import { LOTTERY_DEFAULTS } from '../config/lottery';

export interface SiteSettingsInstance extends Model<
  InferAttributes<SiteSettingsInstance>,
  InferCreationAttributes<SiteSettingsInstance>
> {
  id: CreationOptional<number>;
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
  maxLoginAttempts: CreationOptional<number>;
  accountLockMinutes: CreationOptional<number>;
  maxFileCount: CreationOptional<number>;
  maxFileSizeMb: CreationOptional<number>;
  maxImageSizeMb: CreationOptional<number>;
  maxAvatarSizeMb: CreationOptional<number>;
  maxArchiveSizeMb: CreationOptional<number>;
  maxImageCount: CreationOptional<number>;
  bcryptRounds: CreationOptional<number>;
  allowedImageExtensions: CreationOptional<string>;
  allowedDocumentExtensions: CreationOptional<string>;
  allowedArchiveExtensions: CreationOptional<string>;
  allowedMediaExtensions: CreationOptional<string>;
  defaultPageSize: CreationOptional<number>;
  securityLogRetentionDays: CreationOptional<number>;
  errorLogRetentionDays: CreationOptional<number>;
  deletedPostRetentionDays: CreationOptional<number>;
  jwtAccessTokenHours: CreationOptional<number>;
  jwtRefreshTokenDays: CreationOptional<number>;
  postTitleMaxLength: CreationOptional<number>;
  postContentMaxLength: CreationOptional<number>;
  postSecretPasswordMinLength: CreationOptional<number>;
  globalSearchLimit: CreationOptional<number>;
  allowGuestComment: CreationOptional<boolean>;
  minPasswordLength: CreationOptional<number>;
  requireUppercase: CreationOptional<boolean>;
  requireLowercase: CreationOptional<boolean>;
  requireNumberOrSpecial: CreationOptional<boolean>;
  commentMaxDepth: CreationOptional<number>;
  commentMaxCount: CreationOptional<number>;
  avatarSizePx: CreationOptional<number>;
  avatarQuality: CreationOptional<number>;
  passwordResetTokenHours: CreationOptional<number>;
  rateLimitApiMax: CreationOptional<number>;
  rateLimitAuthMax: CreationOptional<number>;
  rateLimitUploadMax: CreationOptional<number>;
  rateLimitDownloadMax: CreationOptional<number>;
  autoSaveIntervalSeconds: CreationOptional<number>;
  draftExpiryMinutes: CreationOptional<number>;
  wikiEditRoles: CreationOptional<string>;
  /** 업무 상태 표시 이름 (JSON). 키는 고정, 부르는 말만 팀에 맞춘다 */
  workStatusLabels: CreationOptional<string>;
  /** 로또 상품표 (JSON 배열: [{amount, weight}]). 확률 합이 100 미만이면 나머지가 꽝 */
  lotteryPrizes: CreationOptional<string>;
  lotteryDailyLimit: CreationOptional<number>;
  lotteryDrawCost: CreationOptional<number>;
  attendanceBonus: CreationOptional<number>;
  // ── 신규 (관리자 조정 가능) ────────────────────────────────────────────────
  memoMaxPerUser: CreationOptional<number>;
  commentContentMaxLength: CreationOptional<number>;
  eventBodyMaxLength: CreationOptional<number>;
  eventLocationMaxLength: CreationOptional<number>;
  // 브랜드 색 — null 이면 기본 디자인 시스템 색을 쓴다
  themePrimaryColor: CreationOptional<string | null>;
  themeSecondaryColor: CreationOptional<string | null>;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

export class SiteSettings
  extends Model<
    InferAttributes<SiteSettingsInstance>,
    InferCreationAttributes<SiteSettingsInstance>
  >
  implements SiteSettingsInstance
{
  declare public id: CreationOptional<number>;
  declare public siteName: string;
  declare public siteTitle: string;
  declare public faviconUrl: string | null;
  declare public logoUrl: string | null;
  declare public description: string | null;
  declare public allowRegistration: boolean;
  declare public requireApproval: boolean;
  declare public maintenanceMode: boolean;
  declare public maintenanceMessage: string | null;
  declare public loginMessage: string | null;
  declare public maxLoginAttempts: CreationOptional<number>;
  declare public accountLockMinutes: CreationOptional<number>;
  declare public maxFileCount: CreationOptional<number>;
  declare public maxFileSizeMb: CreationOptional<number>;
  declare public maxImageSizeMb: CreationOptional<number>;
  declare public maxAvatarSizeMb: CreationOptional<number>;
  declare public maxArchiveSizeMb: CreationOptional<number>;
  declare public maxImageCount: CreationOptional<number>;
  declare public bcryptRounds: CreationOptional<number>;
  declare public allowedImageExtensions: CreationOptional<string>;
  declare public allowedDocumentExtensions: CreationOptional<string>;
  declare public allowedArchiveExtensions: CreationOptional<string>;
  declare public allowedMediaExtensions: CreationOptional<string>;
  declare public defaultPageSize: CreationOptional<number>;
  declare public securityLogRetentionDays: CreationOptional<number>;
  declare public errorLogRetentionDays: CreationOptional<number>;
  declare public deletedPostRetentionDays: CreationOptional<number>;
  declare public jwtAccessTokenHours: CreationOptional<number>;
  declare public jwtRefreshTokenDays: CreationOptional<number>;
  declare public postTitleMaxLength: CreationOptional<number>;
  declare public postContentMaxLength: CreationOptional<number>;
  declare public postSecretPasswordMinLength: CreationOptional<number>;
  declare public globalSearchLimit: CreationOptional<number>;
  declare public allowGuestComment: CreationOptional<boolean>;
  declare public minPasswordLength: CreationOptional<number>;
  declare public requireUppercase: CreationOptional<boolean>;
  declare public requireLowercase: CreationOptional<boolean>;
  declare public requireNumberOrSpecial: CreationOptional<boolean>;
  declare public commentMaxDepth: CreationOptional<number>;
  declare public commentMaxCount: CreationOptional<number>;
  declare public avatarSizePx: CreationOptional<number>;
  declare public avatarQuality: CreationOptional<number>;
  declare public passwordResetTokenHours: CreationOptional<number>;
  declare public rateLimitApiMax: CreationOptional<number>;
  declare public rateLimitAuthMax: CreationOptional<number>;
  declare public rateLimitUploadMax: CreationOptional<number>;
  declare public rateLimitDownloadMax: CreationOptional<number>;
  declare public autoSaveIntervalSeconds: CreationOptional<number>;
  declare public draftExpiryMinutes: CreationOptional<number>;
  declare public wikiEditRoles: CreationOptional<string>;
  declare public workStatusLabels: CreationOptional<string>;
  declare public lotteryPrizes: CreationOptional<string>;
  declare public lotteryDailyLimit: CreationOptional<number>;
  declare public lotteryDrawCost: CreationOptional<number>;
  declare public attendanceBonus: CreationOptional<number>;
  declare public memoMaxPerUser: CreationOptional<number>;
  declare public commentContentMaxLength: CreationOptional<number>;
  declare public eventBodyMaxLength: CreationOptional<number>;
  declare public eventLocationMaxLength: CreationOptional<number>;
  declare public themePrimaryColor: CreationOptional<string | null>;
  declare public themeSecondaryColor: CreationOptional<string | null>;
  declare public readonly createdAt: Date;
  declare public readonly updatedAt: Date;
}

SiteSettings.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    siteName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'TinyCommunity',
      field: 'site_name',
    },
    siteTitle: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'TinyCommunity',
      field: 'site_title',
    },
    faviconUrl: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'favicon_url',
    },
    // 브랜드 색(#rgb / #rrggbb). null 이면 기본 색을 그대로 쓴다 —
    // 빈 문자열이 아니라 null 이어야 "지정 안 함" 과 "검정" 이 구분된다.
    themePrimaryColor: {
      type: DataTypes.STRING(9),
      allowNull: true,
      defaultValue: null,
      field: 'theme_primary_color',
    },
    themeSecondaryColor: {
      type: DataTypes.STRING(9),
      allowNull: true,
      defaultValue: null,
      field: 'theme_secondary_color',
    },
    logoUrl: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'logo_url',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    allowRegistration: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'allow_registration',
    },
    requireApproval: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'require_approval',
    },
    maintenanceMode: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'maintenance_mode',
    },
    maintenanceMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'maintenance_message',
    },
    loginMessage: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'login_message',
    },
    maxLoginAttempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
      field: 'max_login_attempts',
    },
    accountLockMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30,
      field: 'account_lock_minutes',
    },
    maxFileCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
      field: 'max_file_count',
    },
    maxFileSizeMb: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
      field: 'max_file_size_mb',
    },
    maxImageSizeMb: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
      field: 'max_image_size_mb',
    },
    maxAvatarSizeMb: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
      field: 'max_avatar_size_mb',
    },
    maxArchiveSizeMb: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
      field: 'max_archive_size_mb',
    },
    maxImageCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: 'max_image_count',
    },
    bcryptRounds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
      field: 'bcrypt_rounds',
    },
    allowedImageExtensions: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: JSON.stringify(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.ico']),
      field: 'allowed_image_extensions',
    },
    allowedDocumentExtensions: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: JSON.stringify([
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
      ]),
      field: 'allowed_document_extensions',
    },
    allowedArchiveExtensions: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: JSON.stringify(['.zip', '.rar', '.7z', '.tar', '.gz']),
      field: 'allowed_archive_extensions',
    },
    allowedMediaExtensions: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: JSON.stringify(['.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm']),
      field: 'allowed_media_extensions',
    },
    defaultPageSize: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
      field: 'default_page_size',
    },
    securityLogRetentionDays: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 90,
      field: 'security_log_retention_days',
    },
    errorLogRetentionDays: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30,
      field: 'error_log_retention_days',
    },
    deletedPostRetentionDays: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 7,
      field: 'deleted_post_retention_days',
    },
    jwtAccessTokenHours: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 2,
      field: 'jwt_access_token_hours',
    },
    jwtRefreshTokenDays: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,
      field: 'jwt_refresh_token_days',
    },
    postTitleMaxLength: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 200,
      field: 'post_title_max_length',
    },
    postContentMaxLength: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 500000,
      field: 'post_content_max_length',
    },
    postSecretPasswordMinLength: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 4,
      field: 'post_secret_password_min_length',
    },
    globalSearchLimit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 50,
      field: 'global_search_limit',
    },
    allowGuestComment: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'allow_guest_comment',
    },
    minPasswordLength: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 8,
      field: 'min_password_length',
    },
    requireUppercase: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'require_uppercase',
    },
    requireLowercase: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'require_lowercase',
    },
    requireNumberOrSpecial: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'require_number_or_special',
    },
    commentMaxDepth: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,
      field: 'comment_max_depth',
    },
    commentMaxCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1000,
      field: 'comment_max_count',
    },
    avatarSizePx: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 200,
      field: 'avatar_size_px',
    },
    avatarQuality: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 90,
      field: 'avatar_quality',
    },
    passwordResetTokenHours: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: 'password_reset_token_hours',
    },
    rateLimitApiMax: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 200,
      field: 'rate_limit_api_max',
    },
    rateLimitAuthMax: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
      field: 'rate_limit_auth_max',
    },
    rateLimitUploadMax: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 20,
      field: 'rate_limit_upload_max',
    },
    rateLimitDownloadMax: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
      field: 'rate_limit_download_max',
    },
    autoSaveIntervalSeconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30,
      field: 'auto_save_interval_seconds',
    },
    draftExpiryMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 60,
      field: 'draft_expiry_minutes',
    },
    wikiEditRoles: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: JSON.stringify(['admin', 'manager']),
      field: 'wiki_edit_roles',
    },
    workStatusLabels: {
      // 상태 키(todo/doing/done)는 코드가 정하고, 화면에 뜨는 말만 관리자가 정한다.
      // 팀마다 '진행 중' 을 '검토 중' 이라 부르는데, 그걸 바꾸려고 배포할 수는 없다.
      // wikiEditRoles 와 같은 방식으로 JSON 문자열을 담는다.
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '{}',
      field: 'work_status_labels',
    },
    lotteryPrizes: {
      // 확률과 금액을 코드에 박아 두면 바꿀 때마다 배포해야 한다.
      // workStatusLabels 와 같은 방식으로 JSON 문자열을 담는다.
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: JSON.stringify(LOTTERY_DEFAULTS.prizes),
      field: 'lottery_prizes',
    },
    lotteryDailyLimit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: LOTTERY_DEFAULTS.dailyLimit,
      field: 'lottery_daily_limit',
    },
    lotteryDrawCost: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: LOTTERY_DEFAULTS.drawCost,
      field: 'lottery_draw_cost',
    },
    attendanceBonus: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: LOTTERY_DEFAULTS.attendanceBonus,
      field: 'attendance_bonus',
    },
    // ── 신규 (관리자 조정 가능) ────────────────────────────────────────────
    memoMaxPerUser: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 200,
      field: 'memo_max_per_user',
    },
    commentContentMaxLength: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1000,
      field: 'comment_content_max_length',
    },
    eventBodyMaxLength: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10000,
      field: 'event_body_max_length',
    },
    eventLocationMaxLength: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 500,
      field: 'event_location_max_length',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated_at',
    },
  },
  {
    sequelize,
    tableName: 'site_settings',
    modelName: 'SiteSettings',
    timestamps: true,
    underscored: true,
    freezeTableName: true,
  }
);
