import { Suspense, lazy, useEffect, useState } from 'react';
import { Search, Plus, Menu, LogOut, KeyRound, ScanLine } from 'lucide-react';
import ThemeToggle from '../ui/ThemeToggle.jsx';
import ChangePasswordModal from '../ui/ChangePasswordModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { ROLES } from '../../lib/permissions.js';
import { buildQuery, navigate } from '../../router/hashRouter.js';

// O leitor (e a biblioteca da câmera) só é baixado na primeira vez que o botão é usado.
const QrScannerModal = lazy(() => import('../qr/QrScannerModal.jsx'));

export default function Header({ title, onMenu, searchValue, hideSearch = false }) {
  const { user, fullName, username, role, signOut, changePassword } = useAuth();
  const [pwOpen, setPwOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const { can } = useData();
  const [q, setQ] = useState(searchValue || '');
  useEffect(() => setQ(searchValue || ''), [searchValue]);

  const submit = (e) => {
    e.preventDefault();
    navigate(`/ativos${buildQuery({ q: q.trim() })}`);
  };

  return (
    <header className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 sm:px-6">
      <button onClick={onMenu} className="rounded-md p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 md:hidden" aria-label="Abrir menu">
        <Menu className="h-5 w-5" />
      </button>
      <h1 className="min-w-0 truncate text-base font-semibold text-slate-800 dark:text-slate-100 sm:text-lg" title={title}>{title}</h1>
      {!hideSearch && (
      <form onSubmit={submit} role="search" className="relative ml-4 hidden max-w-md flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar ativos"
          placeholder="Buscar por patrimônio, nome, série ou responsável…"
          className="input bg-slate-50 dark:bg-slate-800/50 pl-9"
        />
      </form>
      )}
      <div className="ml-auto flex items-center gap-2">
        <button type="button" onClick={() => setScanOpen(true)} className="btn btn-secondary" aria-label="Escanear QR Code de um ativo" title="Escanear QR Code de um ativo">
          <ScanLine className="h-4 w-4" />
          <span className="hidden sm:inline">Escanear</span>
        </button>
        {can('asset.create') && (
          <a href="#/ativos?novo=1" className="btn btn-primary">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo ativo</span>
            <span className="sm:hidden">Novo</span>
          </a>
        )}
        <ThemeToggle />
        {signOut && (
          <div className="flex items-center gap-2 border-l border-slate-200 dark:border-slate-700 pl-3">
            <div className="hidden text-right leading-tight lg:block">
              <p className="max-w-[10rem] truncate text-xs font-medium text-slate-700 dark:text-slate-200">{fullName || username || user.email}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{ROLES[role]}</p>
            </div>
            {changePassword && (
              <button onClick={() => setPwOpen(true)} className="btn btn-secondary btn-sm" aria-label="Alterar minha senha" title="Alterar minha senha">
                <KeyRound className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={signOut} className="btn btn-secondary btn-sm" aria-label="Sair" title="Sair">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
      {scanOpen && (
        <Suspense fallback={null}>
          <QrScannerModal open onClose={() => setScanOpen(false)} />
        </Suspense>
      )}
    </header>
  );
}
