// Adaptador Supabase: mesma API do localAdapter, mas os dados ficam no banco.
// Recebe o `client` do supabase-js (injetado, para poder ser testado com um falso).
import { ValidationError, normalizeAssetInput } from './rules.js';
import { slugify } from '../lib/format.js';
import { ASSET_COLUMNS, EVENT_COLUMNS, assetToInsert, rowToAsset, rowToEvent, toValidationError } from './supabaseMapping.js';

const DB_VERSION = 1;
const PAGE = 1000; // limite padrão do PostgREST por requisição

export function createSupabaseAdapter(client, { now = () => new Date() } = {}) {
  // Executa uma consulta e converte falhas em ValidationError.
  async function run(query) {
    const { data, error } = await query;
    if (error) throw toValidationError(error);
    return data;
  }

  // Lê todas as linhas, em páginas (o PostgREST devolve no máximo 1000 por requisição).
  // `build` recebe a consulta (já com select) e acrescenta filtros; a ordenação vem depois.
  async function fetchAll(table, columns, orderBy, build = (q) => q) {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const query = build(client.from(table).select(columns));
      const part = await run(query.order(orderBy).range(from, from + PAGE - 1));
      rows.push(...part);
      if (part.length < PAGE) return rows;
    }
  }

  const fetchSectors = async () =>
    (await fetchAll('sectors', 'id,name', 'name')).map((s) => ({ id: s.id, name: s.name }));

  // `recentDays`: carrega só os eventos desse período — o histórico completo de um ativo
  // sai por eventsFor() e o de exportação por allEvents(). A tabela de eventos só cresce,
  // então este é o ganho principal de carregamento.
  async function snapshot({ recentDays } = {}) {
    const since = recentDays ? new Date(new Date(now()).getTime() - recentDays * 86400000).toISOString() : null;
    const [sectors, assets, events] = await Promise.all([
      fetchSectors(),
      fetchAll('assets', ASSET_COLUMNS, 'tag'),
      fetchAll('events', EVENT_COLUMNS, 'id', since ? (q) => q.gte('at', since) : undefined),
    ]);
    return { sectors, assets: assets.map(rowToAsset), events: events.map(rowToEvent) };
  }

  const rpc = async (fn, args) => rowToAsset(await run(client.rpc(fn, args)));
  const text = (v) => String(v ?? '');

  const unavailable = () => {
    throw new ValidationError('Esta operação não está disponível no modo online. Use o painel do Supabase.');
  };

  return {
    mode: 'supabase',
    persistent: true,
    // Operações em massa só existem no modo local
    capabilities: { demo: false, import: false },
    snapshot,

    // ---- Ativos ----
    async createAsset(input) {
      // Só os setores (poucos) são consultados. Patrimônio repetido é recusado pelo próprio banco
      // (chave primária) e traduzido para o campo do formulário — não precisa baixar todas as tags.
      const sectors = await run(client.from('sectors').select('id'));
      const value = normalizeAssetInput(input, { sectors, assets: [], isNew: true });
      return rowToAsset(await run(client.from('assets').insert(assetToInsert(value)).select().single()));
    },

    async updateAsset(tag, patch) {
      const sectors = await run(client.from('sectors').select('id'));
      const value = normalizeAssetInput({ ...patch }, { sectors, assets: [], isNew: false, currentTag: tag });
      const { tag: _t, ...cols } = assetToInsert(value);
      const rows = await run(client.from('assets').update(cols).eq('tag', tag).select());
      if (!rows.length) throw new ValidationError(`Não foi possível atualizar ${tag}: ativo inexistente ou sem permissão.`);
      return rowToAsset(rows[0]);
    },

    async deleteAsset(tag) {
      const rows = await run(client.from('assets').delete().eq('tag', tag).select('tag'));
      if (!rows.length) {
        throw new ValidationError(
          'Não foi possível excluir: o ativo tem movimentações registradas, está em uso ou você não tem permissão. Use "Baixar" para tirá-lo de circulação.'
        );
      }
    },

    // ---- Movimentações (funções atômicas do banco) ----
    checkOut: (tag, p) => rpc('checkout_asset', { p_tag: tag, p_user: text(p.user), p_sector: p.sectorId ?? '', p_note: text(p.note) }),
    checkIn: (tag, p) => rpc('checkin_asset', { p_tag: tag, p_condition: p.condition ?? 'ok', p_note: text(p.note) }),
    sendToMaintenance: (tag, p) => rpc('send_to_maintenance', { p_tag: tag, p_kind: p.kind, p_reason: text(p.reason) }),
    completeMaintenance: (tag, p = {}) => rpc('complete_maintenance', { p_tag: tag, p_note: text(p.note) }),
    retire: (tag, p) => rpc('retire_asset', { p_tag: tag, p_reason: text(p.reason) }),

    // ---- Consultas leves (evitam recarregar tudo) ----
    sectors: fetchSectors,

    // Histórico completo de um ativo (mais recente primeiro).
    async eventsFor(tag) {
      const rows = await fetchAll('events', EVENT_COLUMNS, 'id', (q) => q.eq('tag', tag));
      return rows.map(rowToEvent).sort((a, b) => b.at.localeCompare(a.at));
    },

    // Só os eventos novos depois de `id` (1 consulta pequena após cada ação).
    async eventsAfter(id) {
      return (await fetchAll('events', EVENT_COLUMNS, 'id', (q) => q.gt('id', id))).map(rowToEvent);
    },

    async allEvents() {
      return (await fetchAll('events', EVENT_COLUMNS, 'id')).map(rowToEvent);
    },

    async countEvents() {
      const { count, error } = await client.from('events').select('id', { count: 'exact', head: true });
      if (error) throw toValidationError(error);
      return count ?? 0;
    },

    // ---- Setores ----
    async createSector(name) {
      const clean = text(name).trim().replace(/\s+/g, ' ');
      if (clean.length < 2) throw new ValidationError('Informe o nome do setor.', { name: 'Informe o nome do setor.' });
      const existing = await run(client.from('sectors').select('id'));
      const ids = new Set(existing.map((s) => s.id));
      let id = slugify(clean);
      for (let n = 2; ids.has(id); n++) id = `${slugify(clean)}-${n}`;
      const row = await run(client.from('sectors').insert({ id, name: clean }).select().single());
      return { id: row.id, name: row.name };
    },

    async deleteSector(id) {
      const rows = await run(client.from('sectors').delete().eq('id', id).select('id'));
      if (!rows.length) throw new ValidationError('Não foi possível excluir o setor (inexistente ou sem permissão).');
    },

    // ---- Backup / operações em massa ----
    async exportData() {
      const { sectors, assets, events } = await snapshot();
      return { app: 'patrimonio-hospitalar', version: DB_VERSION, exportedAt: new Date(now()).toISOString(), sectors, assets, events };
    },
    importData: unavailable, // migração: scripts/backup-to-sql.mjs
    resetDemo: unavailable,
    clearAll: unavailable,

    // Tempo real (requer a publicação habilitada — veja o fim do schema.sql).
    // Cada mudança chega já descrita ({ kind: 'asset' | 'asset-removed' | 'event' }) e o app
    // aplica só ela; mudanças de setor chegam sem detalhes e o app recarrega os setores.
    subscribe(cb) {
      const onAsset = (p) =>
        cb(p.eventType === 'DELETE' ? { kind: 'asset-removed', tag: p.old?.tag } : { kind: 'asset', asset: rowToAsset(p.new) });
      const onEvent = (p) => {
        if (p.eventType === 'INSERT') cb({ kind: 'event', event: rowToEvent(p.new) });
      };
      const ch = client
        .channel('patrimonio-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'assets' }, onAsset)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, onEvent)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sectors' }, () => cb({ kind: 'sectors' }))
        .subscribe();
      return () => client.removeChannel(ch);
    },

    // ---- Autenticação ----
    auth: {
      async getSession() {
        const { data, error } = await client.auth.getSession();
        if (error) throw toValidationError(error);
        return data.session ?? null;
      },
      async signIn(email, password) {
        const { data, error } = await client.auth.signInWithPassword({ email: text(email).trim(), password: text(password) });
        if (error) {
          throw new ValidationError(
            /invalid|credentials/i.test(error.message) ? 'E-mail ou senha incorretos.' : toValidationError(error).message
          );
        }
        return data.session;
      },
      async signOut() {
        await client.auth.signOut();
      },
      onChange(cb) {
        const { data } = client.auth.onAuthStateChange((_event, session) => cb(session));
        return () => data.subscription.unsubscribe();
      },
      async getProfile(userId) {
        const row = await run(client.from('profiles').select('full_name, role').eq('id', userId).maybeSingle());
        return { fullName: row?.full_name ?? '', role: row?.role ?? 'consulta' };
      },
    },
  };
}
