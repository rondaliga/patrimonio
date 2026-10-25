import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalAdapter } from '../src/services/localAdapter.js';
import { createMemoryBackend, createStorage } from '../src/services/storage.js';
import { ValidationError } from '../src/services/rules.js';

const NOW = new Date('2026-10-20T12:00:00Z');
const make = (backend = createMemoryBackend()) => ({
  backend,
  api: createLocalAdapter({ storage: createStorage('t', backend), now: () => NOW }),
});

test('primeira leitura carrega dados de demonstração e persiste', async () => {
  const { api, backend } = make();
  const a = await api.snapshot();
  assert.ok(a.assets.length > 100);
  const again = createLocalAdapter({ storage: createStorage('t', backend), now: () => NOW });
  assert.deepEqual((await again.snapshot()).assets.length, a.assets.length);
});

test('fluxo completo: cadastrar -> check-out -> check-in com defeito -> concluir -> baixar', async () => {
  const { api } = make();
  const created = await api.createAsset({ tag: 'rad-9001', name: 'Rádio de teste', category: 'radio', sectorId: 'uti' });
  assert.equal(created.tag, 'RAD-9001');
  assert.equal(created.status, 'available');

  await api.checkOut('RAD-9001', { user: 'Enf. Teste', sectorId: 'ps', note: 'plantão' });
  let s = await api.snapshot();
  let asset = s.assets.find((x) => x.tag === 'RAD-9001');
  assert.equal(asset.status, 'in_use');
  assert.equal(asset.assignedTo.user, 'Enf. Teste');

  await assert.rejects(api.checkOut('RAD-9001', { user: 'Outro', sectorId: 'uti' }), ValidationError);

  await api.checkIn('RAD-9001', { condition: 'maintenance', note: 'Antena quebrada' });
  s = await api.snapshot();
  asset = s.assets.find((x) => x.tag === 'RAD-9001');
  assert.equal(asset.status, 'maintenance');
  assert.equal(asset.assignedTo, null);

  await api.completeMaintenance('RAD-9001', { note: 'Trocada' });
  await api.retire('RAD-9001', { reason: 'Obsoleto' });
  s = await api.snapshot();
  assert.equal(s.assets.find((x) => x.tag === 'RAD-9001').status, 'retired');

  const history = s.events.filter((e) => e.tag === 'RAD-9001').map((e) => e.type);
  assert.deepEqual(history, ['created', 'checkout', 'checkin', 'maintenance', 'restored', 'retired']);
  const ids = s.events.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'ids de evento únicos');
});

test('erro de validação não altera nem grava nada', async () => {
  const { api } = make();
  const before = await api.snapshot();
  await assert.rejects(api.createAsset({ tag: 'x', name: '', category: 'radio', sectorId: 'uti' }), ValidationError);
  await assert.rejects(api.checkOut('NAO-EXISTE', { user: 'Ana', sectorId: 'uti' }), ValidationError);
  const after = await api.snapshot();
  assert.deepEqual(after, before);
});

test('patrimônio duplicado é recusado', async () => {
  const { api } = make();
  const { assets } = await api.snapshot();
  await assert.rejects(
    api.createAsset({ tag: assets[0].tag, name: 'Dup', category: 'radio', sectorId: 'uti' }),
    (e) => !!e.fields.tag
  );
});

test('edição registra evento só quando algo mudou; tag não muda', async () => {
  const { api } = make();
  const a = await api.createAsset({ tag: 'MON-9001', name: 'Monitor', category: 'monitor', sectorId: 'uti' });
  const same = await api.updateAsset(a.tag, { name: 'Monitor' });
  assert.equal(same.name, 'Monitor');
  let s = await api.snapshot();
  assert.equal(s.events.filter((e) => e.tag === 'MON-9001' && e.type === 'edited').length, 0);

  const up = await api.updateAsset('MON-9001', { name: 'Monitor novo', tag: 'OUTRA-TAG', sectorId: 'ps' });
  assert.equal(up.tag, 'MON-9001');
  assert.equal(up.sectorId, 'ps');
  s = await api.snapshot();
  assert.equal(s.events.filter((e) => e.tag === 'MON-9001' && e.type === 'edited').length, 1);
});

test('exclusão: permitida sem movimentações, bloqueada com histórico', async () => {
  const { api } = make();
  await api.createAsset({ tag: 'IMP-9001', name: 'Impressora', category: 'printer', sectorId: 'ti' });
  await api.deleteAsset('IMP-9001');
  assert.equal((await api.snapshot()).assets.some((a) => a.tag === 'IMP-9001'), false);

  await api.createAsset({ tag: 'IMP-9002', name: 'Impressora', category: 'printer', sectorId: 'ti' });
  await api.checkOut('IMP-9002', { user: 'Ana', sectorId: 'ti' });
  await api.checkIn('IMP-9002', { condition: 'ok' });
  await assert.rejects(api.deleteAsset('IMP-9002'), ValidationError);
});

test('setores: criar, duplicado, excluir só se vazio', async () => {
  const { api } = make();
  const s = await api.createSector('  Hemodiálise ');
  assert.equal(s.name, 'Hemodiálise');
  assert.equal(s.id, 'hemodialise');
  await assert.rejects(api.createSector('hemodiálise'), ValidationError);
  await assert.rejects(api.createSector('HEMODIALISE'), ValidationError);
  await assert.rejects(api.deleteSector('uti'), ValidationError);
  await api.deleteSector('hemodialise');
  assert.equal((await api.snapshot()).sectors.some((x) => x.id === 'hemodialise'), false);
});

