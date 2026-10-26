import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseAdapter } from '../src/services/supabaseAdapter.js';
import { rowToAsset, rowToEvent, toValidationError } from '../src/services/supabaseMapping.js';
import { ValidationError } from '../src/services/rules.js';

// Cliente falso: grava as chamadas e devolve respostas preparadas por tabela/função.
function fakeClient({ tables = {}, rpcs = {}, errors = {} } = {}) {
  const calls = [];
  const builder = (table) => {
    const state = { table, op: 'select', filters: [], range: null };
    const b = {
      select: () => b,
      insert: (v) => ((state.op = 'insert'), (state.values = v), b),
      update: (v) => ((state.op = 'update'), (state.values = v), b),
      delete: () => ((state.op = 'delete'), b),
      eq: (k, v) => (state.filters.push([k, v]), b),
      gt: (k, v) => (state.filters.push(['gt:' + k, v]), b),
      gte: (k, v) => (state.filters.push(['gte:' + k, v]), b),
      order: () => b,
      range: (a, z) => ((state.range = [a, z]), b),
      single: () => ((state.single = true), b),
      maybeSingle: () => ((state.single = true), b),
      then: (res, rej) => {
        calls.push({ ...state });
        if (errors[`${table}.${state.op}`]) return Promise.resolve({ data: null, error: errors[`${table}.${state.op}`] }).then(res, rej);
        let data = tables[table] ?? [];
        if (typeof data === 'function') data = data(state);
        if (state.range) data = data.slice(state.range[0], state.range[1] + 1);
        if (state.single) data = Array.isArray(data) ? data[0] ?? null : data;
        return Promise.resolve({ data, error: null }).then(res, rej);
      },
    };
    return b;
  };
  return {
    calls,
    from: builder,
    rpc: (fn, args) => {
      calls.push({ rpc: fn, args });
      return Promise.resolve(errors[fn] ? { data: null, error: errors[fn] } : { data: rpcs[fn], error: null });
    },
  };
}

const row = (o = {}) => ({ tag: 'RAD-0001', name: 'Rádio', category: 'radio', serial: '', sector_id: 'uti', notes: '', status: 'available', created_at: '2026-10-20T12:00:00+00:00', ...o });

test('rowToAsset converte estados e normaliza datas', () => {
  const a = rowToAsset(row({ status: 'in_use', assigned_user: 'Ana', assigned_sector_id: 'ps', assigned_since: '2026-10-20T10:00:00+00:00' }));
  assert.deepEqual(a.assignedTo, { user: 'Ana', sectorId: 'ps', since: '2026-10-20T10:00:00.000Z', note: '' });
  assert.equal(a.maintenance, null);
  assert.equal(rowToAsset(row({ status: 'retired', retired_reason: 'x', retired_at: '2026-01-01T00:00:00Z' })).retired.reason, 'x');
});

test('rowToEvent omite campos nulos', () => {
  const e = rowToEvent({ id: 1, tag: 'A', type: 'checkout', at: '2026-10-20T10:00:00Z', user_name: 'Ana', sector_id: 'ps', kind: null, reason: null, note: null });
  assert.deepEqual(e, { id: 1, tag: 'A', type: 'checkout', at: '2026-10-20T10:00:00.000Z', user: 'Ana', sectorId: 'ps' });
});

test('erros do banco viram ValidationError com campo', () => {
  const perm = toValidationError({ code: '42501', message: 'x' });
  assert.match(perm.message, /permissão/);
  const dup = toValidationError({ code: '23505', message: 'duplicate key value violates unique constraint "assets_pkey"' });
  assert.ok(dup.fields.tag);
  const sec = toValidationError({ code: '23505', message: 'duplicate key sectors_name_unique' });
  assert.ok(sec.fields.name);
  assert.ok(toValidationError({ message: 'Informe quem está retirando.' }).fields.user);
  assert.ok(toValidationError({ message: 'Descreva o motivo.' }).fields.reason);
});

test('snapshot pagina eventos além de 1000 linhas', async () => {
  const events = Array.from({ length: 2300 }, (_, i) => ({ id: i + 1, tag: 'A', type: 'edited', at: '2026-10-20T10:00:00Z' }));
  const client = fakeClient({ tables: { sectors: [{ id: 'uti', name: 'UTI' }], assets: [row()], events } });
  const snap = await createSupabaseAdapter(client).snapshot();
  assert.equal(snap.events.length, 2300);
  assert.equal(snap.assets[0].tag, 'RAD-0001');
});

