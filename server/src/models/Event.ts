import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../config/sequelize';
import { extractSearchText } from '../utils/tiptapRenderer';

// 타입 전용 import
import type { UserInstance } from './User';

// ✅ EventInstance 타입 정의
export interface EventInstance extends Model<
  InferAttributes<EventInstance>,
  InferCreationAttributes<EventInstance>
> {
  id: CreationOptional<number>;
  calendarId: string;
  title: string;
  body?: string;
  bodyText?: string | null; // 검색용 평문(body에서 태그 제거)
  isAllday: boolean;
  start: Date;
  end: Date;
  category?: string;
  location?: string;
  attendees?: any;
  state?: string;
  isReadOnly: boolean;
  color?: string;
  backgroundColor?: string;
  dragBackgroundColor?: string;
  borderColor?: string;
  customStyle?: any;
  UserId: ForeignKey<string>; // ✅ 작성자 필드 추가
  recurrenceType?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurrenceInterval?: number;
  recurrenceDays?: number[] | null;
  recurrenceEndDate?: Date | null;
  parentEventId?: number | null;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;

  // 관계 데이터
  user?: NonAttribute<UserInstance>;
}

// ✅ Event 클래스 정의
export class Event
  extends Model<InferAttributes<EventInstance>, InferCreationAttributes<EventInstance>>
  implements EventInstance
{
  declare public id: CreationOptional<number>;
  declare public calendarId: string;
  declare public title: string;
  declare public body?: string;
  declare public bodyText?: string | null;
  declare public isAllday: boolean;
  declare public start: Date;
  declare public end: Date;
  declare public category?: string;
  declare public location?: string;
  declare public attendees?: any;
  declare public state?: string;
  declare public isReadOnly: boolean;
  declare public color?: string;
  declare public backgroundColor?: string;
  declare public dragBackgroundColor?: string;
  declare public borderColor?: string;
  declare public customStyle?: any;
  declare public UserId: ForeignKey<string>; // ✅ 작성자 필드
  declare public recurrenceType?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  declare public recurrenceInterval?: number;
  declare public recurrenceDays?: number[] | null;
  declare public recurrenceEndDate?: Date | null;
  declare public parentEventId?: number | null;
  declare public readonly createdAt: Date;
  declare public readonly updatedAt: Date;

  // 관계 데이터
  // 관계 데이터
  declare public user?: NonAttribute<UserInstance>;

  // bodyText는 검색 전용 내부 컬럼이라 API 응답에서 제외(body와 중복 페이로드 방지)
  public override toJSON(): object {
    const { bodyText: _bt, ...rest } = { ...this.get() } as Record<string, unknown>;
    return rest;
  }
}

// 모델 초기화
Event.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    calendarId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    bodyText: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '검색용 평문 — body에서 HTML 태그를 제거한 텍스트(beforeSave 훅에서 자동 생성)',
    },
    isAllday: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    start: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    end: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    location: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    attendees: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    state: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    isReadOnly: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    color: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    backgroundColor: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dragBackgroundColor: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    borderColor: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    customStyle: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    UserId: {
      // ✅ 작성자 필드 추가
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    recurrenceType: {
      type: DataTypes.ENUM('none', 'daily', 'weekly', 'monthly', 'yearly'),
      allowNull: false,
      defaultValue: 'none',
    },
    recurrenceInterval: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: { min: 1 },
    },
    recurrenceDays: { type: DataTypes.JSON, allowNull: true },
    recurrenceEndDate: { type: DataTypes.DATE, allowNull: true },
    parentEventId: { type: DataTypes.INTEGER, allowNull: true },
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
    modelName: 'Event',
    tableName: 'Events',
    timestamps: true,
    // 캘린더 조회 최적화 — 기간(start/end) 범위 조회, 사용자별 조회, 반복 인스턴스 조회가
    // 인덱스 없이 풀스캔되던 것을 방지. (SQLite는 alter:false라 기존 테이블엔 add-indexes
    // 스크립트로 적용; 신규 생성 시 자동)
    indexes: [{ fields: ['start', 'end'] }, { fields: ['UserId'] }, { fields: ['parentEventId'] }],
    hooks: {
      // body가 바뀔 때 검색용 평문(bodyText)을 자동 갱신 — 검색이 원본 HTML이 아닌 평문에 매칭
      beforeSave: async (event: Event) => {
        if (event.isNewRecord || event.changed('body')) {
          event.bodyText = extractSearchText(event.body || '');
        }
      },
    },
  }
);

Event.belongsTo(Event, { as: 'parentEvent', foreignKey: 'parentEventId', constraints: false });
Event.hasMany(Event, { as: 'instances', foreignKey: 'parentEventId', constraints: false });

export default Event;
