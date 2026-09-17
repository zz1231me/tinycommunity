import { ReactNode } from 'react';

/**
 * 로그 탭들의 필터 줄. 라벨+입력 한 쌍을 반복하던 마크업을 모았다.
 * 필터 변경은 즉시 쿼리 키에 반영되므로 별도 '검색' 버튼은 두지 않는다.
 */
export const LogFilterBar = ({ children }: { children: ReactNode }) => (
  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700/60 flex flex-wrap gap-4 items-end">
    {children}
  </div>
);

export const LogFilterField = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <label className="form-label">{label}</label>
    {children}
  </div>
);
