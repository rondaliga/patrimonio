import { STATUS, STATUS_ORDER } from '../../lib/status.js';

// Donut em SVG puro usando stroke-dasharray.
export default function StatusDonut({ totals, total }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Ativos por status</h2>
      </div>
      <div className="flex flex-col items-center gap-4 p-4">
        <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0 -rotate-90" role="img" aria-label="Distribuição por status">
          <circle cx="70" cy="70" r={r} fill="none" stroke="#f1f5f9" strokeWidth="18" />
          {total > 0 &&
            STATUS_ORDER.map((s) => {
              const len = (totals[s] / total) * c;
              const el = (
                <circle
                  key={s}
                  cx="70"
                  cy="70"
                  r={r}
                  fill="none"
                  stroke={STATUS[s].hex}
                  strokeWidth="18"
                  strokeDasharray={`${len} ${c - len}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
          <g className="rotate-90 origin-center">
            <text x="70" y="68" textAnchor="middle" className="fill-slate-800 text-2xl font-bold">
              {total}
            </text>
            <text x="70" y="84" textAnchor="middle" className="fill-slate-500 text-[9px]">
              ativos
            </text>
          </g>
        </svg>
        <ul className="w-full space-y-2 text-sm">
          {STATUS_ORDER.map((s) => (
            <li key={s} className="flex items-center justify-between gap-2">
              <a href={`#/ativos?status=${s}`} className="flex items-center gap-2 text-slate-600 hover:text-brand-700 hover:underline">
                <span className={`h-2.5 w-2.5 rounded-full ${STATUS[s].dot}`} />
                {STATUS[s].label}
              </a>
              <span className="font-semibold text-slate-800">
                {totals[s]}
                <span className="ml-1 text-xs font-normal text-slate-400">
                  ({total ? Math.round((totals[s] / total) * 100) : 0}%)
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
