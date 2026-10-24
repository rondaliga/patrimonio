import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { DataProvider } from './context/DataContext.jsx';
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <DataProvider>
            <App />
          </DataProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
