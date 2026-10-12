// 칸반 열 나누기, 마감 표시·거르기·정렬, 간트 막대 ↔ 저장 날짜 변환.
// 테스트는 Asia/Seoul 로 돈다(vitest.config). 날짜 문자열을 UTC 로 읽으면 여기서 하루가 밀린다.

import { describe, expect, it } from 'vitest';
import { format } from 'date-fns';
import type { MyTask } from '../../api/tasks';
import {
  countDue,
  dueInfo,
  filterTasks,
  formatSchedule,
  fromGanttRange,
  groupByStatus,
  sortTasks,
  toGanttRange,
} from './taskViews';

const task = (over: Partial<MyTask>): MyTask => ({
  id: 'P1',
  title: '일',
  boardType: 'qc',
  boardName: 'QC',
  workStatus: 'todo',
  priority: 'none',
  assignee: null,
  canEdit: true,
  startDate: null,
  dueDate: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const ymd = (d: Date) => format(d, 'yyyy-MM-dd HH:mm');
// 한국 시간 오전 1시 — UTC 로는 전날이다. 날짜 계산이 UTC 로 새면 여기서 걸린다.
const today = new Date(2026, 9, 11, 1, 0);

describe('groupByStatus', () => {
  it('상태별 열로 나누고, none 은 어느 열에도 넣지 않는다', () => {
    const groups = groupByStatus([
      task({ id: 'a', workStatus: 'todo' }),
      task({ id: 'b', workStatus: 'doing' }),
      task({ id: 'c', workStatus: 'done' }),
      task({ id: 'd', workStatus: 'none' }),
    ]);
    expect(groups.todo.map(t => t.id)).toEqual(['a']);
    expect(groups.doing.map(t => t.id)).toEqual(['b']);
    expect(groups.done.map(t => t.id)).toEqual(['c']);
  });
});

describe('formatSchedule', () => {
  it('기간·하루·시작만·없음을 각각 읽히게 적는다', () => {
    expect(formatSchedule('2026-10-01', '2026-10-03')).toBe('2026-10-01 ~ 2026-10-03');
    expect(formatSchedule('2026-10-03', '2026-10-03')).toBe('2026-10-03');
    expect(formatSchedule(null, '2026-10-03')).toBe('2026-10-03');
    expect(formatSchedule('2026-10-01', null)).toBe('2026-10-01 시작');
    expect(formatSchedule(null, null)).toBe('일정 미정');
  });
});

describe('dueInfo', () => {
  it('지난 마감·오늘·곧·나중을 나눈다', () => {
    expect(dueInfo(task({ dueDate: '2026-10-09' }), today)).toMatchObject({
      tone: 'overdue',
      label: '2일 지남',
    });
    expect(dueInfo(task({ dueDate: '2026-10-11' }), today)).toMatchObject({
      tone: 'today',
      label: 'D-day',
    });
    expect(dueInfo(task({ dueDate: '2026-10-14' }), today)).toMatchObject({
      tone: 'soon',
      label: 'D-3',
    });
    expect(dueInfo(task({ dueDate: '2026-10-20' }), today)).toMatchObject({
      tone: 'later',
      label: 'D-9',
    });
  });

  it('끝낸 일과 마감 없는 일에는 붙이지 않는다 — 끝낸 일의 지난 마감은 경고가 아니다', () => {
    expect(dueInfo(task({ dueDate: '2026-10-01', workStatus: 'done' }), today)).toBeNull();
    expect(dueInfo(task({ dueDate: null }), today)).toBeNull();
  });
});

describe('countDue · filterTasks', () => {
  const tasks = [
    task({ id: 'late', title: '견적서 검토', dueDate: '2026-10-10' }),
    task({ id: 'today', title: '회의록', dueDate: '2026-10-11', boardType: 'hr' }),
    task({ id: 'soon', title: '견적 회신', dueDate: '2026-10-15' }),
    task({ id: 'far', title: '분기 보고', dueDate: '2026-11-30' }),
    task({ id: 'none', title: '정리' }),
    task({ id: 'done', title: '끝남', dueDate: '2026-10-01', workStatus: 'done' }),
  ];
  const ids = (list: MyTask[]) => list.map(t => t.id);

  it('마감 요약 수: 지난 것은 이번 주에 넣지 않는다', () => {
    expect(countDue(tasks, today)).toEqual({ overdue: 1, today: 1, week: 2 });
  });

  it('제목·게시판·마감 조건을 모두 만족하는 것만 남긴다', () => {
    const none = { query: '', boardType: '', due: null };
    expect(ids(filterTasks(tasks, { ...none, query: '견적' }, today))).toEqual(['late', 'soon']);
    expect(ids(filterTasks(tasks, { ...none, boardType: 'hr' }, today))).toEqual(['today']);
    expect(ids(filterTasks(tasks, { ...none, due: 'overdue' }, today))).toEqual(['late']);
    expect(ids(filterTasks(tasks, { query: '견적', boardType: '', due: 'week' }, today))).toEqual([
      'soon',
    ]);
  });

  it('검색은 대소문자를 가리지 않고 앞뒤 공백을 무시한다', () => {
    const list = [task({ id: 'a', title: 'QA Report' })];
    expect(ids(filterTasks(list, { query: '  qa ', boardType: '', due: null }, today))).toEqual([
      'a',
    ]);
  });
});

describe('sortTasks', () => {
  const list = [
    task({ id: 'none' }),
    task({ id: 'late', dueDate: '2026-10-20' }),
    task({ id: 'early', dueDate: '2026-10-12' }),
  ];

  it('마감 순은 빠른 것부터, 마감 없는 일은 맨 뒤', () => {
    expect(sortTasks(list, 'due').map(t => t.id)).toEqual(['early', 'late', 'none']);
  });

  it('기본 순서는 서버가 준 그대로(오래 방치된 것부터)이고 원본을 바꾸지 않는다', () => {
    expect(sortTasks(list, 'stale')).toBe(list);
    sortTasks(list, 'due');
    expect(list.map(t => t.id)).toEqual(['none', 'late', 'early']);
  });
});

describe('toGanttRange', () => {
  it('마감일 당일까지 칠하도록 끝은 다음 날 0시다', () => {
    const r = toGanttRange({ startDate: '2026-10-01', dueDate: '2026-10-03' }, today);
    expect(ymd(r.start)).toBe('2026-10-01 00:00');
    expect(ymd(r.end)).toBe('2026-10-04 00:00');
    expect(r.scheduled).toBe(true);
  });

  it('한쪽만 있으면 그날 하루다', () => {
    const r = toGanttRange({ startDate: null, dueDate: '2026-10-05' }, today);
    expect(ymd(r.start)).toBe('2026-10-05 00:00');
    expect(ymd(r.end)).toBe('2026-10-06 00:00');
  });

  it('일정이 없으면 오늘 하루짜리로, 일정 없음 표시와 함께', () => {
    const r = toGanttRange({ startDate: null, dueDate: null }, today);
    expect(ymd(r.start)).toBe('2026-10-11 00:00');
    expect(ymd(r.end)).toBe('2026-10-12 00:00');
    expect(r.scheduled).toBe(false);
  });
});

describe('fromGanttRange', () => {
  it('toGanttRange 의 반대다 — 그대로 두면 같은 날짜로 저장된다', () => {
    const saved = { startDate: '2026-10-01', dueDate: '2026-10-03' };
    const r = toGanttRange(saved, new Date());
    expect(fromGanttRange(r.start, r.end)).toEqual(saved);
  });

  it('끝이 시작과 같은 날까지 줄어도 하루는 남긴다', () => {
    const day = new Date(2026, 9, 7);
    expect(fromGanttRange(day, day)).toEqual({ startDate: '2026-10-07', dueDate: '2026-10-07' });
  });

  it('한국 시간 오전(UTC 로는 전날)에도 날짜가 밀리지 않는다', () => {
    const start = new Date(2026, 9, 7, 0, 0); // UTC 로는 10월 6일 15시
    const end = new Date(2026, 9, 9, 0, 0);
    expect(fromGanttRange(start, end)).toEqual({ startDate: '2026-10-07', dueDate: '2026-10-08' });
  });
});

describe('우선순위 순 정렬', () => {
  // 마감일만으로는 '마감은 멀지만 급한 일' 을 위로 올릴 수 없다. 두 축을 함께 쓴다.
  it('급한 것부터, 같으면 마감 빠른 순', () => {
    const tasks = [
      task({ id: 'a', priority: 'normal', dueDate: '2099-01-01' }),
      task({ id: 'b', priority: 'urgent', dueDate: '2099-12-31' }),
      task({ id: 'c', priority: 'urgent', dueDate: '2099-06-01' }),
      task({ id: 'd', priority: 'none', dueDate: null }),
    ];
    expect(sortTasks(tasks, 'priority').map(t => t.id)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('마감 빠른 순은 우선순위를 보지 않는다 — 두 축을 섞지 않게', () => {
    const tasks = [
      task({ id: 'late', priority: 'urgent', dueDate: '2099-12-31' }),
      task({ id: 'soon', priority: 'low', dueDate: '2099-01-01' }),
    ];
    expect(sortTasks(tasks, 'due').map(t => t.id)).toEqual(['soon', 'late']);
  });
});
