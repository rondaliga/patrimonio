// Regras novas da v1.6.0: autoria, empréstimos críticos, QR Code, período e busca no modo local.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { actorLabel, actorSearchText, registeredBy } from '../src/lib/audit.js';
import { TAG_RE, assetUrl, tagFromScan } from '../src/lib/qr.js';
import { dayRange } from '../src/lib/format.js';
import { overdueLoans, computeStats } from '../src/services/stats.js';
import { createLocalAdapter } from '../src/services/localAdapter.js';
import { INACTIVE_MESSAGE } from '../src/lib/accounts.js';
import { LONG_LOAN_HOURS } from '../src/lib/status.js';

test('registeredBy monta "Retirada registrada por maria.souza" e some sem autoria', () => {
  assert.equal(registeredBy({ type: 'checkout', actorUsername: 'maria.souza' }), 'Retirada registrada por maria.souza');
  assert.equal(registeredBy({ type: 'checkin', actorUsername: 'maria.souza' }), 'Devolução registrada por maria.souza');
  assert.equal(registeredBy({ type: 'maintenance', actorUsername: 'jo' }), 'Envio para manutenção registrado por jo');
  assert.equal(registeredBy({ type: 'created', actorName: 'Ana Lima' }), 'Cadastro registrado por Ana Lima', 'sem usuário, usa o nome');
  assert.equal(registeredBy({ type: 'checkout' }), '');
  assert.equal(actorLabel({ actorUsername: 'a', actorName: 'B' }), 'a');
  assert.match(actorSearchText({ actorUsername: 'maria.souza', actorName: 'Maria Souza', user: 'Enf. Carlos' }), /maria\.souza.*Maria Souza.*Enf\. Carlos/);
});

test('overdueLoans: só acima de 12 h, mais antigos primeiro', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const at = (h) => new Date(now.getTime() - h * 3600000).toISOString();
  const loans = [
    { tag: 'A', since: at(11.9) },
    { tag: 'B', since: at(12) }, // exatamente 12 h ainda não é "mais de 12 h"
    { tag: 'C', since: at(12.1) },
    { tag: 'D', since: at(40) },
  ];
  assert.deepEqual(overdueLoans(loans, now).map((l) => l.tag), ['D', 'C']);
  assert.equal(LONG_LOAN_HOURS, 12);
  assert.equal(overdueLoans([], now).length, 0);
  // o relógio andando muda o resultado sem recalcular nada
  assert.deepEqual(overdueLoans(loans, new Date(now.getTime() + 3600000)).map((l) => l.tag), ['D', 'C', 'B', 'A']);
});

test('computeStats entrega os empréstimos com a data de retirada', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const stats = computeStats({
    sectors: [{ id: 'uti', name: 'UTI' }],
    assets: [{ tag: 'RAD-0001', name: 'Rádio', category: 'radio', sectorId: 'uti', status: 'in_use', assignedTo: { user: 'Ana', sectorId: 'uti', since: '2026-10-19T08:00:00Z' } }],
    events: [],
    now,
  });
  assert.equal(overdueLoans(stats.activeLoans, now)[0].tag, 'RAD-0001');
});

test('QR Code: link do ativo usa hash (GitHub Pages) e a leitura aceita link, rota e patrimônio puro', () => {
  assert.equal(assetUrl('RAD-0001', 'https://user.github.io/patrimonio/'), 'https://user.github.io/patrimonio/#/ativos/RAD-0001?mover=1');
  assert.equal(tagFromScan('https://user.github.io/patrimonio/#/ativos/RAD-0001?mover=1'), 'RAD-0001');
  assert.equal(tagFromScan('#/ativos/cdr-0042'), 'CDR-0042');
  assert.equal(tagFromScan('/ativos/MON-7'), 'MON-7');
  assert.equal(tagFromScan('  rad-0001 '), 'RAD-0001');
  assert.equal(tagFromScan('https://example.com/qualquer-coisa'), '');
  assert.equal(tagFromScan('x'), '');
  assert.equal(tagFromScan(''), '');
  assert.equal(tagFromScan('#/ativos/%E0%A4%A'), '', 'link com escape inválido não quebra');
  assert.ok(TAG_RE.test('RAD-0001') && !TAG_RE.test('rad 1'));
  // o que a etiqueta grava é o que o leitor entende
  assert.equal(tagFromScan(assetUrl('RAD-0001', 'https://a.b/c/')), 'RAD-0001');
});

