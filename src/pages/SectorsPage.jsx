import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import { Field, inputClass } from '../components/ui/Field.jsx';
import { computeStats } from '../services/stats.js';
import { STATUS, STATUS_ORDER } from '../lib/status.js';

export default function SectorsPage() {
  const { data, actions, can } = useData();
  const canManage = can('sector.manage');
  const stats = useMemo(() => computeStats({ assets: data.assets, events: data.events, sectors: data.sectors }), [data]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const add = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await actions.createSector(name);
      setName('');
    } catch (err) {
      setError(err.fields?.name || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Setores e alas</h2>
          <span className="text-xs text-slate-400">{data.sectors.length} setores</span>
        </div>
        <div className="overflow-x-auto">
          <table className="table-dense w-full">
            <thead className="bg-slate-50">
              <tr>
                <th>Setor</th>
                <th className="text-right">Total</th>
                {STATUS_ORDER.map((s) => (
                  <th key={s} className="text-right">{STATUS[s].label.split(' /')[0]}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.bySector.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td>
                    <a href={`#/ativos?setor=${encodeURIComponent(row.id)}`} className="font-medium text-brand-700 hover:underline">
                      {row.sector}
                    </a>
                  </td>
                  <td className="text-right font-semibold">{row.total}</td>
                  {STATUS_ORDER.map((s) => (
                    <td key={s} className="text-right text-slate-600">{row.byStatus[s]}</td>
                  ))}
                  <td className="text-right">
                    {canManage && <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setToDelete(row)}
                      disabled={row.total > 0}
                      title={row.total > 0 ? 'Mova os ativos antes de excluir' : 'Excluir setor'}
                      aria-label={`Excluir ${row.sector}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canManage && <form onSubmit={add} className="card p-4" noValidate>
        <h2 className="card-title mb-3">Novo setor</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Nome do setor ou ala" htmlFor="sector-name" error={error}>
              <input
                id="sector-name"
                className={inputClass(error)}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Hemodiálise, Maternidade, Almoxarifado…"
                autoComplete="off"
              />
            </Field>
          </div>
          <button className="btn btn-primary" disabled={busy}>
            <Plus className="h-4 w-4" /> Adicionar
          </button>
        </div>
      </form>}

      <ConfirmModal
        open={!!toDelete}
        title="Excluir setor"
        message={`Excluir o setor "${toDelete?.sector}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        danger
        onClose={() => setToDelete(null)}
        onConfirm={() => actions.deleteSector(toDelete.id)}
      />
    </div>
  );
}
