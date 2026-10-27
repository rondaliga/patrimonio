import { UserRound } from 'lucide-react';

// Etiqueta de autoria: "Retirada registrada por maria.souza". Não renderiza nada sem autoria
// (eventos antigos, anteriores à v1.6.0, e o modo local não sabem quem registrou).
export default function ActorBadge({ text, className = '' }) {
  if (!text) return null;
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 ${className}`}
      title="Quem registrou esta ação no sistema"
    >
      <UserRound className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{text}</span>
    </span>
  );
}
