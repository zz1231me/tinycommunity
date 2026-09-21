import React from 'react';

interface AdminSectionProps {
  title: string;
  /** 다른 화면에서 이 구역으로 바로 오게 할 때 쓰는 URL 해시 */
  id?: string;
  children: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

/** 관리자 화면의 한 구역. 여백과 제목 크기를 다른 화면과 맞춘다. */
export const AdminSection = React.memo(
  ({ title, id, children, actions, className = '' }: AdminSectionProps) => {
    return (
      <section id={id} className={`mb-7 scroll-mt-24 ${className}`}>
        {/* 줄바꿈을 막으면 버튼이 많은 구역에서 묶음이 화면 밖으로 나간다 */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-200 pb-2 dark:border-slate-700/60">
          <h2 className="card-title min-w-0 flex-1 truncate">{title}</h2>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
        <div>{children}</div>
      </section>
    );
  }
);

AdminSection.displayName = 'AdminSection';
