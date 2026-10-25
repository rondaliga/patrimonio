// Páginas carregadas sob demanda (code splitting). Cada import() vira um arquivo JS separado,
// então o primeiro carregamento baixa só o que a tela atual precisa.
export const loaders = {
  dashboard: () => import('../pages/Dashboard.jsx'),
  assets: () => import('../pages/AssetsPage.jsx'),
  detail: () => import('../pages/AssetDetailPage.jsx'),
  sectors: () => import('../pages/SectorsPage.jsx'),
  movement: () => import('../pages/MovementPage.jsx'),
  maintenance: () => import('../pages/MaintenancePage.jsx'),
  reports: () => import('../pages/ReportsPage.jsx'),
  settings: () => import('../pages/SettingsPage.jsx'),
};

const BY_PATH = {
  '/': 'dashboard',
  '/ativos': 'assets',
  '/setores': 'sectors',
  '/movimentacao': 'movement',
  '/manutencao': 'maintenance',
  '/relatorios': 'reports',
  '/config': 'settings',
};

export function routeKey(path) {
  if (/^\/ativos\/[^/]+$/.test(path)) return 'detail';
  return BY_PATH[path] ?? null;
}

// Começa a baixar o JS da tela atual em paralelo com o resto da inicialização
// (sem isso, o chunk da página só seria pedido depois que o app inteiro subisse).
export function preloadRoute(hash = '') {
  const raw = String(hash).replace(/^#/, '') || '/';
  const p = raw.split('?')[0];
  const path = (p.startsWith('/') ? p : `/${p}`).replace(/(.)\/+$/, '$1');
  const key = routeKey(path);
  if (key) loaders[key]().catch(() => {});
}

// Depois que a tela inicial apareceu, aproveita o tempo ocioso para baixar as demais:
// a navegação entre páginas passa a ser instantânea.
export function preloadAllWhenIdle() {
  const run = () => Object.values(loaders).forEach((load) => load().catch(() => {}));
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 2000);
}
