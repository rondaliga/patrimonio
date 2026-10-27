import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LogIn, LogOut, Search, X } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import CheckOutForm from '../components/forms/CheckOutForm.jsx';
import CheckInForm from '../components/forms/CheckInForm.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ActorBadge from '../components/ui/ActorBadge.jsx';
import { fmtDateTime } from '../lib/format.js';
import { registeredBy } from '../lib/audit.js';
import DeleteEventButton from '../components/ui/DeleteEventButton.jsx';
import { describeEvent } from '../services/rules.js';
import { lastEventId } from '../services/patch.js';

const PAGE = 25;

export default function MovementPage({ query }) {
  const { data, actions, getAsset, sectorName, can } = useData();
  const preset = query.tag ? getAsset(query.tag.toUpperCase()) : null;

  // ---- Histórico com filtros (responsável + período) ----
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [moves, setMoves] = useState(null); // null = carregando
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const ticket = useRef(0); // descarta respostas de buscas antigas (digitação rápida)

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(id);
  }, [q]);

  // Muda quando chega movimentação nova (esta aba ou tempo real): a lista se atualiza sozinha.
  const lastId = useMemo(() => lastEventId(data), [data]);
  const filtered = !!(debouncedQ.trim() || from || to);

  useEffect(() => {
    const mine = ++ticket.current;
    setError('');
    actions
      .searchMovements({ q: debouncedQ, from, to, limit: PAGE })
      .then((rows) => {
        if (mine !== ticket.current) return;
        setMoves(rows);
        setHasMore(rows.length === PAGE);
      })
      .catch((e) => mine === ticket.current && (setError(e.message), setMoves((m) => m ?? [])));
  }, [actions, debouncedQ, from, to, lastId]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const rows = await actions.searchMovements({ q: debouncedQ, from, to, limit: PAGE, offset: moves.length });
      setMoves((m) => [...m, ...rows.filter((r) => !m.some((x) => x.id === r.id))]);
      setHasMore(rows.length === PAGE);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  }, [actions, debouncedQ, from, to, moves]);

  const clearFilters = () => {
    setQ('');
    setDebouncedQ('');
    setFrom('');
    setTo('');
  };

  const canMove = can('movement');

  return (
    <div className="space-y-4">
      {!canMove && (
        <p className="rounded bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">Seu perfil é de visualizador (somente leitura): não é possível registrar movimentações.</p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {canMove && <section className="card flex flex-col">
          <div className="card-header">
            <h2 className="card-title flex items-center gap-2"><LogOut className="h-4 w-4 text-sky-600 dark:text-sky-400" /> Retirada</h2>
          </div>
          <div className="flex flex-1 flex-col p-4">
            <CheckOutForm initialTag={preset?.status === 'available' ? preset.tag : ''} />
          </div>
        </section>}
        {canMove && <section className="card flex flex-col">
          <div className="card-header">
            <h2 className="card-title flex items-center gap-2"><LogIn className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Devolução</h2>
          </div>
          <div className="flex flex-1 flex-col p-4">
            <CheckInForm initialTag={preset?.status === 'in_use' ? preset.tag : ''} />
          </div>
        </section>}
      </div>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">{filtered ? 'Movimentações filtradas' : 'Últimas movimentações'}</h2>
          {moves && <span className="text-xs text-slate-500 dark:text-slate-400">{moves.length}{hasMore ? '+' : ''} {moves.length === 1 ? 'registro' : 'registros'}</span>}
        </div>

        <form
          role="search"
          aria-label="Filtrar movimentações"
          onSubmit={(e) => e.preventDefault()}
          className="grid gap-3 border-b border-slate-100 dark:border-slate-800 px-4 py-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_auto] lg:items-end"
        >
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="label" htmlFor="mv-q">Responsável</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                id="mv-q"
                type="search"
                className="input pl-9"
                placeholder="Nome ou usuário (ex.: maria.souza)"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="mv-from">Data início</label>
            <input id="mv-from" type="date" className="input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="mv-to">Data fim</label>
            <input id="mv-to" type="date" className="input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button type="button" className="btn btn-secondary" onClick={clearFilters} disabled={!q && !from && !to}>
            <X className="h-4 w-4" /> Limpar
          </button>
        </form>

        {error && <p className="mx-4 mt-3 rounded bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300" role="alert">{error}</p>}
        {moves === null ? (
          <p className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">Carregando…</p>
        ) : moves.length === 0 ? (
          <EmptyState title={filtered ? 'Nenhuma movimentação com esses filtros' : 'Nenhuma movimentação registrada'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-dense w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th>Quando</th>
                  <th>Patrimônio</th>
                  <th>Ativo</th>
                  <th className="hidden md:table-cell">Movimento</th>
                  <th className="hidden lg:table-cell">Registrado por</th>
                  {can('event.delete') && <th><span className="sr-only">Ações</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {moves.map((e) => {
                  const what = describeEvent(e, e.sectorId ? sectorName(e.sectorId) : '');
                  const by = registeredBy(e);
                  return (
                    <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="whitespace-nowrap text-slate-500 dark:text-slate-400">{fmtDateTime(e.at)}</td>
                      <td>
                        <a href={`#/ativos/${encodeURIComponent(e.tag)}`} className="font-mono text-xs font-semibold text-brand-700 dark:text-sky-300 hover:underline">
                          {e.tag}
                        </a>
                      </td>
                      <td>
                        {getAsset(e.tag)?.name ?? '—'}
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400 md:hidden">{what}</span>
                        <ActorBadge text={by} className="mt-1 lg:hidden" />
                      </td>
                      <td className="hidden md:table-cell">{what}</td>
                      <td className="hidden lg:table-cell"><ActorBadge text={by} />{!by && <span className="text-slate-400">—</span>}</td>
                      {can('event.delete') && (
                        <td className="text-right">
                          <DeleteEventButton id={e.id} label={`${e.tag} — ${what}`} onDeleted={(id) => setMoves((m) => m && m.filter((x) => x.id !== id))} />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {hasMore && (
              <div className="border-t border-slate-100 dark:border-slate-800 p-3 text-center">
                <button type="button" className="btn btn-secondary" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Carregando…' : 'Carregar mais'}
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
