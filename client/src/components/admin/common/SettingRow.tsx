// client/src/components/admin/common/SettingRow.tsx
// 설정 한 줄 — 왼쪽에 이름과 설명, 오른쪽에 입력칸.
//
// 이름·설명·입력칸을 세로로 쌓으면 항목 하나가 본문 폭 전체를 차지해 목록을 훑기 어렵다.
// 이름을 왼쪽 한 열에 모아 위아래로 나란히 세운다.
//
// 라벨 마크업도 여기 한 곳에 둔다. 화면마다 직접 적으면 크기·굵기·여백이 갈린다.

import React, { useId } from 'react';

interface SettingRowProps {
  /** 설정 이름 */
  label: string;
  /** 이 설정이 무엇을 바꾸는지 한 줄로 */
  description?: React.ReactNode;
  /** 필수 입력이면 이름 옆에 * 를 붙인다 */
  required?: boolean;
  /** 입력칸. 하나짜리면 label 과 자동으로 연결된다 */
  children: React.ReactNode;
}

export function SettingRow({ label, description, required, children }: SettingRowProps) {
  const generatedId = useId();

  // 입력 요소가 하나면 htmlFor 로 묶어 준다 — 이름을 눌러도 입력칸이 잡힌다.
  // 이미 id 가 있으면 그대로 쓴다(다른 곳에서 참조하고 있을 수 있다).
  const single = React.isValidElement(children);
  const existingId = single ? (children.props as { id?: string }).id : undefined;
  const controlId = single ? (existingId ?? generatedId) : undefined;
  const control =
    single && !existingId
      ? React.cloneElement(children as React.ReactElement<{ id?: string }>, { id: controlId })
      : children;

  return (
    <div className="grid gap-x-8 gap-y-1.5 border-b border-slate-100 py-4 last:border-b-0 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] dark:border-slate-700/60">
      <div className="min-w-0">
        <label
          htmlFor={controlId}
          className="block text-sm font-medium text-slate-800 dark:text-slate-200"
        >
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>
      <div className="min-w-0">{control}</div>
    </div>
  );
}

/**
 * 설정 여러 줄을 담는 자리.
 * SettingRow 사이의 구분선은 각 줄이 스스로 그리므로 여기서는 아무것도 하지 않는다 —
 * space-y 를 주면 구분선과 여백이 겹쳐 줄 간격이 들쭉날쭉해진다.
 */
export function SettingList({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}
