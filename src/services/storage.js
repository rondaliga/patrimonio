// Persistência em localStorage com fallback em memória (modo anônimo, bloqueio de
// cookies, testes). Guarda sempre texto JSON, então cada leitura devolve uma cópia nova.

export function createMemoryBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}

function browserBackend() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    const probe = '__patrimonio_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

export function createStorage(key = 'patrimonio-hospitalar:v1', customBackend) {
  const browser = customBackend ? null : browserBackend();
  const backend = customBackend || browser || createMemoryBackend();
  return {
    key,
    // false = os dados só vivem nesta aba (localStorage indisponível)
    persistent: !!browser,
    load() {
      try {
        const raw = backend.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    save(db) {
      backend.setItem(key, JSON.stringify(db));
    },
    clear() {
      backend.removeItem(key);
    },
  };
}
