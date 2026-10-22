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
  showOnCalendar: true,
  parentTaskId: null,
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

// 엑셀이 수식으로 읽는 칸.
//
// = + - @ 로 시작하는 칸은 엑셀·구글시트가 값이 아니라 수식으로 읽는다. 제목은 남이
// 적은 글자이고(공유 보기에서는 남의 업무가 한 파일에 모인다), 그 파일을 받은 사람이
// 열면 그 자리에서 실행된다 — =HYPERLINK(...) 로 바깥 주소를 누르게 하거나
// =IMPORTXML(...) 로 같은 시트의 값을 밖으로 보낼 수 있다.
//
// 따옴표로 감싸는 것만으로는 막히지 않는다. 엑셀은 따옴표를 벗긴 뒤 수식으로 읽는다.
describe('수식으로 읽히는 칸', () => {
  const titleCellOf = (csv: string) => csv.split('\r\n')[1].split(',')[0];

  it.each(['=1+1', '+1+1', '-1+1', '@SUM(A1)'])('%s 로 시작하면 그대로 두지 않는다', start => {
    const csv = toTaskCsv([task({ title: start })], () => '할 일');

    expect(titleCellOf(csv).replace(/^"/, '')).not.toMatch(/^[=+\-@]/);
  });

  it('원래 글자는 읽을 수 있게 남는다 — 지우지 않는다', () => {
    const csv = toTaskCsv([task({ title: '=1+1 예산안' })], () => '할 일');

    expect(csv).toContain('=1+1 예산안');
  });

  it('보통 제목은 손대지 않는다 — 양성 대조', () => {
    const csv = toTaskCsv([task({ title: '10월 보고서' })], () => '할 일');

    expect(titleCellOf(csv)).toBe('10월 보고서');
  });
});
