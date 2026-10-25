import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from './ToastContext.jsx';
import { useAuth } from './AuthContext.jsx';
import { can as canRole } from '../lib/permissions.js';
import { computeStats } from '../services/stats.js';
import {
  EVENTS_WINDOW_DAYS,
  applyChange,
  lastEventId,
  mergeEvents,
  removeAsset,
  setSectors,
  upsertAsset,
} from '../services/patch.js';

export const DataContext = createContext(null);
const EMPTY = { sectors: [], assets: [], events: [] };

// `api` é o adaptador de dados (local ou Supabase), escolhido em main.jsx.
//
// Desempenho: depois do carregamento inicial o app NÃO baixa mais tudo a cada ação.
// Cada operação devolve o ativo alterado (aplicado direto no estado) e uma consulta
// pequena traz só os eventos novos; o tempo real aplica apenas a linha que mudou.
export function DataProvider({ children, api }) {
  const toast = useToast();
  const { role } = useAuth();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const dataRef = useRef(null); // sempre o estado mais recente (útil dentro de callbacks assíncronos)
  const statsCache = useRef({ data: null, stats: null });

  const commit = useCallback((updater) => {
    const next = updater(dataRef.current);
    dataRef.current = next;
    setData(next);
  }, []);

  // Recarga completa (só na abertura, em importações e quando o tempo real não sabe aplicar a mudança).
  const refresh = useCallback(async () => {
    const snap = await api.snapshot({ recentDays: EVENTS_WINDOW_DAYS });
    dataRef.current = snap;
    setData(snap);
  }, [api]);

  // Busca só os eventos criados depois do último que o app conhece.
  const pullEvents = useCallback(async () => {
    try {
      const since = lastEventId(dataRef.current);
      if (!since) return await refresh(); // sem eventos na janela: a recarga (limitada) é barata
      const fresh = await api.eventsAfter(since);
      commit((d) => mergeEvents(d, fresh));
    } catch {
      refresh().catch(() => {});
    }
  }, [api, commit, refresh]);

  useEffect(() => {
    refresh().catch((e) => setLoadError(e));
    let timer;
    const later = (fn) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn().catch(() => {}), 250);
    };
    const off = api.subscribe?.((change) => {
      if (!dataRef.current) return;
      const next = change ? applyChange(dataRef.current, change) : null;
      if (next) {
        dataRef.current = next;
        setData(next);
      } else if (change?.kind === 'sectors') {
        later(async () => {
          const sectors = await api.sectors();
          commit((d) => setSectors(d, sectors));
        });
      } else {
        later(refresh);
      }
    });
    return () => {
      clearTimeout(timer);
      off?.();
    };
  }, [api, refresh, commit]);

  const actions = useMemo(() => {
    // Executa a operação, aplica o resultado no estado e (opcionalmente) avisa o usuário.
    // Erros sobem para o formulário, que mostra a mensagem junto aos campos.
    const run = (fn, apply, message) => async (...args) => {
      const result = await fn(...args);
      await apply?.(result, ...args);
      if (message) toast.success(typeof message === 'function' ? message(result, ...args) : message);
      return result;
    };
    // Ativo devolvido pela operação entra no estado na hora; os eventos novos chegam logo depois.
    const asset = (a) => {
      commit((d) => upsertAsset(d, a));
      pullEvents();
    };
    // A lista de setores é pequena: aplica o resultado local e confirma a ordem em segundo plano.
    const syncSectors = () =>
      api.sectors().then((s) => commit((d) => setSectors(d, s))).catch(() => {});
    const reload = () => refresh();

    return {
      createAsset: run((i) => api.createAsset(i), asset, (a) => `Ativo ${a.tag} cadastrado.`),
      updateAsset: run((t, p) => api.updateAsset(t, p), asset, (a) => `Ativo ${a.tag} atualizado.`),
      deleteAsset: run((t) => api.deleteAsset(t), (_, t) => commit((d) => removeAsset(d, t)), (_, t) => `Ativo ${t} excluído.`),
      checkOut: run((t, p) => api.checkOut(t, p), asset, (a) => `Retirada de ${a.tag} registrada.`),
      checkIn: run((t, p) => api.checkIn(t, p), asset, (a) =>
        a.status === 'maintenance' ? `${a.tag} devolvido e enviado para manutenção.` : `Devolução de ${a.tag} registrada.`
      ),
      sendToMaintenance: run((t, p) => api.sendToMaintenance(t, p), asset, (a) => `${a.tag} enviado para ${a.maintenance.kind === 'sterilization' ? 'esterilização' : 'manutenção'}.`),
      completeMaintenance: run((t, p) => api.completeMaintenance(t, p), asset, (a) => `${a.tag} liberado: disponível.`),
      retire: run((t, p) => api.retire(t, p), asset, (a) => `${a.tag} baixado.`),
      createSector: run(
        (n) => api.createSector(n),
        (s) => {
          commit((d) => setSectors(d, [...d.sectors, s]));
          syncSectors();
        },
        (s) => `Setor "${s.name}" criado.`
      ),
      deleteSector: run(
        (id) => api.deleteSector(id),
        (_, id) => commit((d) => setSectors(d, d.sectors.filter((s) => s.id !== id))),
        'Setor excluído.'
      ),
      importData: run((d) => api.importData(d), reload, 'Backup importado.'),
      resetDemo: run(() => api.resetDemo(), reload, 'Dados de demonstração restaurados.'),
      clearAll: run(() => api.clearAll(), reload, 'Todos os ativos foram apagados.'),
      exportData: () => api.exportData(),
      // Consultas sob demanda (o estado só guarda os eventos recentes)
      eventsFor: (tag) => api.eventsFor(tag),
      allEvents: () => api.allEvents(),
      countEvents: () => api.countEvents(),
    };
  }, [api, commit, pullEvents, refresh, toast]);

  const can = useCallback((action) => canRole(role, action), [role]);

  const value = useMemo(() => {
    const d = data ?? EMPTY;
    const sectorMap = new Map(d.sectors.map((s) => [s.id, s.name]));
    const assetMap = new Map(d.assets.map((a) => [a.tag, a]));
    return {
      data: d,
      actions,
      mode: api.mode,
      persistent: api.persistent,
      capabilities: api.capabilities ?? {},
      role,
      can,
      sectorName: (id) => sectorMap.get(id) ?? '—',
      getAsset: (tag) => assetMap.get(tag) ?? null,
      // Estatísticas calculadas uma única vez por versão dos dados e compartilhadas entre as páginas.
      getStats: () => {
        const c = statsCache.current;
        if (c.data !== d) {
          c.stats = computeStats({ assets: d.assets, events: d.events, sectors: d.sectors });
          c.data = d;
        }
        return c.stats;
      },
    };
  }, [data, actions, api, role, can]);

  if (loadError) {
    return (
      <div className="p-6 text-sm text-red-700">
        Não foi possível carregar os dados: {String(loadError.message || loadError)}
      </div>
    );
  }
  if (!data) return <div className="p-6 text-sm text-slate-500">Carregando…</div>;
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);
