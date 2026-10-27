import { useEffect } from 'react';
import { X } from 'lucide-react';

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

// `dismissible={false}`: modal bloqueante — sem botão fechar, sem Esc e sem fechar clicando fora
// (usado na troca de senha obrigatória do primeiro acesso).
export default function Modal({ open, title, onClose, children, size = 'md', dismissible = true }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && dismissible && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && dismissible && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card flex max-h-[92vh] w-full flex-col rounded-b-none sm:rounded-b-lg ${SIZES[size]}`}
      >
        <div className="card-header">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
          {dismissible && (
            <button onClick={onClose} aria-label="Fechar" className="rounded p-1 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
