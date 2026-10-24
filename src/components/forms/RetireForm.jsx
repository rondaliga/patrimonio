import { useState } from 'react';
import { Ban } from 'lucide-react';
import { useData } from '../../context/DataContext.jsx';
import { Field, FormError, inputClass } from '../ui/Field.jsx';
import { AssetSummary } from './AssetPicker.jsx';

export default function RetireForm({ asset, onDone }) {
  const { actions } = useData();
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setFormError('');
    setBusy(true);
    try {
      await actions.retire(asset.tag, { reason });
      onDone?.();
    } catch (err) {
      setErrors(err.fields || {});
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <AssetSummary asset={asset} />
      <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
        A baixa é definitiva: o ativo sai de circulação e não poderá mais ser retirado.
      </p>
      <Field label="Motivo da baixa" htmlFor="rt-reason" error={errors.reason}>
        <textarea
          id="rt-reason"
          rows={2}
          autoFocus
          className={inputClass(errors.reason)}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex.: fim de vida útil, dano irreparável…"
        />
      </Field>
      <FormError message={formError && !Object.keys(errors).length ? formError : ''} />
      <button type="submit" className="btn btn-danger w-full" disabled={busy}>
        <Ban className="h-4 w-4" />
        Confirmar baixa
      </button>
    </form>
  );
}
