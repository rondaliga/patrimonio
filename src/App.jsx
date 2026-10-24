import { useEffect, useState } from 'react';
import Sidebar from './components/layout/Sidebar.jsx';
import Header from './components/layout/Header.jsx';
import Dashboard from './pages/Dashboard.jsx';
import AssetsPage from './pages/AssetsPage.jsx';
import AssetDetailPage from './pages/AssetDetailPage.jsx';
import SectorsPage from './pages/SectorsPage.jsx';
import MovementPage from './pages/MovementPage.jsx';
import MaintenancePage from './pages/MaintenancePage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import { useHashRoute } from './router/hashRouter.js';
import { useData } from './context/DataContext.jsx';

const TITLES = {
  '/': 'Dashboard',
  '/ativos': 'Ativos',
  '/setores': 'Setores e Alas',
  '/movimentacao': 'Check-in / Check-out',
  '/manutencao': 'Manutenção e Esterilização',
  '/relatorios': 'Relatórios',
  '/config': 'Configurações',
};

function resolve(path, query) {
  const detail = /^\/ativos\/([^/]+)$/.exec(path);
  if (detail) {
    const tag = decodeURIComponent(detail[1]);
    return { title: `Ativo ${tag}`, element: <AssetDetailPage key={tag} tag={tag} /> };
  }
  switch (path) {
    case '/':
      return { title: TITLES['/'], element: <Dashboard /> };
    case '/ativos':
      return { title: TITLES['/ativos'], element: <AssetsPage query={query} /> };
    case '/setores':
      return { title: TITLES['/setores'], element: <SectorsPage /> };
    case '/movimentacao':
      return { title: TITLES['/movimentacao'], element: <MovementPage key={query.tag || ''} query={query} /> };
    case '/manutencao':
      return { title: TITLES['/manutencao'], element: <MaintenancePage query={query} /> };
    case '/relatorios':
      return { title: TITLES['/relatorios'], element: <ReportsPage /> };
    case '/config':
      return { title: TITLES['/config'], element: <SettingsPage /> };
    default:
      return {
        title: 'Página não encontrada',
        element: (
          <div className="card p-10 text-center text-sm text-slate-500">
            Página não encontrada. <a className="text-brand-600 underline" href="#/">Voltar ao dashboard</a>
          </div>
        ),
      };
  }
}

export default function App() {
  const { path, query } = useHashRoute();
  const { data } = useData();
  const [menuOpen, setMenuOpen] = useState(false);

  // Ao trocar de página: fecha o menu mobile e volta ao topo.
  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, [path]);

  const { title, element } = resolve(path, query);
  const counts = { maintenance: data.assets.filter((a) => a.status === 'maintenance').length };

  return (
    <div className="flex min-h-screen">
      <Sidebar path={path} open={menuOpen} onClose={() => setMenuOpen(false)} counts={counts} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header title={title} onMenu={() => setMenuOpen(true)} searchValue={path === '/ativos' ? query.q : ''} />
        <main className="flex-1 p-4 sm:p-6">{element}</main>
      </div>
    </div>
  );
}
