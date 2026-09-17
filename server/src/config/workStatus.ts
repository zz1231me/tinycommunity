// server/src/config/workStatus.ts
// 게시글의 업무 상태.
//
// 게시판을 할 일 목록으로 쓸 때 담당자·진행 상태를 본문 밖에서 관리한다.
//
// 기본값은 'none' 이다. 공지·자료 게시판처럼 할 일이 아닌 글까지 상태를 갖게 하면
// 목록이 의미 없는 값으로 채워진다.

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
