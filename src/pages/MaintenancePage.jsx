import { useMemo, useState } from 'react';
import { BadgeCheck, Droplets, Wrench } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import MaintenanceForm from '../components/forms/MaintenanceForm.jsx';
import CompleteMaintenanceModal from '../components/forms/CompleteMaintenanceModal.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { MAINTENANCE_KINDS } from '../lib/status.js';
import { fmtDateTime, fmtDuration } from '../lib/format.js';

export default function MaintenancePage({ query }) {
  const { data, getAsset, sectorName, can } = useData();
  const canManage = can('maintenance');
  const [completing, setCompleting] = useState(null);
  const preset = query.tag ? getAsset(query.tag.toUpperCase()) : null;

  const list = useMemo(
    () =>
      data.assets
        .filter((a) => a.status === 'maintenance' && a.maintenance)
        .sort((a, b) => a.maintenance.since.localeCompare(b.maintenance.since)),
    [data.assets]
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Em manutenção / esterilização</h2>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{list.length}</span>
        </div>
        {list.length === 0 ? (
          <EmptyState title="Nenhum ativo em manutenção" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-dense w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th>Patrimônio</th>
                  <th>Ativo</th>
                  <th className="hidden md:table-cell">Tipo</th>
                  <th className="hidden md:table-cell">Motivo</th>
                  <th className="hidden md:table-cell">Desde</th>
                  <th><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((a) => {
                  const Icon = a.maintenance.kind === 'sterilization' ? Droplets : Wrench;
                  return (
                    <tr key={a.tag} className="hover:bg-slate-50">
                      <td>
                        <a href={`#/ativos/${encodeURIComponent(a.tag)}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">
                          {a.tag}
                        </a>
                      </td>
                      <td>
                        {a.name}
                        <span className="block text-[11px] text-slate-500">{sectorName(a.sectorId)}</span>
                        {/* No celular, tipo, motivo e tempo parado aparecem sob o nome (as colunas ficam ocultas) */}
                        <span className="mt-1 block text-xs text-amber-700 md:hidden">
                          <Icon className="mr-1 inline h-3 w-3" />
                          {MAINTENANCE_KINDS[a.maintenance.kind]} · {a.maintenance.reason}
                        </span>
                        <span className="block text-[11px] text-slate-500 md:hidden">há {fmtDuration(a.maintenance.since)}</span>
                      </td>
                      <td className="hidden md:table-cell">
                        <span className="inline-flex items-center gap-1 whitespace-nowrap text-amber-700">
                          <Icon className="h-3.5 w-3.5" /> {MAINTENANCE_KINDS[a.maintenance.kind]}
                        </span>
                      </td>
                      <td className="hidden md:table-cell">{a.maintenance.reason}</td>
                      <td className="hidden whitespace-nowrap text-slate-500 md:table-cell">
                        {fmtDateTime(a.maintenance.since)}
                        <span className="block text-[11px] text-slate-500">há {fmtDuration(a.maintenance.since)}</span>
                      </td>
                      <td className="text-right">
                        {canManage && (
                          <button className="btn btn-secondary btn-sm" onClick={() => setCompleting(a)} aria-label={`Concluir ${a.tag}`}>
                            <BadgeCheck className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Concluir</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManage && <section className="card h-fit">
        <div className="card-header">
          <h2 className="card-title">Enviar ativo</h2>
        </div>
        <div className="p-4">
          <MaintenanceForm key={query.tag || ''} initialTag={preset?.status === 'available' ? preset.tag : ''} />
        </div>
      </section>}

      {completing && <CompleteMaintenanceModal asset={completing} onClose={() => setCompleting(null)} />}
    </div>
  );
}
