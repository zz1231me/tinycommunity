// client/src/components/Dashboard/SidebarNav.tsx
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface SidebarNavProps {
  label: string;
  to: string;
  icon: React.ReactNode;
  closeSidebar: () => void;
}

export function SidebarNav({ label, to, icon, closeSidebar }: SidebarNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive =
    location.pathname === `/dashboard/${to}` || location.pathname.startsWith(`/dashboard/${to}/`);

  const handleClick = () => {
    navigate(`/dashboard/${to}`);
    if (window.innerWidth < 1024) closeSidebar();
  };

  return (
    <button
      onClick={handleClick}
      className={`
        w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg
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

      {isActive && (
        <span className="w-1.5 h-1.5 rounded-full bg-primary-500 dark:bg-primary-400 flex-shrink-0" />
      )}
    </button>
  );
}
