// Atualizações incrementais do estado em memória (funções puras e imutáveis).
// Em vez de baixar tudo de novo a cada ação, o app aplica só o que mudou:
// o ativo devolvido pela operação, os eventos novos e as mudanças vindas do tempo real.

const byTag = (a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0);

// Quantos dias de eventos o app mantém carregados (dashboard e relatórios usam 7 e 30 dias;
// o histórico completo de um ativo é buscado sob demanda).
export const EVENTS_WINDOW_DAYS = 60;

export function lastEventId(data) {
  let max = 0;
  for (const e of data.events) if (e.id > max) max = e.id;
  return max;
}

export function upsertAsset(data, asset) {
  const i = data.assets.findIndex((a) => a.tag === asset.tag);
  if (i >= 0) {
    const assets = data.assets.slice();
    assets[i] = asset;
    return { ...data, assets };
  }
  const assets = [...data.assets, asset].sort(byTag);
  return { ...data, assets };
}

// Excluir o ativo também remove o histórico dele (cascata no banco).
export function removeAsset(data, tag) {
  return {
    ...data,
    assets: data.assets.filter((a) => a.tag !== tag),
    events: data.events.filter((e) => e.tag !== tag),
  };
}

// Acrescenta eventos que ainda não existem (por id), mantendo a ordem crescente de id.
export function mergeEvents(data, incoming) {
  if (!incoming?.length) return data;
  const known = new Set(data.events.map((e) => e.id));
  const fresh = incoming.filter((e) => !known.has(e.id));
  if (!fresh.length) return data;
  const events = [...data.events, ...fresh].sort((a, b) => a.id - b.id);
  return { ...data, events };
}

export function removeEvent(data, id) {
  if (!data.events.some((e) => e.id === id)) return data;
  return { ...data, events: data.events.filter((e) => e.id !== id) };
}

// Setores são poucos: a lista inteira vem do adaptador (já na ordem certa) e só substitui a anterior.
export const setSectors = (data, sectors) => ({ ...data, sectors });

// Aplica uma mudança descrita pelo adaptador (tempo real). Devolve `null` quando
// não dá para aplicar de forma incremental (ex.: setores) e o chamador deve recarregar.
export function applyChange(data, change) {
  switch (change?.kind) {
    case 'asset':
      return upsertAsset(data, change.asset);
    case 'asset-removed':
      return removeAsset(data, change.tag);
    case 'event':
      return mergeEvents(data, [change.event]);
    case 'event-removed':
      return removeEvent(data, change.id);
    default:
      return null;
  }
}
