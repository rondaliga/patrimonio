import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api as defaultApi } from '../services/index.js';
import { useToast } from './ToastContext.jsx';
import { useAuth } from './AuthContext.jsx';
import { can as canRole } from '../lib/permissions.js';

export const DataContext = createContext(null);
const EMPTY = { sectors: [], assets: [], events: [] };

export function DataProvider({ children, api = defaultApi }) {
  const toast = useToast();
  const { role } = useAuth();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const refresh = useCallback(async () => {
    setData(await api.snapshot());
  }, [api]);

  useEffect(() => {
    refresh().catch((e) => setLoadError(e));
    return api.subscribe?.(() => refresh().catch(() => {}));
  }, [api, refresh]);

  const actions = useMemo(() => {
    // Executa a operação, recarrega os dados e (opcionalmente) avisa o usuário.
    // Erros sobem para o formulário, que mostra a mensagem junto aos campos.
    const run = (fn, message) => async (...args) => {
      const result = await fn(...args);
      await refresh();
      if (message) toast.success(typeof message === 'function' ? message(result, ...args) : message);
      return result;
    };
    return {
      createAsset: run((i) => api.createAsset(i), (a) => `Ativo ${a.tag} cadastrado.`),
      updateAsset: run((t, p) => api.updateAsset(t, p), (a) => `Ativo ${a.tag} atualizado.`),
      deleteAsset: run((t) => api.deleteAsset(t), (_, t) => `Ativo ${t} excluído.`),
      checkOut: run((t, p) => api.checkOut(t, p), (a) => `Check-out de ${a.tag} registrado.`),
      checkIn: run((t, p) => api.checkIn(t, p), (a) =>
        a.status === 'maintenance' ? `${a.tag} devolvido e enviado para manutenção.` : `Check-in de ${a.tag} registrado.`
      ),
      sendToMaintenance: run((t, p) => api.sendToMaintenance(t, p), (a) => `${a.tag} enviado para ${a.maintenance.kind === 'sterilization' ? 'esterilização' : 'manutenção'}.`),
      completeMaintenance: run((t, p) => api.completeMaintenance(t, p), (a) => `${a.tag} liberado: disponível.`),
      retire: run((t, p) => api.retire(t, p), (a) => `${a.tag} baixado.`),
      createSector: run((n) => api.createSector(n), (s) => `Setor "${s.name}" criado.`),
      deleteSector: run((id) => api.deleteSector(id), 'Setor excluído.'),
      importData: run((d) => api.importData(d), 'Backup importado.'),
      resetDemo: run(() => api.resetDemo(), 'Dados de demonstração restaurados.'),
      clearAll: run(() => api.clearAll(), 'Todos os ativos foram apagados.'),
      exportData: () => api.exportData(),
    };
  }, [api, refresh, toast]);

  const value = useMemo(() => {
    const d = data ?? EMPTY;
    const sectorMap = new Map(d.sectors.map((s) => [s.id, s.name]));
    return {
      data: d,
      actions,
      mode: api.mode,
      persistent: api.persistent,
      capabilities: api.capabilities ?? {},
      role,
      can: (action) => canRole(role, action),
      sectorName: (id) => sectorMap.get(id) ?? '—',
      getAsset: (tag) => d.assets.find((a) => a.tag === tag) ?? null,
    };
  }, [data, actions, api, role]);

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
