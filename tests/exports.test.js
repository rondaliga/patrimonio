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

test('CSV de movimentações usa tipos em português', () => {
  const sector = (id) => id;
  const cols = eventColumns({ sectorName: sector, getAsset: () => null, describeEvent });
  const tipo = cols.find((c) => c.label === 'Tipo').value;
  assert.equal(tipo({ type: 'checkout' }), 'Retirada');
  assert.equal(tipo({ type: 'checkin' }), 'Devolução');
  assert.equal(tipo({ type: 'restored' }), 'Liberação');
  assert.equal(tipo({ type: 'outro' }), 'outro');
});

test('textos da interface não usam termos em inglês (check-in/out, walkie-talkie, dashboard)', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const files = [];
  const walk = (d) => readdirSync(d).forEach((n) => { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : /\.jsx?$/.test(n) && files.push(p); });
  walk(new URL('../src', import.meta.url).pathname);
  const bad = [];
  for (const f of files) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // comentários não aparecem na tela
      if (/check-(in|out)|walkie|label: 'Dashboard'|>Dashboard</i.test(line)) bad.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(bad, []);
});
