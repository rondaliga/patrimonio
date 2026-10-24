import { useEffect, useMemo, useState } from 'react';
import { LogOut } from 'lucide-react';
import { useData } from '../../context/DataContext.jsx';
import { Field, FormError, inputClass } from '../ui/Field.jsx';
import AssetPicker, { AssetSummary, resolveAsset } from './AssetPicker.jsx';
import { STATUS } from '../../lib/status.js';

export default function CheckOutForm({ initialTag = '', lockAsset = false, onDone }) {
  const { data, actions } = useData();
  const available = useMemo(() => data.assets.filter((a) => a.status === 'available'), [data.assets]);
  const recentUsers = useMemo(() => {
    const seen = new Set();
    for (const e of [...data.events].reverse()) {
      if (e.type === 'checkout' && e.user) seen.add(e.user);
      if (seen.size >= 40) break;
    }
    return [...seen];
  }, [data.events]);

  const [tag, setTag] = useState(initialTag);
  const [user, setUser] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const found = resolveAsset(data.assets, tag);
  const asset = found && found.status === 'available' ? found : null;

  // Ao escolher o ativo, sugere o setor de origem como destino.
  useEffect(() => {
    if (asset) setSectorId(asset.sectorId);
  }, [asset?.tag]); // eslint-disable-line react-hooks/exhaustive-deps

  const tagError =
    errors.tag ||
    (tag.trim() && !found ? 'Patrimônio não encontrado. Escolha um item da lista.' : '') ||
    (found && !asset ? `${found.tag} não está disponível (${STATUS[found.status].label}).` : '');

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
      await actions.checkOut(asset.tag, { user, sectorId, note });
      setTag('');
      setUser('');
      setSectorId('');
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
        id="co-asset"
        label="Ativo (disponível)"
        assets={available}
        value={tag}
        onChange={setTag}
        error={tagError}
        autoFocus={!lockAsset}
        disabled={lockAsset}
      />
      <AssetSummary asset={found} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Responsável pela retirada" htmlFor="co-user" error={errors.user}>
          <input
            id="co-user"
            className={inputClass(errors.user)}
            value={user}
            onChange={(e) => setUser(e.target.value)}
            list="co-users"
            placeholder="Nome de quem retira"
            autoComplete="off"
          />
          <datalist id="co-users">
            {recentUsers.map((u) => <option key={u} value={u} />)}
          </datalist>
        </Field>
        <Field label="Setor de destino" htmlFor="co-sector" error={errors.sectorId}>
          <select id="co-sector" className={inputClass(errors.sectorId)} value={sectorId} onChange={(e) => setSectorId(e.target.value)}>
            <option value="">Selecione…</option>
            {data.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Observação (opcional)" htmlFor="co-note">
        <textarea id="co-note" rows={2} className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: plantão noturno" />
      </Field>
      <FormError message={formError && !Object.keys(errors).length ? formError : ''} />
      <button type="submit" className="btn btn-primary mt-auto w-full" disabled={busy}>
        <LogOut className="h-4 w-4" />
        Registrar check-out
      </button>
    </form>
  );
}
