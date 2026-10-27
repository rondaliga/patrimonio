import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Pencil, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { fmtActive } from '../lib/format.js';
import { useData } from '../context/DataContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Modal from '../components/ui/Modal.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import PasswordInput from '../components/ui/PasswordInput.jsx';
import ChangePasswordModal from '../components/ui/ChangePasswordModal.jsx';
import { Field, FormError, inputClass } from '../components/ui/Field.jsx';
import { ROLES, ROLE_HINTS, ROLE_ORDER } from '../lib/permissions.js';
import { generatePassword, normalizeUsername, validatePassword, validateUsername } from '../lib/accounts.js';
import { plural } from '../lib/format.js';

const dateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const ROLE_BADGE = {
  admin: 'bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-sky-200',
  tecnico: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  enfermagem: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  consulta: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export default function UsersPage() {
  const { users, can, mode } = useData();
  const { userId } = useAuth();
  const toast = useToast();
  const [list, setList] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [modal, setModal] = useState(null); // { kind: 'create' | 'edit' | 'password' | 'delete' | 'mine', user? }

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setList(await users.list());
    } catch (e) {
      setLoadError(e.message);
    }
  }, [users]);

  useEffect(() => {
    if (users && can('user.manage')) load();
  }, [users, can, load]);

  if (!users) {
    return (
      <div className="card p-8 text-center text-sm text-slate-600 dark:text-slate-300">
        <p className="font-medium">Contas de usuário só existem no modo online (Supabase).</p>
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          Agora o app está em modo {mode === 'local' ? 'local, sem login' : mode}. Veja FASE-2-SUPABASE.md para ativar o login e a equipe.
        </p>
      </div>
    );
  }
  if (!can('user.manage')) {
    return <div className="card p-8 text-center text-sm text-slate-600 dark:text-slate-300">Somente administradores podem gerenciar usuários.</div>;
  }

  // Liga/desliga a conta (férias, licença…) sem apagar nada. Atualiza a linha na hora; reverte se o banco recusar.
  const toggleActive = async (u) => {
    const next = !u.isActive;
    setList((l) => l.map((x) => (x.id === u.id ? { ...x, isActive: next } : x)));
    try {
      await users.setActive(u.id, next);
      toast.success(`${u.fullName || u.username} ${next ? 'reativado(a)' : 'desativado(a): não consegue mais entrar, o histórico foi mantido'}.`);
    } catch (e) {
      setList((l) => l.map((x) => (x.id === u.id ? { ...x, isActive: u.isActive } : x)));
      toast.error(e.message);
    }
  };

  const close = () => setModal(null);
  const done = (message) => {
    toast.success(message);
    close();
    load();
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Usuários</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{list ? plural(list.length, 'conta', 'contas') : 'Carregando…'}</p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm" onClick={load} aria-label="Atualizar lista" title="Atualizar lista">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button className="btn btn-primary" onClick={() => setModal({ kind: 'create' })}>
              <UserPlus className="h-4 w-4" /> Novo usuário
            </button>
          </div>
        </div>
        {loadError && <div className="p-4"><FormError message={loadError} /></div>}
        {list && (
          <div className="overflow-x-auto">
            <table className="table-dense w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th>Nome</th>
                  <th>Usuário</th>
                  <th>Perfil</th>
                  <th>Situação</th>
                  <th className="hidden md:table-cell">Último acesso</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {list.map((u) => {
                  const me = u.id === userId;
                  return (
                    <tr key={u.id} className={u.isActive ? '' : 'bg-slate-50/70 dark:bg-slate-800/30 text-slate-500 dark:text-slate-400'}>
                      <td className="font-medium">
                        {u.fullName || '—'}
                        {u.mustChangePassword && <span className="ml-2 rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800 dark:text-amber-200" title="Ainda não trocou a senha temporária">Senha temporária</span>}
                        {me && <span className="ml-2 rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600 dark:text-slate-300">Você</span>}
                      </td>
                      <td className="font-mono text-xs">{u.username || '—'}</td>
                      <td>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[u.role] ?? ROLE_BADGE.consulta}`}>{ROLES[u.role] ?? u.role}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={u.isActive}
                          aria-label={`${u.isActive ? 'Desativar' : 'Reativar'} ${u.fullName || u.username}`}
                          title={me ? 'Você não pode desativar a sua própria conta' : u.isActive ? 'Desativar (a conta não é excluída)' : 'Reativar'}
                          disabled={me}
                          onClick={() => toggleActive(u)}
                          className={`inline-flex items-center gap-2 rounded-full text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          <span className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${u.isActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${u.isActive ? 'left-[1.125rem]' : 'left-0.5'}`} />
                          </span>
                          <span className={u.isActive ? 'text-emerald-700 dark:text-emerald-300' : ''}>{fmtActive(u.isActive)}</span>
                        </button>
                      </td>
                      <td className="hidden text-slate-600 dark:text-slate-300 md:table-cell">{dateTime(u.lastSignInAt)}</td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          <button className="btn btn-secondary btn-sm" onClick={() => setModal({ kind: 'edit', user: u })} aria-label={`Editar ${u.fullName || u.username}`} title="Editar nome e perfil">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setModal({ kind: me ? 'mine' : 'password', user: u })}
                            aria-label={`${me ? 'Alterar minha senha' : `Redefinir senha de ${u.fullName || u.username}`}`}
                            title={me ? 'Alterar minha senha' : 'Redefinir senha'}
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setModal({ kind: 'delete', user: u })}
                            disabled={me}
                            aria-label={`Excluir ${u.fullName || u.username}`}
                            title={me ? 'Você não pode excluir a sua própria conta' : 'Excluir usuário'}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-4 text-sm text-slate-600 dark:text-slate-300">
        <h3 className="card-title mb-2">Perfis de acesso</h3>
        <dl className="space-y-1.5">
          {ROLE_ORDER.map((r) => (
            <div key={r} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
              <dt className="w-28 shrink-0 font-medium">{ROLES[r]}</dt>
              <dd className="text-slate-500 dark:text-slate-400">{ROLE_HINTS[r]}</dd>
            </div>
          ))}
        </dl>
      </div>

      <UserFormModal
        open={modal?.kind === 'create' || modal?.kind === 'edit'}
        user={modal?.kind === 'edit' ? modal.user : null}
        isSelf={modal?.user?.id === userId}
        users={users}
        onClose={close}
        onDone={done}
      />
      <ResetPasswordModal open={modal?.kind === 'password'} user={modal?.user} users={users} onClose={close} onDone={done} />
      <ChangePasswordModal open={modal?.kind === 'mine'} onClose={close} />
      <ConfirmModal
        open={modal?.kind === 'delete'}
        title="Excluir usuário"
        message={`Excluir a conta de ${modal?.user?.fullName || modal?.user?.username}? A pessoa perde o acesso na hora. O histórico de movimentações permanece. Para um afastamento temporário (férias, licença), prefira desativar a conta.`}
        confirmLabel="Excluir"
        danger
        onClose={close}
        onConfirm={async () => {
          await users.remove(modal.user.id);
          toast.success('Usuário excluído.');
          load();
        }}
      />
    </div>
  );
}

function UserFormModal({ open, user, isSelf, users, onClose, onDone }) {
  const editing = !!user;
  const [f, setF] = useState({ username: '', fullName: '', role: 'consulta', password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(user ? { username: user.username, fullName: user.fullName, role: user.role, password: '' } : { username: '', fullName: '', role: 'consulta', password: '' });
  }, [open, user]);

  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (f.fullName.trim().length < 2) errs.fullName = 'Informe o nome completo.';
    if (!editing) {
      const u = validateUsername(f.username);
      if (u) errs.username = u;
      const p = validatePassword(f.password);
      if (p) errs.password = p;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      if (editing) {
        await users.update(user.id, { fullName: f.fullName, role: f.role });
        onDone('Usuário atualizado.');
      } else {
        await users.create({ username: normalizeUsername(f.username), fullName: f.fullName, role: f.role, password: f.password });
        onDone(`Usuário ${normalizeUsername(f.username)} criado.`);
      }
    } catch (err) {
      setErrors(err.fields && Object.keys(err.fields).length ? { ...err.fields } : { form: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={editing ? 'Editar usuário' : 'Novo usuário'} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-3">
        <Field label="Nome completo" htmlFor="u-name" error={errors.fullName}>
          <input id="u-name" className={inputClass(errors.fullName)} value={f.fullName} onChange={(e) => set('fullName')(e.target.value)} autoComplete="off" autoFocus />
        </Field>
        <Field
          label="Nome de usuário"
          htmlFor="u-username"
          error={errors.username}
          hint={editing ? 'O nome de usuário não pode ser alterado.' : 'É o que a pessoa digita para entrar. Ex.: maria.souza'}
        >
          <input
            id="u-username"
            className={inputClass(errors.username)}
            value={f.username}
            onChange={(e) => set('username')(e.target.value)}
            disabled={editing}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>
        <Field label="Perfil de acesso" htmlFor="u-role" error={errors.role} hint={ROLE_HINTS[f.role]}>
          <select id="u-role" className={inputClass(errors.role)} value={f.role} onChange={(e) => set('role')(e.target.value)} disabled={isSelf}>
            {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
          </select>
          {isSelf && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Você não pode tirar o seu próprio acesso de administrador.</p>}
        </Field>
        {!editing && (
          <Field label="Senha inicial" htmlFor="u-password" error={errors.password} hint="Pelo menos 8 caracteres. Passe a senha para a pessoa: no primeiro acesso o sistema obriga a trocá-la.">
            <div className="flex gap-2">
              <div className="flex-1"><PasswordInput id="u-password" value={f.password} onChange={set('password')} error={errors.password} /></div>
              <button type="button" className="btn btn-secondary" onClick={() => set('password')(generatePassword())}>Gerar</button>
            </div>
          </Field>
        )}
        <FormError message={errors.form} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{editing ? 'Salvar' : 'Criar usuário'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ open, user, users, onClose, onDone }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPassword('');
      setError('');
    }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    const bad = validatePassword(password);
    if (bad) return setError(bad);
    setBusy(true);
    setError('');
    try {
      await users.setPassword(user.id, password);
      onDone(`Senha de ${user.fullName || user.username} redefinida.`);
    } catch (err) {
      setError(err.fields?.password || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title="Redefinir senha" onClose={onClose} size="sm">
      <form onSubmit={submit} noValidate className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Nova senha para <strong>{user?.fullName || user?.username}</strong>. As sessões abertas dessa pessoa são encerradas e ela entra de novo com a senha nova — que será pedida para trocar no próximo acesso.
        </p>
        <Field label="Nova senha" htmlFor="rp-password" error={error} hint="Pelo menos 8 caracteres.">
          <div className="flex gap-2">
            <div className="flex-1"><PasswordInput id="rp-password" value={password} onChange={setPassword} error={error} autoFocus /></div>
            <button type="button" className="btn btn-secondary" onClick={() => setPassword(generatePassword())}>Gerar</button>
          </div>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>Redefinir senha</button>
        </div>
      </form>
    </Modal>
  );
}
