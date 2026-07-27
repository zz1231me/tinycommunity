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
    return (
      <div className="mb-6 pb-5 border-b border-slate-200 dark:border-slate-700/60">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="breadcrumb" className="mb-3">
            <ol className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              {breadcrumbs.map((bc, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
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
                    {!isLast && bc.to ? (
                      <Link
                        to={bc.to}
                        className="min-w-0 truncate hover:text-primary-600 dark:hover:text-primary-400 hover:underline transition-colors"
                      >
                        {bc.label}
                      </Link>
                    ) : (
                      <span
                        aria-current={isLast ? 'page' : undefined}
                        className={`min-w-0 truncate ${isLast ? 'text-slate-700 dark:text-slate-300 font-medium' : ''}`}
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
        <header
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
          role="banner"
          aria-label={`${title} 페이지 헤더`}
        >
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div
                className="w-8 h-8 text-primary-600 dark:text-primary-400 flex-shrink-0"
                aria-hidden="true"
              >
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 leading-tight truncate">
                {title}
              </h1>
              {description && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 whitespace-pre-wrap">
                  {description}
                </p>
              )}
            </div>
          </div>
          {children && (
            <nav className="flex-shrink-0 w-full sm:w-auto" aria-label="페이지 액션">
              {children}
            </nav>
          )}
        </header>
      </div>
    );
  }
);

PageHeader.displayName = 'PageHeader';
