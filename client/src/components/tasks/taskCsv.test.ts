// 업무 목록 CSV.
//
// 지켜야 할 선: ① 제목에 쉼표·따옴표·줄바꿈이 있어도 열이 밀리지 않는다
// ② 엑셀이 한글을 깨뜨리지 않게 BOM 을 붙인다 ③ 상태·우선순위는 사람이 읽는 이름으로.

import { describe, expect, it } from 'vitest';
import { toTaskCsv } from './taskCsv';
import type { MyTask, WorkStatus } from '../../api/tasks';

const statusLabel = (s: WorkStatus) =>
  ({ none: '없음', todo: '할 일', doing: '진행 중', done: '완료' })[s];

const task = (over: Partial<MyTask> = {}): MyTask => ({
  id: 'T1',
  title: '견적 정리',
  boardType: 'qc',
  boardName: 'QC',
  workStatus: 'doing',
  priority: 'urgent',
  assignee: { id: 'u1', name: '점검용a', avatar: null },
  canEdit: true,
  startDate: '2026-10-12',
  dueDate: '2026-10-17',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-15T09:30:00.000Z',
  ...over,
});

const lines = (csv: string) => csv.replace(/^\uFEFF/, '').split('\r\n');

describe('업무 CSV', () => {
  it('머리글과 한 줄을 사람이 읽는 이름으로 적는다', () => {
    const [header, row] = lines(toTaskCsv([task()], statusLabel));

    expect(header).toBe('제목,게시판,상태,우선순위,담당자,시작일,마감일,마지막 수정');
    expect(row).toBe('견적 정리,QC,진행 중,긴급,점검용a,2026-10-12,2026-10-17,2026-10-15');
  });

  it('엑셀이 한글을 깨뜨리지 않게 BOM 으로 시작한다', () => {
    expect(toTaskCsv([task()], statusLabel).startsWith('\uFEFF')).toBe(true);
  });

  it('쉼표·따옴표·줄바꿈이 든 제목도 한 칸에 담는다 — 열이 밀리지 않게', () => {
    const csv = toTaskCsv([task({ title: '견적, "최종"\n보완' })], statusLabel);
    expect(csv).toContain('"견적, ""최종""\n보완"');
    // 머리글 + 한 줄(제목 안의 줄바꿈은 따옴표 안에 있다)
    expect(lines(csv)).toHaveLength(2);
  });

  it('우선순위 없음과 담당자 없음은 빈 칸으로 둔다', () => {
    const [, row] = lines(toTaskCsv([task({ priority: 'none', assignee: null })], statusLabel));
    expect(row).toBe('견적 정리,QC,진행 중,,,2026-10-12,2026-10-17,2026-10-15');
  });

  it('일정이 없으면 빈 칸', () => {
    const [, row] = lines(toTaskCsv([task({ startDate: null, dueDate: null })], statusLabel));
    expect(row.endsWith(',,,2026-10-15')).toBe(true);
  });

  it('업무가 없으면 머리글만', () => {
    expect(lines(toTaskCsv([], statusLabel))).toEqual([
      '제목,게시판,상태,우선순위,담당자,시작일,마감일,마지막 수정',
    ]);
  });
});
