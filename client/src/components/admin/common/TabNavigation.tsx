// client/src/components/admin/common/TabNavigation.tsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { GROUPS } from './adminTabs';

export const TabNavigation = React.memo(() => {
  const location = useLocation();
  const currentPath = location.pathname.split('/').pop() || 'users';

  return (
    <nav className="space-y-5" aria-label="관리자 메뉴">
      {GROUPS.map(group => (
        <div key={group.label}>
          <div className="px-3 mb-1.5 text-2xs font-medium tracking-wider text-slate-400">
            {group.label}
          </div>
          <div className="space-y-0.5">
            {group.tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = currentPath === tab.id;
              return (
                <Link
                  key={tab.id}
                  to={`/admin/${tab.id}`}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? 'bg-primary-600 text-white font-medium'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <Icon
                    className="w-[18px] h-[18px] flex-shrink-0"
                    strokeWidth={isActive ? 2.1 : 1.8}
                    aria-hidden="true"
                  />
                  <span className="truncate">{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
});

TabNavigation.displayName = 'TabNavigation';
