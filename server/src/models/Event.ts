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
import { extractSearchText } from '../utils/contentRenderer';

import type { UserInstance } from './User';

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
  UserId: ForeignKey<string>;
  /** 이 일정이 속한 게시판. 비어 있으면 전사 공유 일정이다. */
  boardId?: string | null;
  recurrenceType?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurrenceInterval?: number;
  recurrenceDays?: number[] | null;
  recurrenceEndDate?: Date | null;
  recurrenceExcept?: string[] | null;
  parentEventId?: number | null;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;

  user?: NonAttribute<UserInstance>;
}

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
  declare public UserId: ForeignKey<string>;
  /**
   * 이 일정이 속한 게시판. 비어 있으면 전사 공유 일정이다.
   *
   * 권한이 갈린다 — 게시판 일정은 그 게시판을 읽을 수 있는 사람이 보고 쓸 수 있는
   * 사람이 만든다(EventPermission 의 역할별 규칙은 공유 일정에만 쓴다).
   */
  declare public boardId?: string | null;
  declare public recurrenceType?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  declare public recurrenceInterval?: number;
  declare public recurrenceDays?: number[] | null;
  declare public recurrenceEndDate?: Date | null;
  /** 이 날짜(YYYY-MM-DD)의 반복은 건너뛴다. 한 번만 쉬는 일정에 쓴다. */
  declare public recurrenceExcept?: string[] | null;
  declare public parentEventId?: number | null;
  declare public readonly createdAt: Date;
  declare public readonly updatedAt: Date;

  declare public user?: NonAttribute<UserInstance>;

  // bodyText 는 검색 전용 내부 컬럼이라 API 응답에서 제외한다.
  public override toJSON(): object {
    const { bodyText: _bt, ...rest } = { ...this.get() } as Record<string, unknown>;
    return rest;
  }
}

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
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    boardId: {
      // boards.id 와 같은 STRING. FK 제약은 걸지 않는다 — 기존 테이블에 컬럼을
      // 보강하는 길(ensureModelColumns)이 제약을 추가하지 않기 때문이다.
      type: DataTypes.STRING,
      allowNull: true,
      comment: '게시판 일정이면 그 게시판 id, 전사 공유 일정이면 NULL',
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
    // 건너뛸 날짜들(YYYY-MM-DD). 반복 중 하루만 쉬는 경우에 쓴다.
    recurrenceExcept: { type: DataTypes.JSON, allowNull: true },
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
    // 기간·사용자·반복 인스턴스 조회의 풀스캔을 막는다. 기존 SQLite 테이블에는 add-indexes 스크립트로 적용한다.
    indexes: [
      { fields: ['start', 'end'] },
      { fields: ['UserId'] },
      { fields: ['parentEventId'] },
      // 게시판 달력은 늘 boardId 로 좁혀 읽는다
      { fields: ['boardId'] },
    ],
    hooks: {
      // body 가 바뀌면 검색용 평문(bodyText)을 다시 만든다.
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
