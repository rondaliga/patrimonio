import { STATUS, STATUS_ORDER } from '../../lib/status.js';
import EmptyState from '../ui/EmptyState.jsx';

// Barras horizontais empilhadas por status — HTML/CSS puro, sem lib de gráficos.
export default function SectorBarChart({ data, className = '' }) {
  const max = Math.max(1, ...data.map((d) => d.total));

  return (
    <div className={`card ${className}`}>
      <div className="card-header">
        <h2 className="card-title">Ativos por setor</h2>
        <div className="hidden gap-3 text-[11px] text-slate-500 dark:text-slate-400 sm:flex">
          {STATUS_ORDER.map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${STATUS[s].dot}`} />
              {STATUS[s].label.split(' /')[0]}
            </span>
          ))}
        </div>
      </div>
      {data.length === 0 ? (
        <EmptyState title="Nenhum setor cadastrado" />
      ) : (
        <ul className="space-y-3 p-4">
          {data.map(({ id, sector, byStatus, total }) => (
            <li key={id} className="flex items-center gap-3">
              <a
                href={`#/ativos?setor=${encodeURIComponent(id)}`}
                className="w-32 shrink-0 truncate text-sm text-slate-600 dark:text-slate-300 hover:text-brand-700 dark:hover:text-sky-200 hover:underline"
              >
                {sector}
              </a>
              <div
                className="flex h-5 overflow-hidden rounded bg-slate-100 dark:bg-slate-800"
                style={{ width: `${(total / max) * 100}%`, minWidth: '2rem' }}
                role="img"
                aria-label={`${sector}: ${total} ${total === 1 ? 'ativo' : 'ativos'}`}
              >
                {STATUS_ORDER.map((s) =>
                  byStatus[s] > 0 ? (
                    <div
                      key={s}
                      className={STATUS[s].dot}
                      style={{ width: `${(byStatus[s] / total) * 100}%` }}
                      title={`${STATUS[s].label}: ${byStatus[s]}`}
                    />
                  ) : null
                )}
              </div>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{total}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
