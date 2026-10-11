// 업무 상태 이름. 관리자가 바꿀 수 있어 서버 카탈로그를 따르고, 읽기 전에는 기본 이름을 쓴다.

import { useQuery } from '@tanstack/react-query';
import { fetchWorkStatuses, type WorkStatus } from '../../api/tasks';
import { taskKeys } from '../../api/queryKeys';

const FALLBACK: Record<WorkStatus, string> = {
  none: '없음',
  todo: '할 일',
  doing: '진행 중',
  done: '완료',
};

export function useStatusLabel(): (status: WorkStatus) => string {
  const { data: statuses = [] } = useQuery({
    queryKey: taskKeys.statuses,
    queryFn: ({ signal }) => fetchWorkStatuses(signal),
    // 상태 목록은 배포 전에는 바뀌지 않는다
    staleTime: Infinity,
  });
  return status => statuses.find(s => s.key === status)?.label || FALLBACK[status];
}
