// client/src/contexts/ThemeContext.tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { safeStorage } from '../utils/safeStorage';
import { updateTheme as updateThemeAPI } from '../api/auth';
import { logger } from '../utils/logger';

// 드라큘라는 다크의 변종이다 — 표면/글자 규칙은 다크 그대로 쓰고 색만 갈아 끼운다.
// 그래서 effectiveTheme 은 계속 light|dark 두 가지다(소비자 코드가 그대로 동작한다).
export type Theme = 'light' | 'dark' | 'dracula' | 'system';
const THEMES: Theme[] = ['light', 'dark', 'dracula', 'system'];

/** 다크 계열 테마별 팔레트 이름. 기본 다크는 팔레트를 따로 두지 않는다 */
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
    // localStorage에서 먼저 확인 (로그인 전).
    // 아는 값인지 확인한다 — 손으로 고친 값이 들어오면 클래스도 팔레트도 붙지 않아
    // 화면이 조용히 라이트로 떨어진다.
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

      // 팔레트는 클래스가 아니라 data 속성으로 — dark: 변형을 건드리지 않고
      // CSS 변수만 덮어쓰기 위해서다 (styles/dracula.css 참고)
      const palette = PALETTE[theme];
      if (palette) root.dataset.palette = palette;
      else delete root.dataset.palette;
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

  // 서버와 동기화하는 함수
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
    safeStorage.set('myhome-theme', newTheme);

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
