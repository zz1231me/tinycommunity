// 업무 목록을 CSV 로 내보낸다. 주간 보고나 회의 자료로 옮겨 적는 일을 없앤다.
//
// 화면에 보이는 그대로(거르기·정렬 적용) 내보낸다. 서버에서 뽑으면 거르기를 양쪽에
// 두 번 구현해야 하고, 그러면 화면과 파일이 서로 다른 결과를 내게 된다.

import type { MyTask, WorkStatus } from '../../api/tasks';
import { PRIORITY_LABEL } from './taskPriority';

const HEADERS = [
  '제목',
  '게시판',
  '상태',
  '우선순위',
  '담당자',
  '시작일',
  '마감일',
  '마지막 수정',
] as const;

/**
 * CSV 한 칸. 쉼표·따옴표·줄바꿈이 들어 있으면 따옴표로 감싸고 안쪽 따옴표는 두 번 적는다.
 * 제목에 쉼표가 흔하므로 이 처리가 없으면 열이 밀린다.
 */
function cell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** 날짜만 쓴다(2026-10-17). 시각까지는 보고 자료에서 쓸 일이 없다. */
function day(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

export function toTaskCsv(tasks: MyTask[], statusLabel: (status: WorkStatus) => string): string {
  const rows = tasks.map(task =>
    [
      task.title,
      task.boardName,
      statusLabel(task.workStatus),
      task.priority === 'none' ? '' : PRIORITY_LABEL[task.priority],
      task.assignee?.name ?? '',
      day(task.startDate),
      day(task.dueDate),
      day(task.updatedAt),
    ]
      .map(cell)
      .join(',')
  );
  // 엑셀은 BOM 이 없으면 UTF-8 한글을 깨뜨린다.
  return `\uFEFF${[HEADERS.join(','), ...rows].join('\r\n')}`;
}

/** 브라우저에 파일로 내려 준다. */
export function downloadTaskCsv(csv: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
