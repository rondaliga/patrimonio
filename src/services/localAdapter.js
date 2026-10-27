// Adaptador "local": implementa a API de dados em cima do localStorage.
// Um adaptador Supabase/REST futuro deve expor exatamente os mesmos métodos
// (todos assíncronos) — o restante do app não precisa mudar.
import { STATUS } from '../lib/status.js';
import { slugify as slug } from '../lib/format.js';
import { buildSeed } from './seed.js';
import { dayRange, fold } from '../lib/format.js';
import { actorSearchText } from '../lib/audit.js';
import { createStorage } from './storage.js';
import {
  ValidationError,
  applyCheckIn,
  applyCheckOut,
  applyCompleteMaintenance,
  applyRetire,
  applySendToMaintenance,
  canDelete,
  normalizeAssetInput,
} from './rules.js';

const DB_VERSION = 1;

const isDb = (db) =>
  db &&
  db.version === DB_VERSION &&
  Array.isArray(db.sectors) &&
  Array.isArray(db.assets) &&
  Array.isArray(db.events);

export function createLocalAdapter({ storage = createStorage(), now = () => new Date(), seed = buildSeed } = {}) {
  const stamp = () => new Date(now()).toISOString();

  function fresh(data) {
    const events = data.events.map((e, i) => ({ id: i + 1, ...e }));
    return { version: DB_VERSION, sectors: data.sectors, assets: data.assets, events, seq: events.length };
  }

  // Cópia em memória do banco: evita reler e interpretar o JSON inteiro do localStorage a
  // cada operação. É descartada quando outra aba grava (evento `storage`) ou quando algo falha.
  let cache = null;

  function read() {
    if (cache) return cache;
    let db = storage.load();
    if (!isDb(db)) {
      db = fresh(seed(now()));
      storage.save(db);
    }
    cache = db;
    return db;
  }

  // Lê, aplica a mudança e grava. Se `fn` lançar erro, nada é gravado e a cópia em
  // memória é descartada (pode ter sido alterada pela metade).
  async function mutate(fn) {
    const db = read();
    try {
      const result = fn(db);
      storage.save(db);
      return result;
    } catch (e) {
      cache = null;
      throw e;
    }
  }

  const addEvents = (db, events) => {
    for (const e of events) db.events.push({ id: ++db.seq, ...e });
  };

  const findAsset = (db, tag) => {
    const i = db.assets.findIndex((a) => a.tag === tag);
    if (i < 0) throw new ValidationError(`Ativo ${tag} não encontrado.`);
    return i;
  };

  function applyMovement(tag, fn) {
    return mutate((db) => {
      const i = findAsset(db, tag);
      const { asset, events } = fn(db.assets[i], db);
      db.assets[i] = asset;
      addEvents(db, events);
      return asset;
    });
  }

  return {
    mode: 'local',
    capabilities: { demo: true, import: true },
    persistent: storage.persistent,

    // `recentDays`: devolve só os eventos desse período (o histórico completo sai por eventsFor/allEvents).
    // Os arrays são cópias rasas: o estado do React nunca compartilha array com a cópia interna.
    async snapshot({ recentDays } = {}) {
      const { sectors, assets, events } = read();
      let list = events;
      if (recentDays) {
        const since = new Date(new Date(now()).getTime() - recentDays * 86400000).toISOString();
        list = events.filter((e) => e.at >= since);
      }
      return { sectors: [...sectors], assets: [...assets], events: list === events ? [...events] : list };
    },

    async sectors() {
      return [...read().sectors];
    },

    // Histórico completo de um ativo (mais recente primeiro).
    async eventsFor(tag) {
      return read().events.filter((e) => e.tag === tag).sort((a, b) => b.at.localeCompare(a.at));
    },

    // Eventos com id maior que `id` (usado para buscar só o que acabou de acontecer).
    async eventsAfter(id) {
      return read().events.filter((e) => e.id > id);
    },

    // Mesmo contrato do adaptador Supabase: retiradas/devoluções filtradas por responsável e período.
    async searchMovements({ q = '', from = '', to = '', limit = 50, offset = 0 } = {}) {
      const { start, end } = dayRange(from, to);
      const term = fold(q).trim();
      return read()
        .events.filter((e) => e.type === 'checkout' || e.type === 'checkin')
        .filter((e) => (!start || e.at >= start) && (!end || e.at <= end))
        .filter((e) => !term || fold(actorSearchText(e)).includes(term))
        .sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id)
        .slice(offset, offset + limit);
    },

    async allEvents() {
      return [...read().events];
    },

    async countEvents() {
      return read().events.length;
    },

    // ---- Ativos ----
    createAsset(input) {
      return mutate((db) => {
        const value = normalizeAssetInput(input, { sectors: db.sectors, assets: db.assets, isNew: true });
        const at = stamp();
        const asset = { ...value, status: 'available', assignedTo: null, maintenance: null, retired: null, createdAt: at };
        db.assets.push(asset);
        addEvents(db, [{ tag: asset.tag, type: 'created', at }]);
        return asset;
      });
    },

    updateAsset(tag, patch) {
      return mutate((db) => {
        const i = findAsset(db, tag);
        const current = db.assets[i];
        const value = normalizeAssetInput(
          { ...current, ...patch },
          { sectors: db.sectors, assets: db.assets, isNew: false, currentTag: tag }
        );
        const changed = ['name', 'category', 'serial', 'sectorId', 'notes'].some((k) => value[k] !== current[k]);
        if (!changed) return current;
        const next = { ...current, ...value, tag };
        db.assets[i] = next;
        addEvents(db, [{ tag, type: 'edited', at: stamp() }]);
        return next;
      });
    },

    deleteAsset(tag) {
      return mutate((db) => {
        const i = findAsset(db, tag);
        if (!canDelete(db.assets[i], db.events)) {
          throw new ValidationError('Este ativo já tem movimentações registradas. Use "Baixar" para tirá-lo de circulação.');
        }
        db.assets.splice(i, 1);
        db.events = db.events.filter((e) => e.tag !== tag);
      });
    },

    // ---- Movimentações ----
    checkOut: (tag, p) => applyMovement(tag, (a, db) => applyCheckOut(a, { ...p, at: stamp() }, db.sectors)),
    checkIn: (tag, p) => applyMovement(tag, (a) => applyCheckIn(a, { ...p, at: stamp() })),
    sendToMaintenance: (tag, p) => applyMovement(tag, (a) => applySendToMaintenance(a, { ...p, at: stamp() })),
    completeMaintenance: (tag, p = {}) => applyMovement(tag, (a) => applyCompleteMaintenance(a, { ...p, at: stamp() })),
    retire: (tag, p) => applyMovement(tag, (a) => applyRetire(a, { ...p, at: stamp() })),

    // ---- Setores ----
    createSector(name) {
      return mutate((db) => {
        const clean = String(name ?? '').trim().replace(/\s+/g, ' ');
        if (clean.length < 2) throw new ValidationError('Informe o nome do setor.', { name: 'Informe o nome do setor.' });
        if (db.sectors.some((s) => slug(s.name) === slug(clean))) {
          throw new ValidationError('Já existe um setor com este nome.', { name: 'Já existe um setor com este nome.' });
        }
        let id = slug(clean);
        for (let n = 2; db.sectors.some((s) => s.id === id); n++) id = `${slug(clean)}-${n}`;
        const sector = { id, name: clean };
        db.sectors.push(sector);
        return sector;
      });
    },

    deleteSector(id) {
      return mutate((db) => {
        const used = db.assets.some((a) => a.sectorId === id || a.assignedTo?.sectorId === id);
        if (used) throw new ValidationError('Este setor possui ativos vinculados. Mova os ativos antes de excluí-lo.');
        db.sectors = db.sectors.filter((s) => s.id !== id);
      });
    },

    // ---- Backup ----
    async exportData() {
      const { sectors, assets, events } = read();
      return { app: 'patrimonio-hospitalar', version: DB_VERSION, exportedAt: stamp(), sectors, assets, events };
    },

    importData(raw) {
      return mutate((db) => {
        const bad = (m) => {
          throw new ValidationError(`Arquivo inválido: ${m}`);
        };
        if (!raw || typeof raw !== 'object') bad('não é um backup do sistema.');
        const { sectors, assets, events } = raw;
        if (![sectors, assets, events].every(Array.isArray)) bad('faltam as listas de setores, ativos ou eventos.');
        const sectorIds = new Set();
        for (const s of sectors) {
          if (!s || typeof s.id !== 'string' || typeof s.name !== 'string') bad('setor mal formado.');
          sectorIds.add(s.id);
        }
        const tags = new Set();
        for (const a of assets) {
          if (!a || typeof a.tag !== 'string' || typeof a.name !== 'string') bad('ativo mal formado.');
          if (tags.has(a.tag)) bad(`patrimônio duplicado (${a.tag}).`);
          tags.add(a.tag);
          if (!STATUS[a.status]) bad(`status desconhecido em ${a.tag}.`);
          if (!sectorIds.has(a.sectorId)) bad(`setor inexistente em ${a.tag}.`);
          if (a.status === 'in_use' && !a.assignedTo) bad(`${a.tag} está em uso sem responsável.`);
        }
        for (const e of events) {
          if (!e || typeof e.tag !== 'string' || typeof e.type !== 'string' || typeof e.at !== 'string') bad('evento mal formado.');
        }
        const next = fresh({
          sectors: sectors.map((s) => ({ id: s.id, name: s.name })),
          assets,
          events: [...events].sort((a, b) => a.at.localeCompare(b.at)).map((e) => { const { id: _id, ...rest } = e; return rest; }),
        });
        Object.assign(db, next);
      });
    },

    // Exclui UM registro do histórico (o ativo e sua situação atual não mudam).
    deleteEvent(id) {
      return mutate((db) => {
        const i = db.events.findIndex((e) => e.id === id);
        if (i < 0) throw new ValidationError('Registro não encontrado (talvez já tenha sido excluído).');
        db.events.splice(i, 1);
      });
    },

    resetDemo() {
      return mutate((db) => Object.assign(db, fresh(seed(now()))));
    },

    clearAll() {
      return mutate((db) => {
        db.assets = [];
        db.events = [];
        db.seq = 0;
      });
    },

    // Sincroniza abas abertas: avisa quando outra aba grava no localStorage.
    subscribe(cb) {
      if (typeof window === 'undefined') return () => {};
      const onStorage = (e) => {
        if (e.key === storage.key || e.key === null) {
          cache = null; // outra aba gravou: a cópia em memória ficou velha
          cb(); // sem detalhes da mudança => o app recarrega tudo
        }
      };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    },
  };
}
