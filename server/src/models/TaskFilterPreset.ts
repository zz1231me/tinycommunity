// 저장된 업무 필터. 사람마다 자기 것만 갖는다.
// 조건은 열로 나눠 둔다 — 아는 값만 들어오도록 저장 전에 깎고(config/taskFilterPreset),
// 무엇이 저장돼 있는지 DB 에서 바로 읽히게 한다.

import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from 'sequelize';
import { sequelize } from '../config/sequelize';

class TaskFilterPresetModel extends Model<
  InferAttributes<TaskFilterPresetModel>,
  InferCreationAttributes<TaskFilterPresetModel>
> {
  declare public id: CreationOptional<number>;
  declare public userId: string;
  /** 고르는 메뉴에 보이는 이름 */
  declare public name: string;
  /** 보는 범위. '' 이면 내 업무, 아니면 그 게시판의 팀 보기 */
  declare public scope: CreationOptional<string>;
  /** 제목 검색어 */
  declare public query: CreationOptional<string>;
  /** 게시판으로 좁히기. '' 이면 전체 */
  declare public boardType: CreationOptional<string>;
  /** 'overdue' | 'today' | 'week' | null */
  declare public due: CreationOptional<string | null>;
  /** 업무 우선순위 키 | null */
  declare public priority: CreationOptional<string | null>;
  declare public sort: CreationOptional<string>;
  declare public readonly createdAt: CreationOptional<Date>;
  declare public readonly updatedAt: CreationOptional<Date>;
}

TaskFilterPresetModel.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    // 계정이 지워져도 남은 줄 때문에 막히지 않게 FK 를 걸지 않는다(이 프로젝트의 방식).
    userId: { type: DataTypes.STRING(50), allowNull: false },
    name: { type: DataTypes.STRING(50), allowNull: false },
    scope: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
    query: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
    boardType: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
    due: { type: DataTypes.STRING(20), allowNull: true },
    priority: { type: DataTypes.STRING(20), allowNull: true },
    sort: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'stale' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'task_filter_presets',
    modelName: 'TaskFilterPreset',
    timestamps: true,
    indexes: [{ fields: ['userId'] }],
  }
);

export const TaskFilterPreset = TaskFilterPresetModel;
export type TaskFilterPreset = TaskFilterPresetModel;
export default TaskFilterPresetModel;
