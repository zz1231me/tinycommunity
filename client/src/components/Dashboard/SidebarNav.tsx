// client/src/components/Dashboard/SidebarNav.tsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';

interface SidebarNavProps {
  label: string;
  to: string;
  icon: React.ReactNode;
  closeSidebar: () => void;
  /** 이름 뒤에 붙는 표식(업무 게시판 등). 읽어 줄 말은 이 안에 함께 넣는다. */
  trailing?: React.ReactNode;
}

export function SidebarNav({ label, to, icon, closeSidebar, trailing }: SidebarNavProps) {
  const location = useLocation();
  const href = `/dashboard/${to}`;
  const isActive = location.pathname === href || location.pathname.startsWith(`${href}/`);

  /**
   * 좁은 화면의 서랍은 옮겨 간 뒤 닫는다. 다만 ⌘·가운데 클릭은 지금 보던 화면에
   * 머문 채 새 탭이 열리는 것이라, 눈앞의 서랍까지 닫으면 안 된다.
   */
  const handleClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (window.innerWidth < 1024) closeSidebar();
  };

  return (
    // 줄은 진짜 링크다. button + navigate 이던 때는 ⌘-클릭이 새 탭을 열지 않고 보던
    // 화면만 갈아 끼웠고, 주소가 없어 '새 탭으로 열기'·링크 복사도 되지 않았다.
    // Link 는 평범한 클릭만 가로채고 ⌘·가운데·우클릭은 브라우저에 넘긴다.
    <Link
      to={href}
      onClick={handleClick}
      className={`
        w-full flex items-center gap-3 px-3 py-2 rounded-lg
        text-base font-medium transition-all duration-150
        border-l-2
        ${
          isActive
            ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border-l-primary-500 dark:border-l-primary-400'
            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100 border-l-transparent'
        }
      `}
    >
      <span
        className={`flex-shrink-0 transition-colors ${
          isActive ? 'text-primary-600 dark:text-primary-400' : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        {icon}
      </span>

      <span className="flex-1 text-left truncate">{label}</span>

      {trailing}

      {isActive && (
        <span className="w-1.5 h-1.5 rounded-full bg-primary-500 dark:bg-primary-400 flex-shrink-0" />
      )}
    </Link>
  );
}