test('movimentações chamam as RPCs com os parâmetros certos', async () => {
  const client = fakeClient({ rpcs: { checkout_asset: row({ status: 'in_use', assigned_user: 'Ana', assigned_sector_id: 'ps', assigned_since: '2026-10-20T10:00:00Z' }) } });
  const api = createSupabaseAdapter(client);
  const a = await api.checkOut('RAD-0001', { user: 'Ana', sectorId: 'ps', note: 'plantão' });
  assert.equal(a.status, 'in_use');
  assert.deepEqual(client.calls.at(-1), { rpc: 'checkout_asset', args: { p_tag: 'RAD-0001', p_user: 'Ana', p_sector: 'ps', p_note: 'plantão' } });
});

test('erro de RPC chega ao formulário como ValidationError com campo', async () => {
  const client = fakeClient({ errors: { checkout_asset: { message: 'Informe quem está retirando.' } } });
  await assert.rejects(createSupabaseAdapter(client).checkOut('RAD-0001', { user: '', sectorId: 'ps' }), (e) => e instanceof ValidationError && !!e.fields.user);
});

test('createAsset valida antes de enviar e traduz duplicidade', async () => {
  // Duplicidade: não baixa mais todas as tags; o banco recusa (chave primária) e o erro é traduzido.
  const dupClient = fakeClient({
    tables: { sectors: [{ id: 'uti' }] },
    errors: { 'assets.insert': { code: '23505', message: 'duplicate key value violates unique constraint "assets_pkey"' } },
  });
  const api = createSupabaseAdapter(dupClient);
  await assert.rejects(api.createAsset({ tag: 'rad-0001', name: 'Rádio', category: 'radio', sectorId: 'uti' }), (e) => !!e.fields.tag);
  assert.ok(!dupClient.calls.some((c) => c.table === 'assets' && c.op === 'select'), 'não deve ler a tabela de ativos inteira');
  await assert.rejects(api.createAsset({ tag: 'RAD-0002', name: '', category: 'radio', sectorId: 'uti' }), (e) => !!e.fields.name);
  const ok = fakeClient({ tables: { sectors: [{ id: 'uti' }], assets: (s) => (s.op === 'insert' ? row({ tag: 'RAD-0002' }) : []) } });
  const created = await createSupabaseAdapter(ok).createAsset({ tag: 'rad-0002', name: 'Rádio', category: 'radio', sectorId: 'uti' });
  assert.equal(created.tag, 'RAD-0002');
  const ins = ok.calls.find((c) => c.op === 'insert');
  assert.deepEqual(Object.keys(ins.values).sort(), ['category', 'name', 'notes', 'sector_id', 'serial', 'tag']);
});

test('deleteAsset e deleteSector avisam quando nada foi excluído', async () => {
  const api = createSupabaseAdapter(fakeClient({ tables: { assets: [], sectors: [] } }));
  await assert.rejects(api.deleteAsset('RAD-0001'), /movimentações|permissão/);
  await assert.rejects(api.deleteSector('uti'), /permissão|inexistente/);
});

test('createSector gera id único a partir do nome', async () => {
  const client = fakeClient({ tables: { sectors: (s) => (s.op === 'insert' ? s.values : [{ id: 'hemodialise' }]) } });
  const s = await createSupabaseAdapter(client).createSector('  Hemodiálise ');
  assert.equal(s.id, 'hemodialise-2');
  assert.equal(s.name, 'Hemodiálise');
});

test('operações em massa não existem no modo online', async () => {
  const api = createSupabaseAdapter(fakeClient());
  assert.equal(api.capabilities.demo, false);
  assert.throws(() => api.resetDemo(), ValidationError);
  assert.throws(() => api.importData({}), ValidationError);
});

test('snapshot com recentDays filtra eventos no servidor e escolhe só colunas necessárias', async () => {
  const NOW = new Date('2026-10-20T12:00:00Z');
  const client = fakeClient({ tables: { sectors: [{ id: 'uti', name: 'UTI' }], assets: [row()], events: [] } });
  await createSupabaseAdapter(client, { now: () => NOW }).snapshot({ recentDays: 60 });
  const ev = client.calls.find((c) => c.table === 'events');
  assert.deepEqual(ev.filters, [['gte:at', '2026-08-21T12:00:00.000Z']]);
});

test('eventsAfter pede só eventos com id maior; eventsFor filtra por patrimônio', async () => {
  const client = fakeClient({ tables: { events: [{ id: 5, tag: 'A', type: 'checkout', at: '2026-10-20T10:00:00Z' }] } });
  const api = createSupabaseAdapter(client);
  const after = await api.eventsAfter(4);
  assert.equal(after[0].id, 5);
  assert.deepEqual(client.calls.at(-1).filters, [['gt:id', 4]]);
  await api.eventsFor('A');
  assert.deepEqual(client.calls.at(-1).filters, [['tag', 'A']]);
});

