// server/src/models/RateLimitSettings.ts - Rate Limiting 설정 모델 (타입 오류 수정)
import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

export interface RateLimitSettingsInstance extends Model<
  InferAttributes<RateLimitSettingsInstance>,
  InferCreationAttributes<RateLimitSettingsInstance>
> {
  id: CreationOptional<number>;
  category: string; // 'auth', 'api', 'upload', 'admin', 'custom'
  name: string; // 설정 이름
  description: string; // 설명
  windowMs: number; // 시간 창 (밀리초)
  maxRequests: number; // 최대 요청 수
  enabled: boolean; // 활성화 여부
  skipSuccessfulRequests: boolean; // 성공한 요청 제외 여부
  skipFailedRequests: boolean; // 실패한 요청 제외 여부
  message: string; // 제한 시 메시지
  statusCode: number; // HTTP 상태 코드
  headers: CreationOptional<string>; // 추가 헤더 (JSON)
  whitelistIPs: CreationOptional<string>; // 화이트리스트 IP (JSON 배열)
  blacklistIPs: CreationOptional<string>; // 블랙리스트 IP (JSON 배열)
  applyTo: string; // 적용 경로 패턴
  priority: CreationOptional<number>; // 우선순위 (낮을수록 높음)
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

export class RateLimitSettings
  extends Model<
    InferAttributes<RateLimitSettingsInstance>,
    InferCreationAttributes<RateLimitSettingsInstance>
  >
  implements RateLimitSettingsInstance
{
  declare public id: CreationOptional<number>;
  declare public category: string;
  declare public name: string;
  declare public description: string;
  declare public windowMs: number;
  declare public maxRequests: number;
  declare public enabled: boolean;
  declare public skipSuccessfulRequests: boolean;
  declare public skipFailedRequests: boolean;
  declare public message: string;
  declare public statusCode: number;
  declare public headers: CreationOptional<string>;
  declare public whitelistIPs: CreationOptional<string>;
  declare public blacklistIPs: CreationOptional<string>;
  declare public applyTo: string;
  declare public priority: CreationOptional<number>;
  declare public readonly createdAt: Date;
  declare public readonly updatedAt: Date;

  // ✅ 헬퍼 메서드 (타입 오류 수정)
  public getWhitelistIPs(): string[] {
    try {
      return this.whitelistIPs ? JSON.parse(this.whitelistIPs) : [];
    } catch {
      return [];
    }
  }

  public getBlacklistIPs(): string[] {
    try {
      return this.blacklistIPs ? JSON.parse(this.blacklistIPs) : [];
    } catch {
      return [];
    }
  }

  public getHeaders(): Record<string, string> {
    try {
      return this.headers ? JSON.parse(this.headers) : {};
    } catch {
      return {}; // ✅ 빈 배열[] → 빈 객체{}로 수정
    }
  }

  public getWindowMsDisplay(): string {
    const seconds = this.windowMs / 1000;
    const minutes = seconds / 60;
    const hours = minutes / 60;

    if (hours >= 1) return `${hours}시간`;
    if (minutes >= 1) return `${minutes}분`;
    return `${seconds}초`;
  }
}

RateLimitSettings.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: '카테고리: auth, api, upload, admin, custom',
      validate: {
        isIn: [['auth', 'api', 'upload', 'admin', 'custom']],
      },
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '설정 이름',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: '설정 설명',
    },
    windowMs: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '시간 창 (밀리초)',
      validate: {
        min: 1000, // 최소 1초
        max: 24 * 60 * 60 * 1000, // 최대 24시간
      },
    },
    maxRequests: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '최대 요청 수',
      validate: {
        min: 1,
        max: 100000,
      },
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: '활성화 여부',
    },
    skipSuccessfulRequests: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '성공한 요청 제외',
    },
    skipFailedRequests: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '실패한 요청 제외',
    },
    message: {
      type: DataTypes.STRING(500),
      allowNull: false,
      defaultValue: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.',
      comment: '제한 시 메시지',
    },
    statusCode: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 429,
      comment: 'HTTP 상태 코드',
      validate: {
        min: 400,
        max: 599,
      },
    },
    headers: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '추가 헤더 (JSON)',
    },
    whitelistIPs: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '화이트리스트 IP 배열 (JSON)',
    },
    blacklistIPs: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '블랙리스트 IP 배열 (JSON)',
    },
    applyTo: {
      type: DataTypes.STRING(200),
      allowNull: false,
      comment: '적용 경로 패턴',
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
      comment: '우선순위 (낮을수록 높음)',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: 'RateLimitSettings',
    tableName: 'rate_limit_settings',
    timestamps: true,
    // ✅ 추가 옵션으로 명시적 설정
    underscored: false,
    freezeTableName: true,
    indexes: [
      { fields: ['category'] },
      { fields: ['enabled'] },
      { fields: ['priority'] },
      { fields: ['applyTo'] },
      { unique: true, fields: ['category', 'name'] },
    ],
  }
);
