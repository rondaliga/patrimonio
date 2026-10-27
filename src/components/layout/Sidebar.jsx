import {
  LayoutDashboard,
  Boxes,
  MapPin,
  ArrowLeftRight,
  Wrench,
  ClipboardList,
  Settings,
  UserCog,
  HeartPulse,
  X,
} from 'lucide-react';

import pkg from '../../../package.json';

export const NAV = [
  { to: '/', label: 'Painel', icon: LayoutDashboard },
  { to: '/ativos', label: 'Ativos', icon: Boxes },
  { to: '/setores', label: 'Setores e Alas', icon: MapPin },
  { to: '/movimentacao', label: 'Retirada / Devolução', icon: ArrowLeftRight },
  { to: '/manutencao', label: 'Manutenção', icon: Wrench, badge: 'maintenance' },
  { to: '/relatorios', label: 'Relatórios', icon: ClipboardList },
  { to: '/usuarios', label: 'Usuários', icon: UserCog, adminOnly: true },
  { to: '/config', label: 'Configurações', icon: Settings },
];

const isActive = (path, to) => (to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`));

export default function Sidebar({ path, open, onClose, counts, showUsers = false }) {
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/50 md:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col bg-brand-900 text-slate-200 transition-transform md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Navegação principal"
      >
        <div className="flex items-center gap-2 px-5 py-4 text-white">
          <HeartPulse className="h-6 w-6 text-brand-100" />
          <div className="flex-1 leading-tight">
            <p className="text-sm font-semibold">Liga Contra o Câncer</p>
            <p className="text-[11px] text-brand-100/70">Gestão de ativos</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-300 hover:bg-white/10 md:hidden" aria-label="Fechar menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="mt-2 flex-1 space-y-0.5 overflow-y-auto px-2">
          {NAV.filter((n) => !n.adminOnly || showUsers).map(({ to, label, icon: Icon, badge }) => {
            const active = isActive(path, to);
            const count = badge ? counts?.[badge] : 0;
            return (
              <a
                key={to}
                href={`#${to}`}
                onClick={onClose}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                  active ? 'bg-white/10 font-medium text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{label}</span>
                {count > 0 && (
                  <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950">{count}</span>
                )}
              </a>
            );
          })}
        </nav>
        <p className="px-5 py-3 text-[11px] text-slate-400">v{pkg.version}</p>
      </aside>
    </>
  );
}
