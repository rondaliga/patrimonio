// Adaptador Supabase: mesma API do localAdapter, mas os dados ficam no banco.
// Recebe o `client` do supabase-js (injetado, para poder ser testado com um falso).
import { ValidationError, normalizeAssetInput } from './rules.js';
import { slugify } from '../lib/format.js';
import { assetToInsert, rowToAsset, rowToEvent, toValidationError } from './supabaseMapping.js';

const DB_VERSION = 1;
const PAGE = 1000; // limite padrão do PostgREST por requisição

export function createSupabaseAdapter(client, { now = () => new Date() } = {}) {
  // Executa uma consulta e converte falhas em ValidationError.
  async function run(query) {
    const { data, error } = await query;
    if (error) throw toValidationError(error);
    return data;
  }

  // Lê todas as linhas, em páginas (eventos podem passar de 1000).
  async function fetchAll(table, orderBy) {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const part = await run(client.from(table).select('*').order(orderBy).range(from, from + PAGE - 1));
      rows.push(...part);
      if (part.length < PAGE) return rows;
    }
  }

  async function snapshot() {
    const [sectors, assets, events] = await Promise.all([
      fetchAll('sectors', 'name'),
      fetchAll('assets', 'tag'),
      fetchAll('events', 'id'),
    ]);
    return {
      sectors: sectors.map((s) => ({ id: s.id, name: s.name })),
      assets: assets.map(rowToAsset),
      events: events.map(rowToEvent),
    };
  }

  const rpc = async (fn, args) => rowToAsset(await run(client.rpc(fn, args)));
  const text = (v) => String(v ?? '');

  const unavailable = () => {
    throw new ValidationError('Esta operação não está disponível no modo online. Use o painel do Supabase.');
  };

  let timer = null;
  return {
    mode: 'supabase',
    persistent: true,
    // Operações em massa só existem no modo local
    capabilities: { demo: false, import: false },
    snapshot,

    // ---- Ativos ----
    async createAsset(input) {
      const [sectors, tags] = await Promise.all([
        run(client.from('sectors').select('id')),
        run(client.from('assets').select('tag')),
      ]);
      const value = normalizeAssetInput(input, {
        sectors,
        assets: tags,
        isNew: true,
      });
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

    // Tempo real (requer a publicação habilitada — veja o fim do schema.sql)
    subscribe(cb) {
      const fire = () => {
        clearTimeout(timer);
        timer = setTimeout(cb, 250);
      };
      const ch = client
        .channel('patrimonio-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'assets' }, fire)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, fire)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sectors' }, fire)
        .subscribe();
      return () => {
        clearTimeout(timer);
        client.removeChannel(ch);
      };
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
