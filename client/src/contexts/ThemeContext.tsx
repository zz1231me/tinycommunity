import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { safeStorage } from '../utils/safeStorage';
import { updateTheme as updateThemeAPI } from '../api/auth';
import { logger } from '../utils/logger';

// 드라큘라는 다크의 변종이라 effectiveTheme 은 계속 light|dark 두 가지다.
export type Theme = 'light' | 'dark' | 'dracula' | 'system';
const THEMES: Theme[] = ['light', 'dark', 'dracula', 'system'];

/** 다크 계열 테마별 팔레트 이름. 기본 다크는 팔레트를 두지 않는다. */
const PALETTE: Partial<Record<Theme, string>> = { dracula: 'dracula' };

interface ThemeContextType {
  theme: Theme;
  effectiveTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  syncThemeWithServer: (theme: Theme) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    // 로그인 전에는 localStorage 를 쓴다. 아는 값이 아니면 system 으로 떨어뜨린다.
    const stored = safeStorage.get('myhome-theme');
    return THEMES.includes(stored as Theme) ? (stored as Theme) : 'system';
  });

  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const getEffectiveTheme = (): 'light' | 'dark' => {
      if (theme === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      // 드라큘라는 어두운 테마다
      return theme === 'dracula' ? 'dark' : theme;
    };

    const updateTheme = () => {
      const newEffectiveTheme = getEffectiveTheme();
      setEffectiveTheme(newEffectiveTheme);

      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(newEffectiveTheme);

      // 팔레트는 dark: 변형을 건드리지 않도록 클래스가 아닌 data 속성으로 붙인다.
      const palette = PALETTE[theme];
      if (palette) root.dataset.palette = palette;
      else delete root.dataset.palette;
    };

    updateTheme();

    // system 모드에서는 시스템 테마 변경을 따라간다
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => updateTheme();
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    return undefined;
  }, [theme]);

  const syncThemeWithServer = async (newTheme: Theme) => {
    try {
      await updateThemeAPI(newTheme);
      logger.success('테마가 서버에 저장되었습니다', { theme: newTheme });
    } catch (error) {
      logger.warn('테마 서버 저장 실패 (로그인 필요)', error);
      // 로그인 전에는 localStorage 만 쓴다
    }
  };

  const handleSetTheme = async (newTheme: Theme) => {
    setTheme(newTheme);
    safeStorage.set('myhome-theme', newTheme);

    // 서버 저장에 실패해도 로컬에는 남는다
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
