import { useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import Modal from '../ui/Modal.jsx';
import { FormError } from '../ui/Field.jsx';
import { AssetSummary } from './AssetPicker.jsx';
import { useData } from '../../context/DataContext.jsx';

export default function CompleteMaintenanceModal({ asset, onClose }) {
  const { actions } = useData();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await actions.completeMaintenance(asset.tag, { note });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const isSteril = asset?.maintenance?.kind === 'sterilization';
  return (
    <Modal open={!!asset} onClose={onClose} title={isSteril ? 'Concluir esterilização' : 'Concluir manutenção'} size="sm">
      {asset && (
        <form onSubmit={submit} className="space-y-3">
          <AssetSummary asset={asset} />
          <div>
            <label className="label" htmlFor="cm-note">Observação (opcional)</label>
            <textarea id="cm-note" rows={2} className="input" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          </div>
          <FormError message={error} />
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            <BadgeCheck className="h-4 w-4" />
            Concluir e liberar (disponível)
          </button>
        </form>
      )}
    </Modal>
  );
}
