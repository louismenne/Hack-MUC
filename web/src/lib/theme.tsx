import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';
type Resolved = 'light' | 'dark';

const storageKey = 'hackmuc.theme';
const darkQuery = '(prefers-color-scheme: dark)';

function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(storageKey);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(theme: Theme): Resolved {
  const resolved: Resolved = theme === 'dark' || (theme === 'system' && matchMedia(darkQuery).matches) ? 'dark' : 'light';
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

const ThemeContext = createContext<{ theme: Theme; resolvedTheme: Resolved; setTheme: (theme: Theme) => void } | null>(null);

/** Class-based theming without injected scripts; index.html sets the initial class to avoid a flash. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(storedTheme);
  const [resolvedTheme, setResolvedTheme] = useState<Resolved>(() => applyTheme(storedTheme()));

  useEffect(() => {
    setResolvedTheme(applyTheme(theme));
    if (theme !== 'system') return;
    const media = matchMedia(darkQuery);
    const onChange = () => setResolvedTheme(applyTheme('system'));
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    try {
      if (next === 'system') localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, next);
    } catch {
      // Theme still applies for this session.
    }
    setThemeState(next);
  }, []);

  return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider.');
  return context;
}
