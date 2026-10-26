import { LogOut, LogIn, Wrench, Droplets, Ban, Plus, Pencil, BadgeCheck } from 'lucide-react';
import EmptyState from '../ui/EmptyState.jsx';
import DeleteEventButton from '../ui/DeleteEventButton.jsx';
import { fmtDateTime } from '../../lib/format.js';

export const EVENT_STYLES = {
  checkout: { icon: LogOut, color: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300' },
  checkin: { icon: LogIn, color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
  maintenance: { icon: Wrench, color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  sterilization: { icon: Droplets, color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  restored: { icon: BadgeCheck, color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
  retired: { icon: Ban, color: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' },
  created: { icon: Plus, color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' },
  edited: { icon: Pencil, color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' },
};

export default function RecentActivity({ items }) {
  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Atividade recente</h2>
      </div>
      {items.length === 0 ? (
        <EmptyState title="Sem atividade ainda" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map(({ id, type, tag, text, sector, at }) => {
            const { icon: Icon, color } = EVENT_STYLES[type] ?? EVENT_STYLES.edited;
            return (
              <li key={id} className="flex items-start gap-3 px-4 py-3">
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${color}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-700 dark:text-slate-200">
                    <a href={`#/ativos/${encodeURIComponent(tag)}`} className="font-mono text-xs font-semibold text-brand-700 dark:text-sky-300 hover:underline">
                      {tag}
                    </a>{' '}
                    {text}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {sector ? `${sector} · ` : ''}
                    {fmtDateTime(at)}
                  </p>
                </div>
                <DeleteEventButton id={id} label={`${tag} — ${text}`} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
