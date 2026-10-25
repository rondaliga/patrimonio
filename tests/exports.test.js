import test from 'node:test';
import assert from 'node:assert/strict';
import { assetColumns, eventColumns } from '../src/lib/exports.js';
import { toCsv } from '../src/lib/csv.js';
import { describeEvent } from '../src/services/rules.js';
import { LONG_LOAN_HOURS } from '../src/lib/status.js';
import { buildSeed } from '../src/services/seed.js';

const seed = buildSeed(new Date('2026-10-20T12:00:00Z'));
const names = new Map(seed.sectors.map((s) => [s.id, s.name]));
const sectorName = (id) => names.get(id) ?? '—';

test('colunas de ativos: mesmas na lista e em relatórios (+ data de cadastro opcional)', () => {
  const base = assetColumns(sectorName);
  const full = assetColumns(sectorName, { withCreatedAt: true });
  assert.equal(full.length, base.length + 1);
  assert.deepEqual(base.map((c) => c.label), full.slice(0, base.length).map((c) => c.label));
  const csv = toCsv(seed.assets.slice(0, 3), base).split('\r\n');
  assert.equal(csv.length, 4);
  assert.ok(csv[0].includes('Patrimônio;Nome'));
});

test('colunas de eventos geram CSV com descrição legível', () => {
  const getAsset = (t) => seed.assets.find((a) => a.tag === t);
  const cols = eventColumns({ sectorName, getAsset, describeEvent });
  const ev = seed.events.find((e) => e.type === 'checkout');
  const row = cols.map((c) => c.value(ev));
  assert.ok(row.some((v) => String(v).startsWith('Retirado por')));
});

test('limite de empréstimo prolongado é único', () => {
  assert.equal(LONG_LOAN_HOURS, 12);
});

test('plural: concordância de contadores', async () => {
  const { plural } = await import('../src/lib/format.js');
  assert.equal(plural(0, 'setor', 'setores'), '0 setores');
  assert.equal(plural(1, 'setor', 'setores'), '1 setor');
  assert.equal(plural(6, 'ativo', 'ativos'), '6 ativos');
});
