// client/src/components/common/PageHeader.tsx
import React from 'react';
import { Link } from 'react-router-dom';

export interface Breadcrumb {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  /** 페이지 위에 표시할 breadcrumb. 마지막 항목은 자동으로 현재 페이지로 처리 (to 무시) */
  breadcrumbs?: Breadcrumb[];
  children?: React.ReactNode;
}

export const PageHeader = React.memo(
  ({ title, description, icon, breadcrumbs, children }: PageHeaderProps) => {
    // 마지막 조각이 바로 아래 제목과 같으면 그리지 않는다. 쓰는 쪽 두 군데가
    // 모두 같은 문자열을 넘기고 있어서, 같은 이름이 33px 간격으로 두 번 나오고
    // 그만큼 내용이 밀렸다(1512px 실측: 부스러기 y=80, 제목 y=113). 부스러기가
    // 실어 나르는 건 올라가는 길 하나뿐이고, 그건 여기 남는다.
    const trail =
      breadcrumbs && breadcrumbs.length > 0 && breadcrumbs[breadcrumbs.length - 1].label === title
        ? breadcrumbs.slice(0, -1)
        : breadcrumbs;

    return (
      <div className="mb-4 pb-3 border-b border-slate-200 dark:border-slate-700/60">
        {trail && trail.length > 0 && (
          <nav aria-label="breadcrumb" className="mb-3">
            <ol className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              {trail.map((bc, idx) => {
                // 마지막 조각을 떼어 내고 나면 남은 것들은 모두 '올라가는 길' 이다.
                // isLast 로 링크를 끄면 그 길까지 평범한 글자가 되어 버린다.
                const isCurrent = idx === trail.length - 1 && !bc.to;
                return (
                  <li key={`${bc.label}-${idx}`} className="flex items-center gap-1.5 min-w-0">
                    {idx > 0 && (
                      <svg
                        aria-hidden="true"
                        focusable="false"
                        className="w-3 h-3 text-slate-300 dark:text-slate-600 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    )}
                    {bc.to ? (
                      <Link
                        to={bc.to}
                        className="min-w-0 max-w-[180px] sm:max-w-[320px] truncate hover:text-primary-600 dark:hover:text-primary-400 hover:underline transition-colors"
                      >
                        {bc.label}
                      </Link>
                    ) : (
                      <span
                        aria-current={isCurrent ? 'page' : undefined}
                        className={`min-w-0 max-w-[180px] sm:max-w-[320px] truncate ${isCurrent ? 'text-slate-700 dark:text-slate-300 font-medium' : ''}`}
                      >
                        {bc.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
        {/* 제목과 동작을 한 줄에 두되, 자리가 모자라면 동작 묶음이 통째로 아랫줄로 내려간다.
            예전에는 sm 이상에서 무조건 한 줄이라 검색창·버튼이 제목을 밀어붙였고,
            설명 문구가 "…게시판 · 총" / "4개" 처럼 어정쩡하게 끊겼다. */}
        {/* banner 는 사이트 전체 머리글 하나를 가리키는 이정표다. 위쪽 진짜
            머리글이 이미 그것이라, 여기에도 달아 두면 페이지마다 '머리글' 이
            둘이 되어 건너뛸 때 어디로 갈지 알 수 없었다. main 안의 header 는
            이정표가 되지 않으므로 역할을 지우기만 하면 된다. */}
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-[14rem] flex-1 items-center gap-3">
            {icon && (
              <div
                className="w-8 h-8 text-primary-600 dark:text-primary-400 flex-shrink-0"
                aria-hidden="true"
              >
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="page-title truncate">{title}</h1>
              {description && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 whitespace-pre-wrap">
                  {description}
                </p>
              )}
            </div>
          </div>
          {/* 동작들은 가로로 선다. 예전에는 블록으로 쌓여, 1,152px 짜리 줄에서 142px 만
              쓰면서 세 줄을 차지했다(내 업무 화면에서 93px). 자리가 모자라면 줄바꿈한다. */}
          {children && (
            <nav
              className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2"
              aria-label="페이지 액션"
            >
              {children}
            </nav>
          )}
        </header>
      </div>
    );
  }
);

PageHeader.displayName = 'PageHeader';
