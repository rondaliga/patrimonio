import test from 'node:test';
import assert from 'node:assert/strict';
import { backupToSql } from '../scripts/backup-to-sql.mjs';
import { buildSeed } from '../src/services/seed.js';

const seed = () => {
  const s = buildSeed(new Date('2026-10-20T12:00:00Z'));
  return { sectors: s.sectors, assets: s.assets, events: s.events };
};

test('gera SQL com todos os ativos e eventos do seed', () => {
  const b = seed();
  const sql = backupToSql(b);
  assert.match(sql, /^-- Migra/);
  assert.match(sql, /begin;[\s\S]*commit;/);
  assert.equal((sql.match(/\n  \('[A-Z]+-\d+', '/g) || []).length, b.assets.length + b.events.length);
});

test('escapa aspas simples', () => {
  const b = seed();
  b.assets[0].name = "Rádio d'água";
  assert.ok(backupToSql(b).includes("Rádio d''água"));
});

test('rejeita backups inconsistentes', () => {
  const b = seed();
  b.assets[1].tag = b.assets[0].tag;
  assert.throws(() => backupToSql(b), /duplicado/);
  assert.throws(() => backupToSql({}), /inválido/);
  const c = seed();
  c.assets[0].sectorId = 'nao-existe';
  assert.throws(() => backupToSql(c), /setor inexistente/);
});
