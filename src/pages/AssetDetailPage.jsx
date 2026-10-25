import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Ban, BadgeCheck, LogIn, LogOut, Pencil, Trash2, Wrench } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import Modal from '../components/ui/Modal.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import { EVENT_STYLES } from '../components/dashboard/RecentActivity.jsx';
import AssetFormModal from '../components/forms/AssetFormModal.jsx';
import CheckOutForm from '../components/forms/CheckOutForm.jsx';
import CheckInForm from '../components/forms/CheckInForm.jsx';
import MaintenanceForm from '../components/forms/MaintenanceForm.jsx';
import RetireForm from '../components/forms/RetireForm.jsx';
import CompleteMaintenanceModal from '../components/forms/CompleteMaintenanceModal.jsx';
import { CATEGORIES, MAINTENANCE_KINDS } from '../lib/status.js';
import { fmtDate, fmtDateTime, fmtDuration } from '../lib/format.js';
import { canDelete, describeEvent } from '../services/rules.js';
import { navigate } from '../router/hashRouter.js';

function Info({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children || '—'}</dd>
    </div>
  );
}

export default function AssetDetailPage({ tag }) {
  const { data, actions, getAsset, sectorName, can } = useData();
  const [modal, setModal] = useState(null);
  const asset = getAsset(tag);

  // O estado global guarda só os eventos recentes; o histórico completo deste ativo vem sob demanda
  // (e é buscado de novo quando o ativo muda, ex.: após um check-in).
  const [full, setFull] = useState(null);
  useEffect(() => {
    let alive = true;
    actions.eventsFor(tag).then((h) => alive && setFull(h)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [tag, asset, actions]);
  const history = useMemo(
    () => full ?? data.events.filter((e) => e.tag === tag).sort((a, b) => b.at.localeCompare(a.at)),
    [full, data.events, tag]
  );

  if (!asset) {
    return (
      <div className="card p-10 text-center text-sm text-slate-500">
        Ativo <strong>{tag}</strong> não encontrado.{' '}
        <a className="text-brand-600 underline" href="#/ativos">Voltar para a lista</a>
      </div>
    );
  }

  const close = () => setModal(null);
  const deletable = full !== null && canDelete(asset, full);
  const s = asset.status;

  return (
    <div className="space-y-4">
      <a href="#/ativos" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
        <ArrowLeft className="h-4 w-4" /> Voltar para ativos
      </a>

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-4">
          <div>
            <p className="font-mono text-sm font-semibold text-brand-700">{asset.tag}</p>
            <h2 className="text-xl font-semibold text-slate-800">{asset.name}</h2>
            <div className="mt-2"><StatusBadge status={s} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {s === 'available' && can('movement') && (
              <button className="btn btn-primary" onClick={() => setModal('checkout')}><LogOut className="h-4 w-4" /> Check-out</button>
            )}
            {s === 'available' && can('maintenance') && (
              <button className="btn btn-secondary" onClick={() => setModal('maintenance')}><Wrench className="h-4 w-4" /> Manutenção</button>
            )}
            {s === 'in_use' && can('movement') && (
              <button className="btn btn-primary" onClick={() => setModal('checkin')}><LogIn className="h-4 w-4" /> Check-in</button>
            )}
            {s === 'maintenance' && can('maintenance') && (
              <button className="btn btn-primary" onClick={() => setModal('complete')}><BadgeCheck className="h-4 w-4" /> Concluir</button>
            )}
            {(s === 'available' || s === 'maintenance') && can('maintenance') && (
              <button className="btn btn-secondary" onClick={() => setModal('retire')}><Ban className="h-4 w-4" /> Baixar</button>
            )}
            {can('asset.edit') && (
              <button className="btn btn-secondary" onClick={() => setModal('edit')}><Pencil className="h-4 w-4" /> Editar</button>
            )}
            {deletable && can('asset.delete') && (
              <button className="btn btn-secondary text-red-600" onClick={() => setModal('delete')}><Trash2 className="h-4 w-4" /> Excluir</button>
            )}
          </div>
        </div>

        {s === 'in_use' && asset.assignedTo && (
          <div className="border-b border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            Com <strong>{asset.assignedTo.user}</strong> em <strong>{sectorName(asset.assignedTo.sectorId)}</strong> desde{' '}
            {fmtDateTime(asset.assignedTo.since)} (há {fmtDuration(asset.assignedTo.since)}).
            {asset.assignedTo.note && <span className="text-sky-700"> Obs.: {asset.assignedTo.note}</span>}
          </div>
        )}
        {s === 'maintenance' && asset.maintenance && (
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {MAINTENANCE_KINDS[asset.maintenance.kind]} desde {fmtDateTime(asset.maintenance.since)} (há {fmtDuration(asset.maintenance.since)}):{' '}
            {asset.maintenance.reason}
          </div>
        )}
        {s === 'retired' && asset.retired && (
          <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-900">
            Baixado em {fmtDate(asset.retired.at)}: {asset.retired.reason}
          </div>
        )}

        <dl className="grid gap-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Categoria">{CATEGORIES[asset.category]}</Info>
          <Info label="Setor de origem">{sectorName(asset.sectorId)}</Info>
          <Info label="Nº de série">{asset.serial}</Info>
          <Info label="Cadastrado em">{fmtDate(asset.createdAt)}</Info>
          {asset.notes && (
            <div className="sm:col-span-2 lg:col-span-4">
              <Info label="Observações">{asset.notes}</Info>
            </div>
          )}
        </dl>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Histórico de movimentações</h2>
          <span className="text-xs text-slate-500">{history.length} {history.length === 1 ? 'registro' : 'registros'}</span>
        </div>
        <ul className="divide-y divide-slate-100">
          {history.map((e) => {
            const { icon: Icon, color } = EVENT_STYLES[e.type] ?? EVENT_STYLES.edited;
            return (
              <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${color}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-slate-700">{describeEvent(e, e.sectorId ? sectorName(e.sectorId) : '')}</p>
                  <p className="text-xs text-slate-500">
                    {fmtDateTime(e.at)}
                    {e.note ? ` · ${e.note}` : ''}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <Modal open={modal === 'checkout'} onClose={close} title={`Check-out — ${asset.tag}`}>
        <CheckOutForm initialTag={asset.tag} lockAsset onDone={close} />
      </Modal>
      <Modal open={modal === 'checkin'} onClose={close} title={`Check-in — ${asset.tag}`}>
        <CheckInForm initialTag={asset.tag} lockAsset onDone={close} />
      </Modal>
      <Modal open={modal === 'maintenance'} onClose={close} title={`Enviar ${asset.tag} para manutenção`}>
        <MaintenanceForm initialTag={asset.tag} lockAsset onDone={close} />
      </Modal>
      <Modal open={modal === 'retire'} onClose={close} title={`Baixar ${asset.tag}`}>
        <RetireForm asset={asset} onDone={close} />
      </Modal>
      {modal === 'complete' && <CompleteMaintenanceModal asset={asset} onClose={close} />}
      <AssetFormModal open={modal === 'edit'} asset={asset} onClose={close} />
      <ConfirmModal
        open={modal === 'delete'}
        title="Excluir ativo"
        message={`Excluir ${asset.tag} (${asset.name})? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        danger
        onClose={close}
        onConfirm={async () => {
          await actions.deleteAsset(asset.tag);
          navigate('/ativos');
        }}
      />
    </div>
  );
}
