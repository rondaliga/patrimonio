import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import ConfirmModal from './ConfirmModal.jsx';
import { useData } from '../../context/DataContext.jsx';

// Botão para excluir UM registro do histórico (atividade recente, movimentações, histórico do ativo).
// Aparece só para quem tem permissão (administrador). Só o registro é apagado:
// o ativo e a situação atual dele não mudam.
export default function DeleteEventButton({ id, label, onDeleted }) {
  const { actions, can } = useData();
  const [open, setOpen] = useState(false);
  if (!can('event.delete')) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded p-1.5 text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500"
        aria-label={`Excluir registro: ${label}`}
        title="Excluir este registro"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <ConfirmModal
        open={open}
        title="Excluir registro"
        message={`Excluir este registro do histórico (${label})? Só o registro é apagado: a situação atual do ativo não muda. Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        danger
        onClose={() => setOpen(false)}
        onConfirm={async () => {
          await actions.deleteEvent(id);
          onDeleted?.(id);
        }}
      />
    </>
  );
}
