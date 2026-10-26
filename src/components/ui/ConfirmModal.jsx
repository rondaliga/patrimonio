import { useState } from 'react';
import Modal from './Modal.jsx';

export default function ConfirmModal({ open, title, message, confirmLabel = 'Confirmar', danger = false, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handle = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e.message || 'Não foi possível concluir.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={title} onClose={onClose} size="sm">
      <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
      {error && <p className="mt-3 rounded bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300" role="alert">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={handle} disabled={busy}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
