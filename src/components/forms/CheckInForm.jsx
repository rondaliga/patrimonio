import { useMemo, useState } from 'react';
import { LogIn } from 'lucide-react';
import { useData } from '../../context/DataContext.jsx';
import { Field, FormError } from '../ui/Field.jsx';
import AssetPicker, { AssetSummary, resolveAsset } from './AssetPicker.jsx';
import { CONDITIONS, STATUS } from '../../lib/status.js';

export default function CheckInForm({ initialTag = '', lockAsset = false, onDone }) {
  const { data, actions } = useData();
  const inUse = useMemo(() => data.assets.filter((a) => a.status === 'in_use'), [data.assets]);

  const [tag, setTag] = useState(initialTag);
  const [condition, setCondition] = useState('ok');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const found = resolveAsset(data.assets, tag);
  const asset = found && found.status === 'in_use' ? found : null;

  const tagError =
    errors.tag ||
    (tag.trim() && !found ? 'Patrimônio não encontrado. Escolha um item da lista.' : '') ||
    (found && !asset ? `${found.tag} não está em uso (${STATUS[found.status].label}).` : '');

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setFormError('');
    if (!asset) {
      setErrors({ tag: 'Escolha um ativo que esteja em uso.' });
      return;
    }
    setBusy(true);
    try {
      await actions.checkIn(asset.tag, { condition, note });
      setTag('');
      setCondition('ok');
      setNote('');
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
        id="ci-asset"
        label="Ativo (em uso)"
        assets={inUse}
        value={tag}
        onChange={setTag}
        error={tagError}
        disabled={lockAsset}
      />
      <AssetSummary asset={found} />
      <fieldset>
        <legend className="label">Condição na devolução</legend>
        <div className="space-y-1.5">
          {Object.entries(CONDITIONS).map(([value, text]) => (
            <label key={value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="ci-condition"
                value={value}
                checked={condition === value}
                onChange={() => setCondition(value)}
                className="h-4 w-4 accent-brand-600"
              />
              {text}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label={condition === 'ok' ? 'Observação (opcional)' : 'Descreva o problema / motivo'} htmlFor="ci-note">
        <textarea id="ci-note" rows={2} className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <FormError message={formError && !Object.keys(errors).length ? formError : ''} />
      <button type="submit" className="btn btn-primary mt-auto w-full" disabled={busy}>
        <LogIn className="h-4 w-4" />
        Registrar check-in
      </button>
    </form>
  );
}
