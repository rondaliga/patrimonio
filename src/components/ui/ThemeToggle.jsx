import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext.jsx';

export default function ThemeToggle({ className = '' }) {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  const label = dark ? 'Mudar para o tema claro' : 'Mudar para o tema escuro';
  return (
    <button type="button" onClick={toggle} className={`btn btn-secondary btn-sm ${className}`} aria-label={label} title={label}>
      {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
    </button>
  );
}
