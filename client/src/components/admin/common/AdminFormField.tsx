import React, { useId } from 'react';

interface AdminFormFieldProps {
  label: string;
  labelNote?: string;
  children: React.ReactNode;
}

/** 어드민 폼 필드: label + input/select 래퍼 */
export const AdminFormField: React.FC<AdminFormFieldProps> = ({ label, labelNote, children }) => {
  const generatedId = useId();
  // 단일 입력 요소를 감싸는 경우 label과 id를 연결 (접근성). 이미 id가 있으면 그대로 둔다.
  let inputId = generatedId;
  let child = children;
  if (React.isValidElement(children)) {
    const existingId = (children.props as { id?: string }).id;
    inputId = existingId ?? generatedId;
    if (!existingId) {
      child = React.cloneElement(children as React.ReactElement<{ id?: string }>, { id: inputId });
    }
  }

  return (
    <div>
      <label
        htmlFor={React.isValidElement(children) ? inputId : undefined}
        className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"
      >
        {label}
        {labelNote && <span className="text-slate-400 ml-1">{labelNote}</span>}
      </label>
      {child}
    </div>
  );
};

/** 어드민 표준 텍스트 입력 클래스 */
// eslint-disable-next-line react-refresh/only-export-components
export const adminInputCls = (width = 'w-40') =>
  `${width} rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-colors duration-150`;
