// client/src/components/ThemeToggle.tsx
import { type ReactElement } from 'react';
import { Moon, Monitor, Sun } from 'lucide-react';
import { useTheme, type Theme } from '../contexts/ThemeContext';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const themes: Array<{ value: Theme; label: string; icon: ReactElement }> = [
    { value: 'light', label: '라이트', icon: <Sun className="h-4 w-4" /> },
    { value: 'dark', label: '다크', icon: <Moon className="h-4 w-4" /> },
    // 드라큘라 — 다크의 변종이라 달 아이콘을 쓰되 그 테마의 보라로 칠해 구분한다.
    // 아이콘 모양까지 바꾸면 "무슨 기능인지" 가 흐려진다.
    {
      value: 'dracula',
      label: '드라큘라',
      icon: <Moon className="h-4 w-4 fill-current text-[#bd93f9]" />,
    },
    { value: 'system', label: '시스템', icon: <Monitor className="h-4 w-4" /> },
  ];

  return (
    <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-700 rounded-lg">
      {themes.map(t => (
        <button
          key={t.value}
          onClick={() => setTheme(t.value)}
          className={`
            flex items-center justify-center px-3 py-1.5 rounded-md transition-all duration-200
            ${
              theme === t.value
                ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }
          `}
          title={`${t.label} 모드로 전환`}
          aria-label={`${t.label} 모드로 전환`}
          aria-pressed={theme === t.value}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}
