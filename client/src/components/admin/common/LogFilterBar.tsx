import { ReactNode } from 'react';
import { AdminFormField } from './AdminFormField';

/**
 * 로그 탭들의 필터 줄. 라벨+입력 한 쌍을 반복하던 마크업을 모았다.
 * 필터 변경은 즉시 쿼리 키에 반영되므로 별도 '검색' 버튼은 두지 않는다.
 */
export const LogFilterBar = ({ children }: { children: ReactNode }) => (
  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700/60 flex flex-wrap gap-4 items-end">
    {children}
  </div>
);

// 라벨과 입력칸을 이어 준다(AdminFormField 가 id 를 붙여 준다). 이어 주지 않으면
// 라벨을 눌러도 칸에 들어가지 않고, 화면 낭독기는 칸 이름을 읽어 주지 못한다.
export const LogFilterField = ({ label, children }: { label: string; children: ReactNode }) => (
  <AdminFormField label={label}>{children}</AdminFormField>
);
