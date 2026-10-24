import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ValidationError,
  applyCheckIn,
  applyCheckOut,
  applyCompleteMaintenance,
  applyRetire,
  applySendToMaintenance,
  canDelete,
  canTransition,
  describeEvent,
  nextTag,
  normalizeAssetInput,
} from '../src/services/rules.js';
import { computeStats, loanDurations } from '../src/services/stats.js';
import { buildSeed } from '../src/services/seed.js';
import { toCsv } from '../src/lib/csv.js';

const sectors = [
  { id: 'uti', name: 'UTI' },
  { id: 'ps', name: 'Pronto-Socorro' },
];
const AT = '2026-10-20T10:00:00.000Z';
const base = {
  tag: 'RAD-0001',
  name: 'Rádio',
  category: 'radio',
  sectorId: 'uti',
  status: 'available',
  assignedTo: null,
  maintenance: null,
  retired: null,
};

test('check-out: disponível -> em uso, registra responsável e evento', () => {
  const { asset, events } = applyCheckOut(base, { user: ' Dra. Ana ', sectorId: 'ps', at: AT }, sectors);
  assert.equal(asset.status, 'in_use');
  assert.equal(asset.assignedTo.user, 'Dra. Ana');
  assert.equal(asset.assignedTo.sectorId, 'ps');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'checkout');
});

test('check-out: exige responsável e setor válido', () => {
  assert.throws(
    () => applyCheckOut(base, { user: '', sectorId: 'xx', at: AT }, sectors),
    (e) => e instanceof ValidationError && !!e.fields.user && !!e.fields.sectorId
  );
});

test('check-out: não permite ativo que já está em uso, em manutenção ou baixado', () => {
  for (const status of ['in_use', 'maintenance', 'retired']) {
    assert.throws(
      () => applyCheckOut({ ...base, status }, { user: 'Ana', sectorId: 'uti', at: AT }, sectors),
      ValidationError
    );
  }
});

test('check-in: devolução ok volta a disponível e limpa responsável', () => {
  const out = applyCheckOut(base, { user: 'Ana', sectorId: 'ps', at: AT }, sectors).asset;
  const { asset, events } = applyCheckIn(out, { condition: 'ok', at: AT });
  assert.equal(asset.status, 'available');
  assert.equal(asset.assignedTo, null);
  assert.deepEqual(events.map((e) => e.type), ['checkin']);
});

test('check-in: com defeito vai para manutenção e gera dois eventos', () => {
  const out = applyCheckOut(base, { user: 'Ana', sectorId: 'ps', at: AT }, sectors).asset;
  const { asset, events } = applyCheckIn(out, { condition: 'maintenance', note: 'Tela quebrada', at: AT });
  assert.equal(asset.status, 'maintenance');
  assert.equal(asset.maintenance.reason, 'Tela quebrada');
  assert.deepEqual(events.map((e) => e.type), ['checkin', 'maintenance']);
});

test('check-in: só funciona para ativo em uso', () => {
  assert.throws(() => applyCheckIn(base, { condition: 'ok', at: AT }), ValidationError);
});

test('manutenção: ciclo completo e baixa é definitiva', () => {
  const m = applySendToMaintenance(base, { kind: 'sterilization', reason: 'Pós-cirurgia', at: AT }).asset;
  assert.equal(m.status, 'maintenance');
  assert.equal(m.maintenance.kind, 'sterilization');
  const back = applyCompleteMaintenance(m, { at: AT });
  assert.equal(back.asset.status, 'available');
  assert.equal(back.events[0].type, 'restored');

  const retired = applyRetire(m, { reason: 'Fim de vida útil', at: AT }).asset;
  assert.equal(retired.status, 'retired');
  assert.throws(() => applyCheckOut(retired, { user: 'Ana', sectorId: 'uti', at: AT }, sectors), ValidationError);
  assert.throws(() => applyCompleteMaintenance(retired, { at: AT }), ValidationError);
  assert.equal(canTransition('retired', 'available'), false);
});

test('manutenção: exige motivo e não aceita ativo em uso', () => {
  assert.throws(() => applySendToMaintenance(base, { kind: 'maintenance', reason: ' ', at: AT }), ValidationError);
  const inUse = { ...base, status: 'in_use', assignedTo: { user: 'Ana', sectorId: 'uti', since: AT } };
  assert.throws(() => applySendToMaintenance(inUse, { kind: 'maintenance', reason: 'Teste', at: AT }), ValidationError);
  assert.throws(() => applyRetire(inUse, { reason: 'Teste', at: AT }), ValidationError);
});

