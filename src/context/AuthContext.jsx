import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { HeartPulse } from 'lucide-react';
import { Field, FormError, inputClass } from '../components/ui/Field.jsx';

const AuthContext = createContext({ user: null, role: 'admin', fullName: '', signOut: null });

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
    if (!auth || !state?.session) return { user: null, role: 'admin', fullName: '', signOut: null };
    return {
      user: state.session.user,
      role: state.profile.role,
      fullName: state.profile.fullName,
      signOut: () => auth.signOut(),
    };
  }, [auth, state]);

  if (!auth) return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  if (state.loading) return <div className="p-6 text-sm text-slate-500">Carregando…</div>;
  if (!state.session) return <LoginScreen auth={auth} initialError={state.error} />;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function LoginScreen({ auth, initialError }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError || '');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) return setError('Informe e-mail e senha.');
    setBusy(true);
    try {
      await auth.signIn(email, password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} noValidate className="card w-full max-w-sm space-y-3 p-6">
        <div className="flex items-center gap-2 text-brand-700">
          <HeartPulse className="h-6 w-6" />
          <div className="leading-tight">
            <h1 className="text-base font-semibold">PatrimônioHosp</h1>
            <p className="text-xs text-slate-500">Entre para continuar</p>
          </div>
        </div>
        <Field label="E-mail" htmlFor="login-email">
          <input id="login-email" type="email" className={inputClass()} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus />
        </Field>
        <Field label="Senha" htmlFor="login-password">
          <input id="login-password" type="password" className={inputClass()} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        <FormError message={error} />
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>Entrar</button>
        <p className="text-xs text-slate-500">Contas são criadas pelo administrador do sistema.</p>
      </form>
    </div>
  );
}

export const useAuth = () => useContext(AuthContext);
