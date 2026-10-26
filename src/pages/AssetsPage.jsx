import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import AssetFormModal from '../components/forms/AssetFormModal.jsx';
import { CATEGORIES, STATUS, STATUS_ORDER } from '../lib/status.js';
import { assetColumns } from '../lib/exports.js';
import { fold } from '../lib/format.js';
import { toCsv } from '../lib/csv.js';
import { downloadFile } from '../lib/download.js';
import { buildQuery, navigate } from '../router/hashRouter.js';

const PAGE_SIZE = 25;

export default function AssetsPage({ query }) {
  const { data, sectorName, can } = useData();
  const filters = {
    q: query.q || '',
    status: query.status || '',
    setor: query.setor || '',
    categoria: query.categoria || '',
  };
  const page = Math.max(1, Number(query.pagina) || 1);

  // Campo de busca com debounce: escreve na URL, que é a fonte da verdade.
  const [q, setQ] = useState(filters.q);
  useEffect(() => setQ(filters.q), [filters.q]);
  useEffect(() => {
    if (q === filters.q) return undefined;
    const t = setTimeout(() => navigate(`/ativos${buildQuery({ ...filters, q })}`, { replace: true }), 250);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const setFilter = (key, value) => navigate(`/ativos${buildQuery({ ...filters, [key]: value })}`, { replace: true });

  // Índice de busca: o texto normalizado (sem acento/caixa) de cada ativo é calculado uma vez
  // por versão dos dados, e não a cada tecla digitada. A ordenação também.
  const index = useMemo(
    () =>
      [...data.assets]
        .sort((a, b) => a.tag.localeCompare(b.tag))
        .map((a) => ({ a, hay: fold(`${a.tag} ${a.name} ${a.serial} ${a.assignedTo?.user ?? ''}`) })),
    [data.assets]
  );

  const rows = useMemo(() => {
    const needle = fold(filters.q.trim());
    const out = [];
    for (const { a, hay } of index) {
      if (filters.status && a.status !== filters.status) continue;
      if (filters.setor && a.sectorId !== filters.setor) continue;
      if (filters.categoria && a.category !== filters.categoria) continue;
      if (needle && !hay.includes(needle)) continue;
      out.push(a);
    }
    return out;
  }, [index, filters.q, filters.status, filters.setor, filters.categoria]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const slice = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const goPage = (p) => navigate(`/ativos${buildQuery({ ...filters, pagina: p > 1 ? p : '' })}`, { replace: true });

  const hasFilters = Object.values(filters).some(Boolean);
  const showForm = query.novo === '1' && can('asset.create');
  const closeForm = () => navigate(`/ativos${buildQuery(filters)}`, { replace: true });

  const exportCsv = () => {
    const csv = toCsv(rows, assetColumns(sectorName));
    downloadFile('ativos.csv', csv, 'text/csv;charset=utf-8');
  };

  return (
    <div className="space-y-4">
      <div className="card p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Patrimônio, nome, série ou responsável…"
              aria-label="Buscar"
            />
          </div>
          <select className="input" aria-label="Status" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">Todos os status</option>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
          </select>
          <select className="input" aria-label="Setor" value={filters.setor} onChange={(e) => setFilter('setor', e.target.value)}>
            <option value="">Todos os setores</option>
            {data.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="input" aria-label="Categoria" value={filters.categoria} onChange={(e) => setFilter('categoria', e.target.value)}>
            <option value="">Todas as categorias</option>
            {Object.entries(CATEGORIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            {rows.length} {rows.length === 1 ? 'ativo' : 'ativos'}
            {hasFilters && (
              <a href="#/ativos" className="ml-3 text-xs font-normal text-brand-600 dark:text-sky-300 hover:underline">limpar filtros</a>
            )}
          </h2>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={!rows.length}>
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState title="Nenhum ativo encontrado">
            {hasFilters ? 'Ajuste os filtros ou a busca.' : can('asset.create') ? 'Cadastre o primeiro ativo.' : ''}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-dense w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th>Patrimônio</th>
                  <th>Ativo</th>
                  <th className="hidden lg:table-cell">Setor de origem</th>
                  <th className="hidden md:table-cell">Localização atual</th>
                  <th className="hidden md:table-cell">Status</th>
                  <th className="hidden md:table-cell" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {slice.map((a) => (
                  <tr key={a.tag} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                    <td>
                      <a href={`#/ativos/${encodeURIComponent(a.tag)}`} className="font-mono text-xs font-semibold text-brand-700 dark:text-sky-300 hover:underline">
                        {a.tag}
                      </a>
                    </td>
                    <td>
                      {a.name}
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">{CATEGORIES[a.category]}</span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400 md:hidden">
                        {a.assignedTo ? `${a.assignedTo.user} · ${sectorName(a.assignedTo.sectorId)}` : sectorName(a.sectorId)}
                      </span>
                      <span className="mt-1 block md:hidden"><StatusBadge status={a.status} /></span>
                    </td>
                    <td className="hidden lg:table-cell">{sectorName(a.sectorId)}</td>
                    <td className="hidden md:table-cell">
                      {a.assignedTo ? (
                        <>
                          {a.assignedTo.user}
                          <span className="block text-[11px] text-slate-500 dark:text-slate-400">{sectorName(a.assignedTo.sectorId)}</span>
                        </>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">{sectorName(a.sectorId)}</span>
                      )}
                    </td>
                    <td className="hidden md:table-cell"><StatusBadge status={a.status} /></td>
                    <td className="hidden text-right md:table-cell">
                      <a href={`#/ativos/${encodeURIComponent(a.tag)}`} className="btn btn-secondary btn-sm">Abrir</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-4 py-2 text-sm text-slate-500 dark:text-slate-400">
            <span>Página {current} de {pages}</span>
            <div className="flex gap-1">
              <button className="btn btn-secondary btn-sm" disabled={current <= 1} onClick={() => goPage(current - 1)} aria-label="Página anterior">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button className="btn btn-secondary btn-sm" disabled={current >= pages} onClick={() => goPage(current + 1)} aria-label="Próxima página">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <AssetFormModal
        open={showForm}
        asset={null}
        onClose={closeForm}
        onSaved={(a) => navigate(`/ativos/${encodeURIComponent(a.tag)}`)}
      />
    </div>
  );
}
