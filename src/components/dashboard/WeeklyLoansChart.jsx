// Mini gráfico de colunas — check-outs nos últimos 7 dias.
// As barras usam posicionamento absoluto com altura em %, então acompanham a altura do card.
export default function WeeklyLoansChart({ data, className = '' }) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className={`card flex flex-col ${className}`}>
      <div className="card-header">
        <h2 className="card-title">Check-outs nos últimos 7 dias</h2>
      </div>
      <div className="flex min-h-48 flex-1 items-stretch gap-3 px-4 pb-3 pt-4">
        {data.map((d, i) => {
          const isToday = i === data.length - 1;
          const pct = (d.value / max) * 85;
          return (
            <div key={`${d.day}-${i}`} className="flex flex-1 flex-col items-center gap-1">
              <div className="relative w-full flex-1" title={`${d.day}: ${d.value}`}>
                <span
                  className="absolute inset-x-0 text-center text-[11px] font-medium text-slate-500"
                  style={{ bottom: `calc(${pct}% + 2px)` }}
                >
                  {d.value}
                </span>
                <div
                  className={`absolute inset-x-0 bottom-0 rounded-t ${isToday ? 'bg-brand-600' : 'bg-brand-100'}`}
                  style={{ height: `${pct}%` }}
                />
              </div>
              <span className={`text-[11px] ${isToday ? 'font-semibold text-brand-700' : 'text-slate-500'}`}>
                {d.day}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
