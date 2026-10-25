import { useEffect, useState } from 'react';
import { Search, Plus, Menu, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { ROLES } from '../../lib/permissions.js';
import { buildQuery, navigate } from '../../router/hashRouter.js';

export default function Header({ title, onMenu, searchValue, hideSearch = false }) {
  const { user, fullName, role, signOut } = useAuth();
  const { can } = useData();
  const [q, setQ] = useState(searchValue || '');
  useEffect(() => setQ(searchValue || ''), [searchValue]);

  const submit = (e) => {
    e.preventDefault();
    navigate(`/ativos${buildQuery({ q: q.trim() })}`);
  };

  return (
    <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
      <button onClick={onMenu} className="rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Abrir menu">
        <Menu className="h-5 w-5" />
      </button>
      <h1 className="min-w-0 truncate text-base font-semibold text-slate-800 sm:text-lg" title={title}>{title}</h1>
      {!hideSearch && (
      <form onSubmit={submit} role="search" className="relative ml-4 hidden max-w-md flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar ativos"
          placeholder="Buscar por patrimônio, nome, série ou responsável…"
          className="input bg-slate-50 pl-9"
        />
      </form>
      )}
      <div className="ml-auto flex items-center gap-2">
        {can('asset.create') && (
          <a href="#/ativos?novo=1" className="btn btn-primary">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo ativo</span>
            <span className="sm:hidden">Novo</span>
          </a>
        )}
        {signOut && (
          <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
            <div className="hidden text-right leading-tight lg:block">
              <p className="max-w-[10rem] truncate text-xs font-medium text-slate-700">{fullName || user.email}</p>
              <p className="text-[11px] text-slate-500">{ROLES[role]}</p>
            </div>
            <button onClick={signOut} className="btn btn-secondary btn-sm" aria-label="Sair" title="Sair">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
