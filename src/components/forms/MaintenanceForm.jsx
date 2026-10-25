import { useMemo, useState } from 'react';
import { Wrench } from 'lucide-react';
import { useData } from '../../context/DataContext.jsx';
import { Field, FormError, inputClass } from '../ui/Field.jsx';
import AssetPicker, { AssetSummary, resolveAsset } from './AssetPicker.jsx';
import { MAINTENANCE_KINDS, STATUS } from '../../lib/status.js';

export default function MaintenanceForm({ initialTag = '', lockAsset = false, onDone }) {
  const { data, actions } = useData();
  const available = useMemo(() => data.assets.filter((a) => a.status === 'available'), [data.assets]);

  const [tag, setTag] = useState(initialTag);
  const [kind, setKind] = useState('maintenance');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const found = resolveAsset(data.assets, tag);
  const asset = found && found.status === 'available' ? found : null;

  const tagError =
    errors.tag ||
    (tag.trim() && !found ? 'Patrimônio não encontrado. Escolha um item da lista.' : '') ||
    (found && !asset
      ? `${found.tag} está "${STATUS[found.status].label}"${found.status === 'in_use' ? ' — faça o check-in antes' : ''}.`
      : '');

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setFormError('');
    if (!asset) {
      setErrors({ tag: 'Escolha um ativo disponível.' });
      return;
    }
    setBusy(true);
    try {
      await actions.sendToMaintenance(asset.tag, { kind, reason });
      setTag('');
      setReason('');
      onDone?.();
    } catch (err) {
      setErrors(err.fields || {});
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-3" noValidate>
      <AssetPicker
        id="mt-asset"
        label="Ativo (disponível)"
        assets={available}
        value={tag}
        onChange={setTag}
        error={tagError}
        disabled={lockAsset}
      />
      <AssetSummary asset={found} />
      <Field label="Tipo" htmlFor="mt-kind" error={errors.kind}>
        <select id="mt-kind" className={inputClass(errors.kind)} value={kind} onChange={(e) => setKind(e.target.value)}>
          {Object.entries(MAINTENANCE_KINDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <Field label="Motivo" htmlFor="mt-reason" error={errors.reason}>
        <textarea
          id="mt-reason"
          rows={2}
          className={inputClass(errors.reason)}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex.: calibração preventiva, bateria não segura carga…"
        />
      </Field>
      <FormError message={formError && !Object.keys(errors).length ? formError : ''} />
      <button type="submit" className="btn btn-primary mt-auto w-full" disabled={busy}>
        <Wrench className="h-4 w-4" />
        Enviar para {kind === 'sterilization' ? 'esterilização' : 'manutenção'}
      </button>
    </form>
  );
}
