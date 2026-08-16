import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'ncc';

const THEME_STORAGE_KEY = 'ncc-bot-theme';
const THEMES: Theme[] = ['light', 'dark', 'ncc'];

function isTheme(value: string | null): value is Theme {
  return value !== null && (THEMES as string[]).includes(value);
}

function readStoredTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(stored) ? stored : 'light';
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
