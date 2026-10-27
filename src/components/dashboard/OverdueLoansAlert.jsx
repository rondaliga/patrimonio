import { BellRing, LogIn } from 'lucide-react';
import { LONG_LOAN_HOURS } from '../../lib/status.js';
import { fmtDateTime, fmtDuration } from '../../lib/format.js';

const SHOWN = 5;

// Faixa vermelha no topo do painel: ativos emprestados há mais de LONG_LOAN_HOURS (os mais antigos primeiro).
export default function OverdueLoansAlert({ loans, now }) {
  if (!loans.length) return null;
  return (
    <section
      role="alert"
      className="overflow-hidden rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40"
      aria-label="Empréstimos críticos"
    >
      <div className="flex items-center gap-2 border-b border-red-200 dark:border-red-900/70 px-4 py-2.5 text-red-800 dark:text-red-200">
        <BellRing className="h-4 w-4 shrink-0" />
        <h2 className="text-sm font-semibold">
          {loans.length} {loans.length === 1 ? 'ativo está fora' : 'ativos estão fora'} há mais de {LONG_LOAN_HOURS} horas
        </h2>
        <a href="#/ativos?status=in_use" className="ml-auto text-xs font-medium underline">Ver em uso</a>
      </div>
      <ul className="divide-y divide-red-100 dark:divide-red-900/50">
        {loans.slice(0, SHOWN).map((l) => (
          <li key={l.tag} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm text-red-900 dark:text-red-100">
            <a href={`#/ativos/${encodeURIComponent(l.tag)}`} className="font-mono text-xs font-semibold underline">{l.tag}</a>
            <span className="min-w-0 flex-1 truncate">
              {l.asset} · {l.user} · {l.sector}
            </span>
            <span className="whitespace-nowrap text-xs" title={`Retirado em ${fmtDateTime(l.since)}`}>
              <strong className="rounded-full bg-red-600 px-2 py-0.5 text-white">há {fmtDuration(l.since, now)}</strong>
            </span>
            <a href={`#/movimentacao?tag=${encodeURIComponent(l.tag)}`} className="btn btn-secondary btn-sm" aria-label={`Devolver ${l.tag}`}>
              <LogIn className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Devolver</span>
            </a>
          </li>
        ))}
      </ul>
      {loans.length > SHOWN && (
        <p className="border-t border-red-100 dark:border-red-900/50 px-4 py-2 text-xs text-red-800 dark:text-red-200">
          + {loans.length - SHOWN} {loans.length - SHOWN === 1 ? 'outro' : 'outros'} na tabela de empréstimos ativos abaixo.
        </p>
      )}
    </section>
  );
}
