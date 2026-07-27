// client/src/contexts/ThemeContext.tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { updateTheme as updateThemeAPI } from '../api/auth';
import { logger } from '../utils/logger';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  effectiveTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  syncThemeWithServer: (theme: Theme) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    // localStorage에서 먼저 확인 (로그인 전)
    const stored = localStorage.getItem('myhome-theme') as Theme;
    return stored || 'system';
  });

  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const getEffectiveTheme = (): 'light' | 'dark' => {
      if (theme === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return theme;
    };

    const updateTheme = () => {
      const newEffectiveTheme = getEffectiveTheme();
      setEffectiveTheme(newEffectiveTheme);

      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(newEffectiveTheme);
    };

    updateTheme();

    // system 모드일 때 시스템 테마 변경 감지
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => updateTheme();
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    return undefined;
  }, [theme]);

  // ✅ 서버와 동기화하는 함수
  const syncThemeWithServer = async (newTheme: Theme) => {
    try {
      await updateThemeAPI(newTheme);
      logger.success('테마가 서버에 저장되었습니다', { theme: newTheme });
    } catch (error) {
      logger.warn('테마 서버 저장 실패 (로그인 필요)', error);
      // 로그인하지 않은 상태에서는 localStorage만 사용
    }
  };

  const handleSetTheme = async (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem('myhome-theme', newTheme);

    // 서버에 비동기로 저장 (실패해도 로컬에는 저장됨)
    await syncThemeWithServer(newTheme);
  };

  return (
    <ThemeContext.Provider
      value={{ theme, effectiveTheme, setTheme: handleSetTheme, syncThemeWithServer }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
