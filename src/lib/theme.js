// Tema claro/escuro. Sem escolha salva, segue o tema do sistema operacional.
export const THEME_KEY = 'patrimonio-theme';
const COLORS = { light: '#f1f5f9', dark: '#020617' }; // barra do navegador no celular

export function readStoredTheme(storage = safeStorage()) {
  try {
    const v = storage?.getItem(THEME_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

export function storeTheme(theme, storage = safeStorage()) {
  try {
    storage?.setItem(THEME_KEY, theme);
  } catch {
    /* armazenamento bloqueado: a escolha vale só nesta sessão */
  }
}

export const resolveTheme = (stored, prefersDark) => stored ?? (prefersDark ? 'dark' : 'light');

export const systemPrefersDark = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;

// Aplica no <html>: a classe `dark` liga as variantes do Tailwind e color-scheme ajusta barras e campos nativos.
export function applyTheme(theme, root = document.documentElement) {
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
  const meta = root.ownerDocument?.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', COLORS[theme]);
}

function safeStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
