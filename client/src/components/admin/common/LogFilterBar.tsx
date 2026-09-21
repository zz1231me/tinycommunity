import { ReactNode } from 'react';
import { AdminFormField } from './AdminFormField';

/**
 * 로그 탭들의 필터 줄. 필터 변경이 즉시 쿼리 키에 반영되므로 검색 버튼은 없다.
 */
export const LogFilterBar = ({ children }: { children: ReactNode }) => (
  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700/60 flex flex-wrap gap-4 items-end">
    {children}
  </div>
);

// 라벨과 입력칸을 id 로 이어야 라벨 클릭과 낭독기 읽기가 동작한다.
export const LogFilterField = ({ label, children }: { label: string; children: ReactNode }) => (
  <AdminFormField label={label}>{children}</AdminFormField>
);
