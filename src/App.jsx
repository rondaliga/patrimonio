import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import Sidebar from './components/layout/Sidebar.jsx';
import Header from './components/layout/Header.jsx';
import { useHashRoute } from './router/hashRouter.js';
import { loaders, preloadAllWhenIdle } from './router/routes.js';
import { useData } from './context/DataContext.jsx';

// Cada página é um chunk separado, baixado só quando a rota é aberta (ou no tempo ocioso).
const Dashboard = lazy(loaders.dashboard);
const AssetsPage = lazy(loaders.assets);
const AssetDetailPage = lazy(loaders.detail);
const SectorsPage = lazy(loaders.sectors);
const MovementPage = lazy(loaders.movement);
const MaintenancePage = lazy(loaders.maintenance);
const ReportsPage = lazy(loaders.reports);
const SettingsPage = lazy(loaders.settings);

function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando página">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="card h-24 animate-pulse bg-slate-50" />)}
      </div>
      <div className="card h-64 animate-pulse bg-slate-50" />
    </div>
  );
}

const TITLES = {
  '/': 'Painel',
  '/ativos': 'Ativos',
  '/setores': 'Setores e Alas',
  '/movimentacao': 'Retirada / Devolução',
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
            Página não encontrada. <a className="text-brand-600 underline" href="#/">Voltar ao painel</a>
          </div>
        ),
      };
  }
}

export default function App() {
  const { path, query } = useHashRoute();
  const { data } = useData();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => preloadAllWhenIdle(), []);

  // Ao trocar de página: fecha o menu mobile e volta ao topo.
  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, [path]);

  const { title, element } = resolve(path, query);
  const counts = useMemo(
    () => ({ maintenance: data.assets.filter((a) => a.status === 'maintenance').length }),
    [data.assets]
  );

  return (
    <div className="flex min-h-screen">
      <Sidebar path={path} open={menuOpen} onClose={() => setMenuOpen(false)} counts={counts} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header title={title} onMenu={() => setMenuOpen(true)} hideSearch={path === '/ativos'} />
        <main className="flex-1 p-4 sm:p-6">
          <Suspense fallback={<PageSkeleton />}>{element}</Suspense>
        </main>
      </div>
    </div>
  );
}
