import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { DataProvider } from './context/DataContext.jsx';
import { loadApi } from './services/index.js';
import { preloadRoute } from './router/routes.js';
import './index.css';

// Se algo quebrar em tempo de execução, mostra o erro na tela
// em vez de deixar a página em branco.
class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Erro ao carregar a aplicação</h1>
          <pre style={{ marginTop: 12, whiteSpace: 'pre-wrap', color: '#b91c1c' }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// Lança o erro durante a renderização para o ErrorBoundary mostrá-lo.
function Boom({ error }) {
  throw error;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
const mount = (children) =>
  root.render(
    <React.StrictMode>
      <ErrorBoundary>{children}</ErrorBoundary>
    </React.StrictMode>
  );

// Em paralelo: baixa o JS da tela atual e o adaptador de dados (local ou Supabase).
preloadRoute(window.location.hash);
loadApi()
  .then((api) =>
    mount(
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider api={api}>
            <DataProvider api={api}>
              <App />
            </DataProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    )
  )
  .catch((error) => mount(<Boom error={error} />));

// Service worker: visitas seguintes abrem sem esperar a rede (só em produção e em HTTPS/localhost).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI)).catch(() => {});
  });
}