test('dayRange: dia inteiro local, lados opcionais, início/fim invertidos', () => {
  const { start, end } = dayRange('2026-10-05', '2026-10-05');
  assert.equal(new Date(start).getHours(), 0);
  assert.equal(new Date(end).getHours(), 23);
  assert.equal(new Date(end).getMinutes(), 59);
  assert.equal(dayRange('', '').start, '');
  assert.equal(dayRange('2026-10-05', '').end, '');
  assert.equal(dayRange('', '2026-10-05').start, '');
  const swapped = dayRange('2026-10-10', '2026-10-01');
  assert.ok(new Date(swapped.start) < new Date(swapped.end));
  assert.equal(new Date(swapped.start).getDate(), 1);
  assert.equal(new Date(swapped.end).getDate(), 10);
  assert.deepEqual(dayRange('lixo', '2026-13-45').start, '');
});

test('modo local: searchMovements filtra por responsável e período', async () => {
  const NOW = new Date('2026-10-20T12:00:00Z');
  const api = createLocalAdapter({ now: () => NOW });
  await api.checkOut('RAD-0001', { user: 'Enf. Carlos', sectorId: 'uti' }).catch(() => {});
  const all = await api.searchMovements({ limit: 500 });
  assert.ok(all.length > 0);
  assert.ok(all.every((e) => e.type === 'checkout' || e.type === 'checkin'));
  assert.ok(all.every((e, i) => i === 0 || all[i - 1].at >= e.at), 'mais recentes primeiro');
  const who = all[0].user;
  const byUser = await api.searchMovements({ q: who.toUpperCase().slice(0, 4), limit: 500 });
  assert.ok(byUser.length > 0 && byUser.every((e) => (e.user ?? '').toLowerCase().includes(who.toLowerCase().slice(0, 4))));
  assert.equal((await api.searchMovements({ q: 'zzzz-ninguem' })).length, 0);
  assert.equal((await api.searchMovements({ from: '2999-01-01' })).length, 0);
  assert.equal((await api.searchMovements({ to: '1999-01-01' })).length, 0);
  assert.equal((await api.searchMovements({ limit: 2 })).length, 2);
  assert.equal((await api.searchMovements({ limit: 2, offset: 2 }))[0].id, all[2].id);
});

test('repositório: dependências do QR Code, SQL e textos exigidos', () => {
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.dependencies['qrcode.react'] && pkg.dependencies['html5-qrcode']);
  assert.equal(INACTIVE_MESSAGE, 'Sua conta está inativa. Entre em contato com o administrador.');
  const sql = read('supabase/schema.sql');
  for (const piece of ['must_change_password', 'is_active', 'admin_set_active', 'actor_username', 'events_fill_actor', 'on_auth_password_changed']) {
    assert.ok(sql.includes(piece), `schema.sql sem ${piece}`);
  }
  const mig = read('supabase/migrations/2026-10-v1.6.0-melhorias.sql');
  for (const piece of ['must_change_password', 'is_active', 'admin_set_active', 'actor_username', 'events_fill_actor', 'drop function if exists public.admin_list_users']) {
    assert.ok(mig.includes(piece), `migração sem ${piece}`);
  }
  assert.ok(read('src/index.css').includes('.print-label'));
});

test('CSV de movimentações inclui "Registrado por"', async () => {
  const { eventColumns } = await import('../src/lib/exports.js');
  const cols = eventColumns({ sectorName: () => 'UTI', getAsset: () => ({ name: 'Rádio' }), describeEvent: () => 'x' });
  const col = cols.find((c) => c.label === 'Registrado por');
  assert.equal(col.value({ actorUsername: 'maria.souza', actorName: 'Maria' }), 'maria.souza');
  assert.equal(col.value({ actorName: 'Maria' }), 'Maria');
  assert.equal(col.value({}), '');
});
