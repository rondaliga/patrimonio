// Card de métrica no estilo "caixas coloridas" do Snipe-IT. Com `href`, vira um atalho clicável.
const TONES = {
  slate: 'bg-slate-700',
  green: 'bg-emerald-500',
  blue: 'bg-sky-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
};

export default function MetricCard({ label, value, hint, icon: Icon, tone = 'slate', href }) {
  const Wrapper = href ? 'a' : 'div';
  return (
    <Wrapper
      href={href}
      className={`card flex items-stretch overflow-hidden ${href ? 'transition hover:shadow-md' : ''}`}
    >
      <div className={`flex w-16 items-center justify-center text-white ${TONES[tone]}`}>
        <Icon className="h-7 w-7" />
      </div>
      <div className="flex-1 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
    </Wrapper>
  );
}
