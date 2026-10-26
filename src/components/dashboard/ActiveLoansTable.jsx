import { LogIn } from 'lucide-react';
import EmptyState from '../ui/EmptyState.jsx';
import { CATEGORIES, LONG_LOAN_HOURS } from '../../lib/status.js';
import { fmtDateTime, fmtDuration, hoursSince } from '../../lib/format.js';

export default function ActiveLoansTable({ loans }) {
  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Empréstimos ativos</h2>
        <span className="rounded-full bg-sky-100 dark:bg-sky-900/40 px-2 py-0.5 text-xs font-semibold text-sky-800 dark:text-sky-200">{loans.length}</span>
      </div>
      {loans.length === 0 ? (
        <EmptyState title="Nenhum empréstimo ativo" />
      ) : (
        <div className="overflow-x-auto">
          <table className="table-dense w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th>Patrimônio</th>
                <th>Ativo</th>
                <th className="hidden md:table-cell">Responsável</th>
                <th className="hidden md:table-cell">Setor de destino</th>
                <th>Desde</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loans.slice(0, 12).map((l) => {
                const long = hoursSince(l.since) > LONG_LOAN_HOURS;
                return (
                  <tr key={l.tag} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                    <td>
                      <a href={`#/ativos/${encodeURIComponent(l.tag)}`} className="font-mono text-xs font-semibold text-brand-700 dark:text-sky-300 hover:underline">
                        {l.tag}
                      </a>
                    </td>
                    <td>
                      {l.asset}
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">{CATEGORIES[l.category]}</span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400 md:hidden">{l.user} · {l.sector}</span>
                    </td>
                    <td className="hidden md:table-cell">{l.user}</td>
                    <td className="hidden md:table-cell">{l.sector}</td>
                    <td className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                      <span className="hidden md:inline">{fmtDateTime(l.since)}</span>
                      <span className={`block text-[11px] ${long ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        há {fmtDuration(l.since)}
                      </span>
                    </td>
                    <td className="text-right">
                      <a href={`#/movimentacao?tag=${encodeURIComponent(l.tag)}`} aria-label={`Devolver ${l.tag}`} className="btn btn-secondary btn-sm">
                        <LogIn className="h-3.5 w-3.5" />
                        <span className="hidden md:inline">Devolver</span>
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {loans.length > 12 && (
            <p className="border-t border-slate-100 dark:border-slate-800 px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
              Mostrando 12 de {loans.length}. <a className="text-brand-600 dark:text-sky-300 hover:underline" href="#/ativos?status=in_use">Ver todos</a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