test('tempo real: mudanças chegam descritas (ativo, evento, setor)', () => {
  const handlers = [];
  const ch = { on: (_t, filter, fn) => (handlers.push([filter.table, fn]), ch), subscribe: () => ch };
  const client = { channel: () => ch, removeChannel() {} };
  const got = [];
  createSupabaseAdapter(client).subscribe((c) => got.push(c));
  const fire = (table, payload) => handlers.find(([t]) => t === table)[1](payload);
  fire('assets', { eventType: 'UPDATE', new: row({ status: 'maintenance', maint_kind: 'maintenance', maint_reason: 'x', maint_since: '2026-10-20T10:00:00Z' }) });
  fire('assets', { eventType: 'DELETE', old: { tag: 'RAD-0001' } });
  fire('events', { eventType: 'INSERT', new: { id: 9, tag: 'A', type: 'edited', at: '2026-10-20T10:00:00Z' } });
  fire('events', { eventType: 'DELETE', old: { id: 9 } });
  fire('sectors', { eventType: 'INSERT' });
  assert.deepEqual(got.map((c) => c.kind), ['asset', 'asset-removed', 'event', 'event-removed', 'sectors']);
  assert.equal(got[3].id, 9);
  assert.equal(got[0].asset.status, 'maintenance');
  assert.equal(got[1].tag, 'RAD-0001');
});

test('deleteEvent chama a função do banco e avisa quando nada foi excluído', async () => {
  const client = fakeClient({ rpcs: { delete_event: 1 } });
  await createSupabaseAdapter(client).deleteEvent(42);
  assert.deepEqual(client.calls.at(-1), { rpc: 'delete_event', args: { p_id: 42 } });
  await assert.rejects(createSupabaseAdapter(fakeClient({ rpcs: { delete_event: 0 } })).deleteEvent(7), ValidationError);
});

test('deleteEvent sem permissão ou sem a função no banco: mensagens claras', async () => {
  const semPermissao = fakeClient({ errors: { delete_event: { code: '42501', message: 'Sem permissão para esta operação.' } } });
  await assert.rejects(createSupabaseAdapter(semPermissao).deleteEvent(1), /permissão/);
  const semFuncao = fakeClient({ errors: { delete_event: { code: 'PGRST202', message: 'Could not find the function public.delete_event(p_id) in the schema cache' } } });
  await assert.rejects(createSupabaseAdapter(semFuncao).deleteEvent(1), /schema\.sql/);
});

// ---- Login por usuário e gestão de contas ----
function fakeAuthClient(over = {}) {
  const calls = [];
  const client = fakeClient(over.client);
  client.auth = {
    getSession: async () => ({ data: { session: over.session === undefined ? { user: { id: 'u1', email: 'ana@patrimonio.invalid' } } : over.session }, error: null }),
    signInWithPassword: async (args) => {
      calls.push(['signIn', args]);
      return over.signIn ? over.signIn(args) : { data: { session: { user: { id: 'u1' } } }, error: null };
    },
    updateUser: async (args) => {
      calls.push(['updateUser', args]);
      return over.updateUser ? over.updateUser(args) : { data: {}, error: null };
    },
  };
  return { client, calls };
}

test('signIn converte usuário em e-mail interno e traduz erro de credenciais', async () => {
  const { client, calls } = fakeAuthClient({ signIn: () => ({ data: null, error: { message: 'Invalid login credentials' } }) });
  const api = createSupabaseAdapter(client);
  await assert.rejects(() => api.auth.signIn('  Ana.Silva ', 'x'), { message: 'Usuário ou senha incorretos.' });
  assert.equal(calls[0][1].email, 'ana.silva@patrimonio.invalid');
  const ok = fakeAuthClient();
  await createSupabaseAdapter(ok.client).auth.signIn('antigo@gmail.com', 'senha1234');
  assert.equal(ok.calls[0][1].email, 'antigo@gmail.com', 'e-mail de conta antiga continua funcionando');
});

test('getProfile devolve nome, perfil e usuário', async () => {
  const { client } = fakeAuthClient({ client: { tables: { profiles: [{ full_name: 'Ana', role: 'admin', username: 'ana' }] } } });
  assert.deepEqual(await createSupabaseAdapter(client).auth.getProfile('u1'), { fullName: 'Ana', role: 'admin', username: 'ana' });
});

