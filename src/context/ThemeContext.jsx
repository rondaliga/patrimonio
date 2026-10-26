import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { applyTheme, readStoredTheme, resolveTheme, storeTheme, systemPrefersDark } from '../lib/theme.js';

const ThemeContext = createContext({ theme: 'light', toggle: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => resolveTheme(readStoredTheme(), systemPrefersDark()));
  const [chosen, setChosen] = useState(() => readStoredTheme() !== null);

  useEffect(() => applyTheme(theme), [theme]);

  // Enquanto a pessoa não escolheu, acompanha o sistema (ex.: escurece à noite no celular).
  useEffect(() => {
    if (chosen || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = (e) => setTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [chosen]);

  const toggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    storeTheme(next);
    setChosen(true);
    setTheme(next);
  }, [theme]);

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
