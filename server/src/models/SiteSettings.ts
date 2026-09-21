import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from 'sequelize';
import { sequelize } from '../config/sequelize';
import { LOTTERY_DEFAULTS } from '../config/lottery';
import { DUEL_DEFAULTS } from '../config/duel';
import { ATTACK_DEFAULTS } from '../config/attendanceAttack';

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
  duelMinStake: CreationOptional<number>;
  duelMaxStake: CreationOptional<number>;
  duelExpireMinutes: CreationOptional<number>;
  duelMaxOpenPerUser: CreationOptional<number>;
  attackCost: CreationOptional<number>;
  attackHideCost: CreationOptional<number>;
  attackHideSeconds: CreationOptional<number>;
  attackDefendCost: CreationOptional<number>;
  attackBlockSeconds: CreationOptional<number>;
  attackDailyLimit: CreationOptional<number>;
  memoMaxPerUser: CreationOptional<number>;
  /** 사이드바에서 위키가 게시판 목록 몇 번째에 오는지 */
  wikiOrder: CreationOptional<number>;
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
  declare public autoSaveIntervalSeconds: CreationOptional<number>;
  declare public draftExpiryMinutes: CreationOptional<number>;
  declare public wikiEditRoles: CreationOptional<string>;
  declare public workStatusLabels: CreationOptional<string>;
  declare public lotteryPrizes: CreationOptional<string>;
  declare public lotteryDailyLimit: CreationOptional<number>;
  declare public lotteryDrawCost: CreationOptional<number>;
  declare public attendanceBonus: CreationOptional<number>;
  declare public duelMinStake: CreationOptional<number>;
  declare public duelMaxStake: CreationOptional<number>;
  declare public duelExpireMinutes: CreationOptional<number>;
  declare public duelMaxOpenPerUser: CreationOptional<number>;
  declare public attackCost: CreationOptional<number>;
  declare public attackHideCost: CreationOptional<number>;
  declare public attackHideSeconds: CreationOptional<number>;
  declare public attackDefendCost: CreationOptional<number>;
  declare public attackBlockSeconds: CreationOptional<number>;
  declare public attackDailyLimit: CreationOptional<number>;
  declare public memoMaxPerUser: CreationOptional<number>;
  declare public wikiOrder: CreationOptional<number>;
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
    // 브랜드 색(#rgb / #rrggbb). null 이어야 '지정 안 함' 과 '검정' 이 구분된다.
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
      // 상태 키는 코드가 정하고 화면에 뜨는 말만 관리자가 정한다. wikiEditRoles 처럼 JSON 문자열로 담는다.
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '{}',
      field: 'work_status_labels',
    },
    lotteryPrizes: {
      // 확률과 금액을 배포 없이 바꿀 수 있도록 workStatusLabels 처럼 JSON 문자열로 담는다.
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
    // 판돈을 배포 없이 바꿀 수 있도록 관리자 설정에 둔다.
    duelMinStake: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: DUEL_DEFAULTS.minStake,
      field: 'duel_min_stake',
    },
    duelMaxStake: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: DUEL_DEFAULTS.maxStake,
      field: 'duel_max_stake',
    },
    duelExpireMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: DUEL_DEFAULTS.expireMinutes,
      field: 'duel_expire_minutes',
    },
    duelMaxOpenPerUser: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: DUEL_DEFAULTS.maxOpenPerUser,
      field: 'duel_max_open_per_user',
    },
    attackCost: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: ATTACK_DEFAULTS.cost,
      field: 'attack_cost',
    },
    // attack_popup_cost 를 대신한다. 옛 칸은 ensureAllModelColumns 가 지우지 않고 남긴다.
    attackHideCost: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: ATTACK_DEFAULTS.hideCost,
      field: 'attack_hide_cost',
    },
    attackHideSeconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: ATTACK_DEFAULTS.hideSeconds,
      field: 'attack_hide_seconds',
    },
    attackDefendCost: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: ATTACK_DEFAULTS.defendCost,
      field: 'attack_defend_cost',
    },
    attackBlockSeconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: ATTACK_DEFAULTS.blockSeconds,
      field: 'attack_block_seconds',
    },
    attackDailyLimit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: ATTACK_DEFAULTS.dailyLimitPerAttacker,
      field: 'attack_daily_limit',
    },
    memoMaxPerUser: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 200,
      field: 'memo_max_per_user',
    },
    // 기본값을 크게 둬야 기존 설치에서 위키가 게시판 목록 끝에 남는다
    wikiOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 9999,
      field: 'wiki_order',
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
