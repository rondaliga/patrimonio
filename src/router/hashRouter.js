// Roteador mínimo baseado em location.hash (#/ativos?status=in_use).
// Funciona no GitHub Pages sem nenhuma configuração de servidor.
import { useMemo, useSyncExternalStore } from 'react';

function subscribe(cb) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}
const getHash = () => window.location.hash;

export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#/, '') || '/';
  const [p, q = ''] = raw.split('?');
  const path = (p.startsWith('/') ? p : `/${p}`).replace(/(.)\/+$/, '$1');
  return { path, query: Object.fromEntries(new URLSearchParams(q)) };
}

// buildQuery({ q: 'rádio', status: '' }) -> "q=r%C3%A1dio" (ignora vazios)
export function buildQuery(obj) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== '' && v != null) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function navigate(to, { replace = false } = {}) {
  const target = `#${to.startsWith('/') ? to : `/${to}`}`;
  if (replace) window.location.replace(target);
  else window.location.hash = target;
}

export function useHashRoute() {
  const hash = useSyncExternalStore(subscribe, getHash, () => '');
  return useMemo(() => parseHash(hash), [hash]);
}
