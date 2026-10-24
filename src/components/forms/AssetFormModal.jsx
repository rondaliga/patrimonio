import { useEffect, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import { Field, FormError, inputClass } from '../ui/Field.jsx';
import { useData } from '../../context/DataContext.jsx';
import { CATEGORIES, MODELS } from '../../lib/status.js';
import { nextTag } from '../../services/rules.js';

// asset = null -> cadastro; asset = {...} -> edição (patrimônio não muda).
export default function AssetFormModal({ open, asset, onClose, onSaved }) {
  const { data, actions } = useData();
  const editing = !!asset;

  const blank = () => ({ tag: '', name: '', category: 'wheelchair', serial: '', sectorId: data.sectors[0]?.id ?? '', notes: '' });
  const [form, setForm] = useState(blank);
  const [tagTouched, setTagTouched] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  // Reinicia o formulário sempre que o modal abre.
  useEffect(() => {
    if (!open) return;
    const start = asset ? { ...asset } : blank();
    if (!asset) start.tag = nextTag(start.category, data.assets);
    setForm(start);
    setTagTouched(false);
    setErrors({});
    setFormError('');
  }, [open, asset?.tag]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const changeCategory = (category) => {
    setForm((f) => ({ ...f, category, tag: !editing && !tagTouched ? nextTag(category, data.assets) : f.tag }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setFormError('');
    setBusy(true);
    try {
      const saved = editing ? await actions.updateAsset(asset.tag, form) : await actions.createAsset(form);
      onClose();
      onSaved?.(saved);
    } catch (err) {
      setErrors(err.fields || {});
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Editar ${asset.tag}` : 'Novo ativo'}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Categoria" htmlFor="af-category" error={errors.category}>
            <select id="af-category" className={inputClass(errors.category)} value={form.category} onChange={(e) => changeCategory(e.target.value)}>
              {Object.entries(CATEGORIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Nº de patrimônio" htmlFor="af-tag" error={errors.tag} hint={editing ? 'O patrimônio não pode ser alterado.' : 'Sugerido automaticamente; pode editar.'}>
            <input
              id="af-tag"
              className={`${inputClass(errors.tag)} font-mono uppercase`}
              value={form.tag}
              disabled={editing}
              onChange={(e) => {
                setTagTouched(true);
                set('tag', e.target.value.toUpperCase());
              }}
              autoComplete="off"
            />
          </Field>
        </div>
        <Field label="Nome / modelo" htmlFor="af-name" error={errors.name}>
          <input
            id="af-name"
            className={inputClass(errors.name)}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            list="af-models"
            placeholder={MODELS[form.category]?.[0]}
            autoComplete="off"
            autoFocus
          />
          <datalist id="af-models">
            {(MODELS[form.category] || []).map((m) => <option key={m} value={m} />)}
          </datalist>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Setor de origem" htmlFor="af-sector" error={errors.sectorId}>
            <select id="af-sector" className={inputClass(errors.sectorId)} value={form.sectorId} onChange={(e) => set('sectorId', e.target.value)}>
              <option value="">Selecione…</option>
              {data.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Nº de série (opcional)" htmlFor="af-serial">
            <input id="af-serial" className="input" value={form.serial} onChange={(e) => set('serial', e.target.value)} autoComplete="off" />
          </Field>
        </div>
        <Field label="Observações (opcional)" htmlFor="af-notes">
          <textarea id="af-notes" rows={2} className="input" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <FormError message={formError && !Object.keys(errors).length ? formError : ''} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{editing ? 'Salvar alterações' : 'Cadastrar ativo'}</button>
        </div>
      </form>
    </Modal>
  );
}
