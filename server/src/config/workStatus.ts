// 게시글의 업무 상태. 기본값은 추적하지 않는 'none'.

export const WORK_STATUSES = {
  none: { label: '없음', description: '업무로 추적하지 않는 일반 글' },
  todo: { label: '할 일', description: '처리해야 하지만 아직 시작하지 않음' },
  doing: { label: '진행 중', description: '누군가 맡아 처리하고 있음' },
  done: { label: '완료', description: '처리가 끝남' },
} as const;

export type WorkStatus = keyof typeof WORK_STATUSES;

export const WORK_STATUS_KEYS = Object.keys(WORK_STATUSES) as WorkStatus[];

export function isWorkStatus(value: unknown): value is WorkStatus {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(WORK_STATUSES, value);
}
