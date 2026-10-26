import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import PasswordInput from './PasswordInput.jsx';
import { Field, FormError } from './Field.jsx';
import { validatePassword } from '../../lib/accounts.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';

// "Alterar minha senha": vale para qualquer perfil e pede a senha atual.
export default function ChangePasswordModal({ open, onClose }) {
  const { changePassword } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCurrent('');
      setNext('');
      setAgain('');
      setErrors({});
    }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!current) errs.current = 'Informe a senha atual.';
    const weak = validatePassword(next);
    if (weak) errs.password = weak;
    else if (next === current) errs.password = 'A nova senha deve ser diferente da atual.';
    if (!errs.password && next !== again) errs.again = 'As senhas não são iguais.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await changePassword(current, next);
      toast.success('Senha alterada.');
      onClose();
    } catch (err) {
      setErrors(err.fields && Object.keys(err.fields).length ? err.fields : { form: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title="Alterar minha senha" onClose={onClose} size="sm">
      <form onSubmit={submit} noValidate className="space-y-3">
        <Field label="Senha atual" htmlFor="pw-current" error={errors.current}>
          <PasswordInput id="pw-current" value={current} onChange={setCurrent} error={errors.current} autoComplete="current-password" autoFocus />
        </Field>
        <Field label="Nova senha" htmlFor="pw-new" error={errors.password} hint="Pelo menos 8 caracteres.">
          <PasswordInput id="pw-new" value={next} onChange={setNext} error={errors.password} />
        </Field>
        <Field label="Repita a nova senha" htmlFor="pw-again" error={errors.again}>
          <PasswordInput id="pw-again" value={again} onChange={setAgain} error={errors.again} />
        </Field>
        <FormError message={errors.form} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>Salvar senha</button>
        </div>
      </form>
    </Modal>
  );
}
