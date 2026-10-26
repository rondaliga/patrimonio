import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { HeartPulse } from 'lucide-react';
import { Field, FormError, inputClass } from '../components/ui/Field.jsx';
import PasswordInput from '../components/ui/PasswordInput.jsx';
import ThemeToggle from '../components/ui/ThemeToggle.jsx';
import { usernameFromEmail } from '../lib/accounts.js';

const AuthContext = createContext({ user: null, userId: null, role: 'admin', fullName: '', username: '', signOut: null, changePassword: null });

// Sem `api.auth` (modo local) o app abre direto, com todas as permissões.
// Com `api.auth` (Supabase) exige login e carrega o papel do usuário.
export function AuthProvider({ children, api }) {
  const auth = api.auth;
  const [state, setState] = useState(auth ? { loading: true, session: null, profile: null, error: '' } : null);

  // Usuário cujo perfil já foi pedido (ou está sendo). O Supabase avisa mudanças de sessão
  // também ao renovar o token e ao voltar para a aba, e a abertura dispara getSession + INITIAL_SESSION:
  // sem este controle o perfil seria buscado de novo (e a tela redesenhada) sem necessidade.
  const loadedUser = useRef(null);

  const load = useCallback(
    async (session) => {
      if (!session) {
        loadedUser.current = null;
        return setState({ loading: false, session: null, profile: null, error: '' });
      }
      if (loadedUser.current === session.user.id) return;
      loadedUser.current = session.user.id;
      try {
        const profile = await auth.getProfile(session.user.id);
        setState({ loading: false, session, profile, error: '' });
      } catch (e) {
        loadedUser.current = null;
        setState({ loading: false, session: null, profile: null, error: e.message });
        auth.signOut().catch(() => {});
      }
    },
    [auth]
  );

  useEffect(() => {
    if (!auth) return undefined;
    let alive = true;
    auth.getSession().then((s) => alive && load(s)).catch((e) => alive && setState({ loading: false, session: null, profile: null, error: e.message }));
    const off = auth.onChange((s) => alive && load(s));
    return () => {
      alive = false;
      off();
    };
  }, [auth, load]);

  const value = useMemo(() => {
    if (!auth || !state?.session) return { user: null, userId: null, role: 'admin', fullName: '', username: '', signOut: null, changePassword: null };
    return {
      user: state.session.user,
      userId: state.session.user.id,
      role: state.profile.role,
      fullName: state.profile.fullName,
      username: state.profile.username || usernameFromEmail(state.session.user.email),
      signOut: () => auth.signOut(),
      changePassword: (current, next) => auth.changePassword(current, next),
    };
  }, [auth, state]);

  if (!auth) return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  if (state.loading) return <div className="p-6 text-sm text-slate-500 dark:text-slate-400">Carregando…</div>;
  if (!state.session) return <LoginScreen auth={auth} initialError={state.error} />;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function LoginScreen({ auth, initialError }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError || '');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) return setError('Informe usuário e senha.');
    setBusy(true);
    try {
      await auth.signIn(username, password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="fixed right-4 top-4"><ThemeToggle /></div>
      <form onSubmit={submit} noValidate className="card w-full max-w-sm space-y-3 p-6">
        <div className="flex items-center gap-2 text-brand-700 dark:text-sky-300">
          <HeartPulse className="h-6 w-6" />
          <div className="leading-tight">
            <h1 className="text-base font-semibold">PatrimônioHosp</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Entre para continuar</p>
          </div>
        </div>
        <Field label="Usuário" htmlFor="login-username">
          <input
            id="login-username"
            type="text"
            className={inputClass()}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
          />
        </Field>
        <Field label="Senha" htmlFor="login-password">
          <PasswordInput id="login-password" value={password} onChange={setPassword} autoComplete="current-password" />
        </Field>
        <FormError message={error} />
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>Entrar</button>
        <p className="text-xs text-slate-500 dark:text-slate-400">Contas são criadas pelo administrador do sistema.</p>
      </form>
    </div>
  );
}

export const useAuth = () => useContext(AuthContext);
