import { useMemo, useState } from 'react';
import { Download, Clock, LogOut, TriangleAlert } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import MetricCard from '../components/dashboard/MetricCard.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { loanDurations } from '../services/stats.js';
import { describeEvent } from '../services/rules.js';
import { LONG_LOAN_HOURS } from '../lib/status.js';
import { assetColumns, eventColumns } from '../lib/exports.js';
import { fmtDateTime, fmtDuration, hoursSince } from '../lib/format.js';
import { toCsv } from '../lib/csv.js';
import { downloadFile } from '../lib/download.js';

const DAYS = 30;

export default function ReportsPage() {
  const { data, sectorName, getAsset, getStats, actions } = useData();
  const [exporting, setExporting] = useState(false);

  const r = useMemo(() => {
    const since = Date.now() - DAYS * 86400000;
    const recent = data.events.filter((e) => new Date(e.at).getTime() >= since);
    const checkouts = recent.filter((e) => e.type === 'checkout');
    const durations = loanDurations(data.events).filter((d) => new Date(d.endedAt).getTime() >= since);
    const avg = durations.length ? durations.reduce((a, d) => a + d.hours, 0) / durations.length : null;
    const bySector = new Map();
    for (const e of checkouts) bySector.set(e.sectorId, (bySector.get(e.sectorId) || 0) + 1);
    const stats = getStats();
    return {
      checkouts: checkouts.length,
      avg,
      bySector: [...bySector.entries()].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n),
      long: stats.activeLoans.filter((l) => hoursSince(l.since) > LONG_LOAN_HOURS).sort((a, b) => a.since.localeCompare(b.since)),
    };
  }, [data]);

  const exportAssets = () =>
    downloadFile('ativos.csv', toCsv(data.assets, assetColumns(sectorName, { withCreatedAt: true })), 'text/csv;charset=utf-8');

  // O estado guarda só os eventos recentes; a exportação busca o histórico completo na hora.
  const exportEvents = async () => {
    setExporting(true);
    try {
      const all = await actions.allEvents();
      downloadFile(
        'movimentacoes.csv',
        toCsv([...all].sort((a, b) => b.at.localeCompare(a.at)), eventColumns({ sectorName, getAsset, describeEvent })),
        'text/csv;charset=utf-8'
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard label={`Retiradas (${DAYS} dias)`} value={r.checkouts} icon={LogOut} tone="blue" />
        <MetricCard
          label="Tempo médio de empréstimo"
          value={r.avg == null ? '—' : r.avg < 1 ? `${Math.round(r.avg * 60)} min` : `${r.avg.toFixed(1).replace('.', ',')} h`}
          hint={`devoluções em ${DAYS} dias`}
          icon={Clock}
          tone="slate"
        />
        <MetricCard label={`Fora há mais de ${LONG_LOAN_HOURS} h`} value={r.long.length} hint="empréstimos prolongados" icon={TriangleAlert} tone={r.long.length ? 'amber' : 'green'} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Empréstimos prolongados</h2>
          </div>
          {r.long.length === 0 ? (
            <EmptyState title="Nenhum empréstimo acima do limite" />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-dense w-full">
                <thead className="bg-slate-50">
                  <tr><th>Patrimônio</th><th>Responsável</th><th>Setor</th><th>Fora há</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {r.long.slice(0, 10).map((l) => (
                    <tr key={l.tag}>
                      <td>
                        <a href={`#/ativos/${encodeURIComponent(l.tag)}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">{l.tag}</a>
                      </td>
                      <td>{l.user}</td>
                      <td>{l.sector}</td>
                      <td className="whitespace-nowrap font-medium text-amber-600" title={fmtDateTime(l.since)}>{fmtDuration(l.since)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {r.long.length > 10 && (
                <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
                  Mostrando 10 de {r.long.length}. <a className="text-brand-600 hover:underline" href="#/ativos?status=in_use">Ver todos em uso</a>
                </p>
              )}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Retiradas por setor de destino ({DAYS} dias)</h2>
          </div>
          {r.bySector.length === 0 ? (
            <EmptyState title="Sem movimentações no período" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {r.bySector.map(({ id, n }) => (
                <li key={id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="text-slate-700">{sectorName(id)}</span>
                  <span className="font-semibold text-slate-800">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card p-4">
        <h2 className="card-title mb-3">Exportar dados</h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary" onClick={exportAssets} disabled={!data.assets.length}>
            <Download className="h-4 w-4" /> Ativos (CSV)
          </button>
          <button className="btn btn-secondary" onClick={exportEvents} disabled={exporting}>
            <Download className="h-4 w-4" /> Movimentações (CSV)
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Formato CSV com separador “;”, pronto para abrir no Excel.</p>
      </section>
    </div>
  );
}