test('backup: exportar e importar em outro armazenamento preserva tudo', async () => {
  const { api } = make();
  await api.createAsset({ tag: 'COL-9001', name: 'Coletor', category: 'collector', sectorId: 'ti' });
  const dump = JSON.parse(JSON.stringify(await api.exportData()));

  const other = make().api;
  await other.importData(dump);
  const a = await api.snapshot();
  const b = await other.snapshot();
  assert.equal(b.assets.length, a.assets.length);
  assert.equal(b.events.length, a.events.length);
  assert.ok(b.assets.some((x) => x.tag === 'COL-9001'));
});

test('importação recusa arquivos inválidos sem alterar os dados', async () => {
  const { api } = make();
  const before = await api.snapshot();
  const { assets, sectors } = before;
  const bad = [
    null,
    {},
    { sectors, assets: 'x', events: [] },
    { sectors, assets: [{ ...assets[0], sectorId: 'nada' }], events: [] },
    { sectors, assets: [assets[0], assets[0]], events: [] },
    { sectors, assets: [{ ...assets[0], status: 'voando' }], events: [] },
  ];
  for (const b of bad) await assert.rejects(api.importData(b), ValidationError);
  assert.deepEqual(await api.snapshot(), before);
});

test('limpar tudo mantém setores; restaurar demo recarrega os dados', async () => {
  const { api } = make();
  await api.clearAll();
  let s = await api.snapshot();
  assert.equal(s.assets.length, 0);
  assert.equal(s.events.length, 0);
  assert.ok(s.sectors.length >= 6);
  await api.resetDemo();
  s = await api.snapshot();
  assert.ok(s.assets.length > 100);
});

test('dados corrompidos no storage são substituídos pela demonstração', async () => {
  const backend = createMemoryBackend();
  backend.setItem('t', '{isto não é json');
  const api = createLocalAdapter({ storage: createStorage('t', backend), now: () => NOW });
  assert.ok((await api.snapshot()).assets.length > 100);
});

test('consultas leves: janela de eventos, histórico por ativo e eventos novos', async () => {
  const { api } = make();
  const all = await api.snapshot();
  const recent = await api.snapshot({ recentDays: 7 });
  assert.ok(recent.events.length < all.events.length, 'janela reduz os eventos');
  assert.equal(recent.assets.length, all.assets.length);

  const lastId = Math.max(...all.events.map((e) => e.id));
  await api.createAsset({ tag: 'MON-9100', name: 'Monitor', category: 'monitor', sectorId: 'uti' });
  const fresh = await api.eventsAfter(lastId);
  assert.deepEqual(fresh.map((e) => [e.tag, e.type]), [['MON-9100', 'created']]);

  const hist = await api.eventsFor('MON-9100');
  assert.equal(hist.length, 1);
  assert.equal(await api.countEvents(), all.events.length + 1);
  assert.equal((await api.allEvents()).length, all.events.length + 1);
});

test('snapshot devolve cópias: mudar o resultado não altera o armazenamento em memória', async () => {
  const { api } = make();
  const s = await api.snapshot();
  const n = s.assets.length;
  s.assets.pop();
  s.events.length = 0;
  const again = await api.snapshot();
  assert.equal(again.assets.length, n);
  assert.ok(again.events.length > 0);
});

test('cache em memória: erro de validação não deixa estado pela metade; outra aba invalida o cache', async () => {
  const { api, backend } = make();
  const before = await api.snapshot();
  await assert.rejects(api.checkOut('NAO-EXISTE', { user: 'Ana', sectorId: 'uti' }), ValidationError);
  assert.deepEqual(await api.snapshot(), before);

  // simula outra aba gravando um backup diferente no mesmo armazenamento
  const other = createLocalAdapter({ storage: createStorage('t', backend), now: () => NOW });
  await other.createAsset({ tag: 'COL-9200', name: 'Coletor', category: 'collector', sectorId: 'ti' });
  const listeners = {};
  globalThis.window = { addEventListener: (n, f) => (listeners[n] = f), removeEventListener() {} };
  let notified = 0;
  const off = api.subscribe(() => notified++);
  listeners.storage({ key: 't' });
  off();
  delete globalThis.window;
  assert.equal(notified, 1);
  assert.ok((await api.snapshot()).assets.some((a) => a.tag === 'COL-9200'));
});

test('apagar histórico: tudo ou só o anterior a uma data; ativos e status permanecem', async () => {
  const { api } = make();
  const before = await api.snapshot();
  const loans = before.assets.filter((a) => a.status === 'in_use').length;
  const total = before.events.length;
  assert.ok(total > 0 && loans > 0);

  // só o anterior a 7 dias
  const cutoff = new Date(NOW.getTime() - 7 * 86400000).toISOString();
  const removed = await api.clearHistory({ before: cutoff });
  const mid = await api.snapshot();
  assert.ok(removed > 0 && removed < total);
  assert.equal(mid.events.length, total - removed);
  assert.ok(mid.events.every((e) => e.at >= cutoff));

  // tudo
  const rest = await api.clearHistory();
  assert.equal(rest, total - removed);
  const after = await api.snapshot();
  assert.equal(after.events.length, 0);
  assert.equal(after.assets.length, before.assets.length);
  assert.equal(after.assets.filter((a) => a.status === 'in_use').length, loans);
  assert.equal(await api.countEvents(), 0);

  // novos eventos continuam com ids crescentes (sem reaproveitar números)
  await api.createAsset({ tag: 'MON-9300', name: 'Monitor', category: 'monitor', sectorId: 'uti' });
  const [ev] = (await api.snapshot()).events;
  assert.ok(ev.id > total);
  assert.equal(await api.clearHistory(), 1);
  assert.equal(await api.clearHistory(), 0);
});
