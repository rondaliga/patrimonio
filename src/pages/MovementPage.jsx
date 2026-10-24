import { useMemo } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import CheckOutForm from '../components/forms/CheckOutForm.jsx';
import CheckInForm from '../components/forms/CheckInForm.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { fmtDateTime } from '../lib/format.js';
import { describeEvent } from '../services/rules.js';

export default function MovementPage({ query }) {
  const { data, getAsset, sectorName, can } = useData();
  const preset = query.tag ? getAsset(query.tag.toUpperCase()) : null;

  const moves = useMemo(
    () =>
      data.events
        .filter((e) => e.type === 'checkout' || e.type === 'checkin')
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 15),
    [data.events]
  );

  const canMove = can('movement');

  return (
    <div className="space-y-4">
      {!canMove && (
        <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">Seu perfil é somente de consulta: não é possível registrar movimentações.</p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {canMove && <section className="card flex flex-col">
          <div className="card-header">
            <h2 className="card-title flex items-center gap-2"><LogOut className="h-4 w-4 text-sky-600" /> Check-out (retirada)</h2>
          </div>
          <div className="flex flex-1 flex-col p-4">
            <CheckOutForm initialTag={preset?.status === 'available' ? preset.tag : ''} />
          </div>
        </section>}
        {canMove && <section className="card flex flex-col">
          <div className="card-header">
            <h2 className="card-title flex items-center gap-2"><LogIn className="h-4 w-4 text-emerald-600" /> Check-in (devolução)</h2>
          </div>
          <div className="flex flex-1 flex-col p-4">
            <CheckInForm initialTag={preset?.status === 'in_use' ? preset.tag : ''} />
          </div>
        </section>}
      </div>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Últimas movimentações</h2>
        </div>
        {moves.length === 0 ? (
          <EmptyState title="Nenhuma movimentação registrada" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-dense w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th>Quando</th>
                  <th>Patrimônio</th>
                  <th>Ativo</th>
                  <th className="hidden md:table-cell">Movimento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {moves.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap text-slate-500">{fmtDateTime(e.at)}</td>
                    <td>
                      <a href={`#/ativos/${encodeURIComponent(e.tag)}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">
                        {e.tag}
                      </a>
                    </td>
                    <td>
                      {getAsset(e.tag)?.name ?? '—'}
                      <span className="block text-[11px] text-slate-400 md:hidden">{describeEvent(e, e.sectorId ? sectorName(e.sectorId) : '')}</span>
                    </td>
                    <td className="hidden md:table-cell">{describeEvent(e, e.sectorId ? sectorName(e.sectorId) : '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
