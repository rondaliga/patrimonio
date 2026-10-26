// Adaptador Supabase: mesma API do localAdapter, mas os dados ficam no banco.
// Recebe o `client` do supabase-js (injetado, para poder ser testado com um falso).
import { ValidationError, normalizeAssetInput } from './rules.js';
import { slugify } from '../lib/format.js';
import { loginEmail } from '../lib/accounts.js';
import { ASSET_COLUMNS, EVENT_COLUMNS, assetToInsert, rowToAsset, rowToEvent, rowToUser, toValidationError } from './supabaseMapping.js';

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
    capabilities: { demo: false, import: false, users: true },
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
    // Exclui UM registro do histórico. Só administradores: a função do banco confere o papel.
    async deleteEvent(id) {
      const n = Number(await run(client.rpc('delete_event', { p_id: id }))) || 0;
      if (!n) throw new ValidationError('Registro não encontrado (talvez já tenha sido excluído).');
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
        else if (p.eventType === 'DELETE' && p.old?.id != null) cb({ kind: 'event-removed', id: p.old.id });
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
      // `username` pode ser o nome de usuário (padrão) ou, em contas antigas, um e-mail.
      async signIn(username, password) {
        const { data, error } = await client.auth.signInWithPassword({ email: loginEmail(username), password: text(password) });
        if (error) {
          throw new ValidationError(
            /invalid|credentials/i.test(error.message) ? 'Usuário ou senha incorretos.' : toValidationError(error).message
          );
        }
        return data.session;
      },
      // O próprio usuário troca a senha: confere a senha atual antes (quem está no teclado é o dono da conta).
      async changePassword(currentPassword, newPassword) {
        const { data: sess } = await client.auth.getSession();
        const email = sess?.session?.user?.email;
        if (!email) throw new ValidationError('Sessão expirada. Entre novamente.');
        const check = await client.auth.signInWithPassword({ email, password: text(currentPassword) });
        if (check.error) {
          if (/invalid|credentials/i.test(check.error.message)) {
            throw new ValidationError('A senha atual está incorreta.', { current: 'A senha atual está incorreta.' });
          }
          throw toValidationError(check.error);
        }
        const { error } = await client.auth.updateUser({ password: text(newPassword) });
        if (error) {
          if (/different from the old/i.test(error.message)) {
            throw new ValidationError('A nova senha deve ser diferente da atual.', { password: 'A nova senha deve ser diferente da atual.' });
          }
          if (/at least|weak|short/i.test(error.message)) {
            throw new ValidationError('A nova senha é fraca ou curta demais. Use pelo menos 8 caracteres.', { password: 'A nova senha é fraca ou curta demais. Use pelo menos 8 caracteres.' });
          }
          throw toValidationError(error);
        }
      },
      async signOut() {
        await client.auth.signOut();
      },
      onChange(cb) {
        const { data } = client.auth.onAuthStateChange((_event, session) => cb(session));
        return () => data.subscription.unsubscribe();
      },
      async getProfile(userId) {
        const row = await run(client.from('profiles').select('full_name, role, username').eq('id', userId).maybeSingle());
        return { fullName: row?.full_name ?? '', role: row?.role ?? 'consulta', username: row?.username ?? '' };
      },
    },

    // ---- Gestão de usuários (só administrador; o banco confere o papel em cada função admin_*) ----
    users: {
      async list() {
        const rows = await run(client.rpc('admin_list_users'));
        return (rows ?? []).map(rowToUser);
      },
      async create({ username, fullName, role, password }) {
        const row = await run(
          client.rpc('admin_create_user', { p_username: text(username), p_full_name: text(fullName), p_role: role, p_password: text(password) })
        );
        return rowToUser(row);
      },
      async update(id, { fullName, role }) {
        return rowToUser(await run(client.rpc('admin_update_user', { p_id: id, p_full_name: text(fullName), p_role: role })));
      },
      async setPassword(id, password) {
        await run(client.rpc('admin_set_password', { p_id: id, p_password: text(password) }));
      },
      async remove(id) {
        await run(client.rpc('admin_delete_user', { p_id: id }));
      },
    },
  };
}