test('cadastro: valida patrimônio duplicado, formato, setor e categoria', () => {
  const ctx = { sectors, assets: [base], isNew: true };
  const ok = normalizeAssetInput({ tag: ' rad-0002 ', name: '  Rádio   X ', category: 'radio', sectorId: 'uti' }, ctx);
  assert.equal(ok.tag, 'RAD-0002');
  assert.equal(ok.name, 'Rádio X');

  assert.throws(
    () => normalizeAssetInput({ tag: 'RAD-0001', name: 'X1', category: 'radio', sectorId: 'uti' }, ctx),
    (e) => !!e.fields.tag
  );
  assert.throws(
    () => normalizeAssetInput({ tag: 'a', name: '', category: 'nada', sectorId: 'zz' }, ctx),
    (e) => !!(e.fields.tag && e.fields.name && e.fields.category && e.fields.sectorId)
  );
});

test('nextTag sugere o próximo número da categoria', () => {
  assert.equal(nextTag('radio', []), 'RAD-0001');
  assert.equal(nextTag('radio', [{ tag: 'RAD-0007' }, { tag: 'RAD-0002' }, { tag: 'CDR-0099' }]), 'RAD-0008');
});

test('canDelete: só ativos sem movimentações reais', () => {
  assert.equal(canDelete(base, [{ tag: 'RAD-0001', type: 'created' }]), true);
  assert.equal(canDelete(base, [{ tag: 'RAD-0001', type: 'checkout' }]), false);
  assert.equal(canDelete({ ...base, status: 'in_use' }, []), false);
});

test('describeEvent gera texto legível', () => {
  assert.match(describeEvent({ type: 'checkout', user: 'Ana' }, 'UTI'), /Retirado por Ana para UTI/);
  assert.match(describeEvent({ type: 'retired', reason: 'Quebrou' }), /Baixado: Quebrou/);
});

test('seed: consistente (em uso tem responsável, tags únicas, setores existem)', () => {
  const { sectors: ss, assets, events } = buildSeed(new Date('2026-10-20T12:00:00Z'));
  assert.ok(assets.length > 100);
  assert.equal(new Set(assets.map((a) => a.tag)).size, assets.length);
  const ids = new Set(ss.map((s) => s.id));
  for (const a of assets) {
    assert.ok(ids.has(a.sectorId));
    assert.equal(a.status === 'in_use', !!a.assignedTo, a.tag);
    assert.equal(a.status === 'maintenance', !!a.maintenance, a.tag);
    assert.equal(a.status === 'retired', !!a.retired, a.tag);
  }
  const tags = new Set(assets.map((a) => a.tag));
  assert.ok(events.every((e) => tags.has(e.tag)));
});

test('stats: totais batem com os ativos e semana tem 7 dias', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const { sectors: ss, assets, events } = buildSeed(now);
  const st = computeStats({ assets, events, sectors: ss, now });
  assert.equal(Object.values(st.statusTotals).reduce((a, b) => a + b, 0), assets.length);
  assert.equal(st.bySector.reduce((a, s) => a + s.total, 0), assets.length);
  assert.equal(st.activeLoans.length, st.statusTotals.in_use);
  assert.equal(st.weekly.length, 7);
  assert.ok(st.weekly.every((d) => d.value >= 0));
  assert.ok(st.weekly.reduce((a, d) => a + d.value, 0) > 20);
  assert.ok(st.recent.length > 0 && st.recent.length <= 6);
});

test('loanDurations pareia check-out e check-in', () => {
  const ev = [
    { tag: 'A', type: 'checkout', at: '2026-10-20T08:00:00.000Z', sectorId: 'uti' },
    { tag: 'A', type: 'checkin', at: '2026-10-20T11:00:00.000Z' },
    { tag: 'B', type: 'checkout', at: '2026-10-20T08:00:00.000Z', sectorId: 'ps' },
  ];
  const d = loanDurations(ev);
  assert.equal(d.length, 1);
  assert.equal(d[0].hours, 3);
});

test('csv: separador ;, aspas e proteção contra injeção de fórmula', () => {
  const csv = toCsv(
    [{ a: '=SOMA(1;2)', b: 'diz "oi"', c: 'x;y' }],
    [
      { label: 'A', value: (r) => r.a },
      { label: 'B', value: (r) => r.b },
      { label: 'C', value: (r) => r.c },
    ]
  );
  const lines = csv.replace('﻿', '').split('\r\n');
  assert.equal(lines[0], 'A;B;C');
  assert.equal(lines[1], `"'=SOMA(1;2)";"diz ""oi""";"x;y"`);
});