test('changePassword confere a senha atual antes de trocar', async () => {
  const good = fakeAuthClient();
  await createSupabaseAdapter(good.client).auth.changePassword('atual123', 'nova12345');
  assert.deepEqual(good.calls.map((c) => c[0]), ['signIn', 'updateUser']);
  assert.deepEqual(good.calls[0][1], { email: 'ana@patrimonio.invalid', password: 'atual123' });
  assert.deepEqual(good.calls[1][1], { password: 'nova12345' });

  const wrong = fakeAuthClient({ signIn: () => ({ data: null, error: { message: 'Invalid login credentials' } }) });
  await assert.rejects(() => createSupabaseAdapter(wrong.client).auth.changePassword('errada', 'nova12345'), (e) => e.fields.current && /atual/.test(e.message));
  assert.ok(!wrong.calls.some((c) => c[0] === 'updateUser'), 'senha errada não chega a trocar');

  const same = fakeAuthClient({ updateUser: () => ({ data: null, error: { message: 'New password should be different from the old password.' } }) });
  await assert.rejects(() => createSupabaseAdapter(same.client).auth.changePassword('a', 'b'), (e) => !!e.fields.password);

  const out = fakeAuthClient({ session: null });
  await assert.rejects(() => createSupabaseAdapter(out.client).auth.changePassword('a', 'b'), /Sessão expirada/);
});

test('users: chama as funções admin_* e converte as linhas', async () => {
  const client = fakeClient({
    rpcs: {
      admin_list_users: [{ id: 'u1', username: 'ana', full_name: 'Ana Lima', role: 'admin', created_at: '2026-10-01T10:00:00Z', last_sign_in_at: null }],
      admin_create_user: { id: 'u2', username: 'bia', full_name: 'Bia', role: 'consulta' },
      admin_update_user: { id: 'u2', username: 'bia', full_name: 'Bia Dias', role: 'tecnico' },
    },
  });
  const api = createSupabaseAdapter(client);
  assert.equal(api.capabilities.users, true);
  assert.deepEqual(await api.users.list(), [{ id: 'u1', username: 'ana', fullName: 'Ana Lima', role: 'admin', createdAt: '2026-10-01T10:00:00.000Z', lastSignInAt: null }]);
  const created = await api.users.create({ username: 'bia', fullName: 'Bia', role: 'consulta', password: 'senha1234' });
  assert.equal(created.username, 'bia');
  assert.deepEqual(client.calls.find((c) => c.rpc === 'admin_create_user').args, { p_username: 'bia', p_full_name: 'Bia', p_role: 'consulta', p_password: 'senha1234' });
  assert.equal((await api.users.update('u2', { fullName: 'Bia Dias', role: 'tecnico' })).role, 'tecnico');
  assert.deepEqual(client.calls.find((c) => c.rpc === 'admin_update_user').args, { p_id: 'u2', p_full_name: 'Bia Dias', p_role: 'tecnico' });
  await api.users.setPassword('u2', 'outra12345');
  assert.deepEqual(client.calls.find((c) => c.rpc === 'admin_set_password').args, { p_id: 'u2', p_password: 'outra12345' });
  await api.users.remove('u2');
  assert.deepEqual(client.calls.find((c) => c.rpc === 'admin_delete_user').args, { p_id: 'u2' });
});

test('erros de usuário vêm com o campo certo', async () => {
  const dup = toValidationError({ code: 'P0001', message: 'Já existe um usuário com este nome de usuário.' });
  assert.ok(dup.fields.username);
  assert.ok(toValidationError({ code: '23505', message: 'duplicate key value violates unique constraint "profiles_username_unique"' }).fields.username);
  assert.ok(toValidationError({ message: 'A senha deve ter pelo menos 8 caracteres.' }).fields.password);
  assert.ok(toValidationError({ message: 'Informe o nome completo da pessoa.' }).fields.fullName);
  assert.ok(toValidationError({ message: 'Nome de usuário inválido: use de 3 a 30 letras' }).fields.username);
  assert.match(toValidationError({ code: '42501', message: 'Sem permissão para esta operação.' }).message, /permissão/);
  const client = fakeClient({ errors: { admin_delete_user: { code: 'P0001', message: 'Você não pode excluir a sua própria conta.' } } });
  await assert.rejects(() => createSupabaseAdapter(client).users.remove('eu'), /própria conta/);
});

test('o modo local não tem gestão de usuários', async () => {
  const { createLocalAdapter } = await import('../src/services/localAdapter.js');
  const api = createLocalAdapter();
  assert.equal(api.users, undefined);
  assert.ok(!api.capabilities.users);
});
