// client/src/components/admin/common/AdminSection.tsx
import React from 'react';

interface AdminSectionProps {
  title: string;
  /**
   * 다른 화면에서 이 구역으로 바로 데려올 때 쓰는 이름(URL 해시).
   * 예) 기능 설정의 '포인트 뽑기' 행 → /admin/site-settings#lottery
   */
  id?: string;
  children: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
  className?: string; // Allow custom classes if needed
}

/**
 * 관리자 화면의 한 덩어리.
 *
 * 여백과 제목 크기를 앱의 나머지 화면(구역 간격 20~24px, 카드 머리글 크기)과 맞춘다.
 * 관리 화면만 다른 값을 쓰면 한 화면에 담기는 정보가 줄고 톤도 갈린다.
 */
export const AdminSection = React.memo(
  ({ title, id, children, actions, className = '' }: AdminSectionProps) => {
    return (
      <section id={id} className={`mb-7 scroll-mt-24 ${className}`}>
        {/* 좁은 화면에서는 동작 묶음이 통째로 아랫줄로 내려간다.
            flex-shrink-0 만 주고 줄바꿈을 막으면 버튼이 많은 구역(보안 로그·오류 로그)에서
            묶음이 화면 밖으로 나가 페이지가 옆으로 밀린다. */}
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
