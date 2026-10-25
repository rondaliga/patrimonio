import test from 'node:test';
import assert from 'node:assert/strict';
import { applyChange, lastEventId, mergeEvents, removeAsset, setSectors, upsertAsset } from '../src/services/patch.js';

const asset = (tag, extra = {}) => ({ tag, name: tag, category: 'radio', status: 'available', sectorId: 'uti', ...extra });
const base = () => ({
  sectors: [{ id: 'uti', name: 'UTI' }],
  assets: [asset('B-2'), asset('D-4')],
  events: [{ id: 1, tag: 'B-2', type: 'created', at: 'a' }, { id: 2, tag: 'D-4', type: 'created', at: 'b' }],
});

test('upsertAsset substitui por patrimônio ou insere em ordem, sem mutar o original', () => {
  const d = base();
  const snapshot = JSON.stringify(d);
  const replaced = upsertAsset(d, asset('B-2', { status: 'in_use' }));
  assert.equal(replaced.assets.length, 2);
  assert.equal(replaced.assets[0].status, 'in_use');
  const inserted = upsertAsset(d, asset('C-3'));
  assert.deepEqual(inserted.assets.map((a) => a.tag), ['B-2', 'C-3', 'D-4']);
  assert.equal(JSON.stringify(d), snapshot);
  assert.equal(replaced.events, d.events); // partes intocadas mantêm a identidade (evita re-render)
});

test('removeAsset remove também o histórico do ativo', () => {
  const r = removeAsset(base(), 'B-2');
  assert.deepEqual(r.assets.map((a) => a.tag), ['D-4']);
  assert.deepEqual(r.events.map((e) => e.id), [2]);
});

test('mergeEvents ignora ids repetidos (eco do tempo real) e mantém a ordem', () => {
  const d = base();
  const same = mergeEvents(d, [{ id: 2, tag: 'D-4', type: 'created', at: 'b' }]);
  assert.equal(same, d);
  const m = mergeEvents(d, [{ id: 4, tag: 'X', type: 'checkout', at: 'd' }, { id: 3, tag: 'X', type: 'created', at: 'c' }]);
  assert.deepEqual(m.events.map((e) => e.id), [1, 2, 3, 4]);
  assert.equal(lastEventId(m), 4);
  assert.equal(lastEventId({ events: [] }), 0);
});

test('applyChange traduz as mudanças do tempo real e devolve null quando não sabe aplicar', () => {
  const d = base();
  assert.equal(applyChange(d, { kind: 'asset', asset: asset('Z-9') }).assets.length, 3);
  assert.equal(applyChange(d, { kind: 'asset-removed', tag: 'B-2' }).assets.length, 1);
  assert.equal(applyChange(d, { kind: 'event', event: { id: 7, tag: 'B-2', type: 'edited', at: 'z' } }).events.length, 3);
  assert.equal(applyChange(d, { kind: 'sectors' }), null);
  assert.equal(applyChange(d, undefined), null);
  assert.deepEqual(setSectors(d, [{ id: 'ps', name: 'PS' }]).sectors, [{ id: 'ps', name: 'PS' }]);
});
