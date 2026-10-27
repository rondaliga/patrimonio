import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import PasswordInput from './PasswordInput.jsx';
import { Field, FormError } from './Field.jsx';
import { validatePassword } from '../../lib/accounts.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';

// "Alterar minha senha": vale para qualquer perfil e pede a senha atual.
// `forced`: troca obrigatória do primeiro acesso (senha temporária) — modal bloqueante, sem cancelar;
// a única saída além de trocar a senha é "Sair".
export default function ChangePasswordModal({ open, onClose = () => {}, forced = false }) {
  const { changePassword, signOut } = useAuth();
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
      toast.success(forced ? 'Senha definida. Bem-vindo(a)!' : 'Senha alterada.');
      onClose();
    } catch (err) {
      setErrors(err.fields && Object.keys(err.fields).length ? err.fields : { form: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={forced ? 'Defina a sua nova senha' : 'Alterar minha senha'} onClose={onClose} size="sm" dismissible={!forced}>
      <form onSubmit={submit} noValidate className="space-y-3">
        {forced && (
          <p className="rounded bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            Este é o seu primeiro acesso (ou a sua senha foi redefinida pelo administrador). Por segurança, escolha uma senha só sua para continuar.
          </p>
        )}
        <Field label={forced ? 'Senha temporária (a que você recebeu)' : 'Senha atual'} htmlFor="pw-current" error={errors.current}>
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
          {forced ? (
            <button type="button" className="btn btn-secondary" onClick={signOut} disabled={busy}>Sair</button>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy}>Salvar senha</button>
        </div>
      </form>
    </Modal>
  );
}
