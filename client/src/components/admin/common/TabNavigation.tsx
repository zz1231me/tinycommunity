// client/src/components/admin/common/TabNavigation.tsx
import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Users,
  ShieldCheck,
  KeyRound,
  Inbox,
  LayoutGrid,
  UserCog,
  Tag,
  Files,
  Calendar,
  Bookmark,
  Flag,
  ShieldAlert,
  Bug,
  History,
  ClipboardList,
  Globe,
  Settings,
  Gauge,
  type LucideIcon,
} from 'lucide-react';
import { TabType } from '../../../types/admin.types';

interface TabItem {
  id: TabType;
  label: string;
  icon: LucideIcon;
}
interface TabGroup {
  label: string;
  tabs: TabItem[];
}

export const TabNavigation = React.memo(() => {
  const location = useLocation();
  const currentPath = location.pathname.split('/').pop() || 'users';

  const groups = useMemo<TabGroup[]>(
    () => [
      {
        label: '사용자 · 권한',
        tabs: [
          { id: 'users', label: '사용자', icon: Users },
          { id: 'roles', label: '역할', icon: ShieldCheck },
          { id: 'permissions', label: '권한', icon: KeyRound },
          { id: 'password-reset-requests', label: '초기화 요청', icon: Inbox },
        ],
      },
      {
        label: '게시판 · 콘텐츠',
        tabs: [
          { id: 'boards', label: '게시판', icon: LayoutGrid },
          { id: 'board-managers', label: '게시판 담당자', icon: UserCog },
          { id: 'tags', label: '태그', icon: Tag },
          { id: 'files', label: '파일', icon: Files },
        ],
      },
      {
        label: '활동',
        tabs: [
          { id: 'events', label: '이벤트', icon: Calendar },
          { id: 'bookmarks', label: '북마크', icon: Bookmark },
          { id: 'reports', label: '신고', icon: Flag },
        ],
      },
      {
        label: '보안 · 로그',
        tabs: [
          { id: 'security-logs', label: '보안 로그', icon: ShieldAlert },
          { id: 'error-logs', label: '에러 로그', icon: Bug },
          { id: 'login-history', label: '로그인 이력', icon: History },
          { id: 'audit-logs', label: '감사 로그', icon: ClipboardList },
          { id: 'ip-management', label: 'IP 관리', icon: Globe },
        ],
      },
      {
        label: '시스템',
        tabs: [
          { id: 'site-settings', label: '사이트 설정', icon: Settings },
          { id: 'rate-limits', label: '속도 제한', icon: Gauge },
        ],
      },
    ],
    []
  );

  return (
    <nav className="space-y-5" aria-label="관리자 메뉴">
      {groups.map(group => (
        <div key={group.label}>
          <div className="px-3 mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
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
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
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
