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
  assert.deepEqual(got.map((c) => c.kind), ['asset', 'asset-removed', 'event', 'sectors']);
  assert.equal(got[0].asset.status, 'maintenance');
  assert.equal(got[1].tag, 'RAD-0001');
});
