// Service worker: acelera as visitas seguintes e permite abrir o app com a rede instável.
//  - Arquivos de /assets/ (nomes com hash, nunca mudam de conteúdo): cache primeiro.
//  - Página inicial (index.html): rede primeiro, cache só se a rede falhar — assim uma nova
//    publicação aparece na hora, e offline o app ainda abre.
//  - Tudo que não é do mesmo domínio (Supabase, fontes) passa direto, sem interferência.
const CACHE = 'patrimonio-v1';
const MAX_ASSETS = 80;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const req of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(req);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) {
          await cache.put(req, res.clone());
          await trim(cache);
        }
        return res;
      })()
    );
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(req);
          if (res.ok) await cache.put(req, res.clone());
          return res;
        } catch (err) {
          const hit = (await cache.match(req)) || (await cache.match(self.registration.scope));
          if (hit) return hit;
          throw err;
        }
      })()
    );
  }
});
