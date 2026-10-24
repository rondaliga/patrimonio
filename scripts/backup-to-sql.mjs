#!/usr/bin/env node
// Converte um backup JSON da Fase 1 (Configurações → Exportar backup) em um arquivo SQL
// para colar no SQL Editor do Supabase. Preserva status, responsáveis e todo o histórico
// (o front-end não pode gravar eventos, então a migração é feita direto no banco).
//
// Uso: node scripts/backup-to-sql.mjs backup-patrimonio-2026-10-20.json > migracao.sql
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const STATUSES = ['available', 'in_use', 'maintenance', 'retired'];
const q = (v) => (v == null || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const qs = (v) => `'${String(v ?? '').replace(/'/g, "''")}'`; // texto "not null"
const ts = (v) => (v ? `'${new Date(v).toISOString()}'::timestamptz` : 'null');

export function backupToSql(backup) {
  const fail = (m) => {
    throw new Error(`Backup inválido: ${m}`);
  };
  if (!backup || ![backup.sectors, backup.assets, backup.events].every(Array.isArray)) {
    fail('faltam as listas de setores, ativos ou eventos.');
  }
  const sectorIds = new Set(backup.sectors.map((s) => s.id));
  const tags = new Set();
  for (const a of backup.assets) {
    if (!/^[A-Z0-9][A-Z0-9-]{2,19}$/.test(a.tag ?? '')) fail(`patrimônio inválido (${a.tag}).`);
    if (tags.has(a.tag)) fail(`patrimônio duplicado (${a.tag}).`);
    tags.add(a.tag);
    if (!STATUSES.includes(a.status)) fail(`status desconhecido em ${a.tag}.`);
    if (!sectorIds.has(a.sectorId)) fail(`setor inexistente em ${a.tag}.`);
    if (a.status === 'in_use' && !a.assignedTo) fail(`${a.tag} está em uso sem responsável.`);
    if (a.status === 'maintenance' && !a.maintenance) fail(`${a.tag} em manutenção sem motivo.`);
    if (a.status === 'retired' && !a.retired) fail(`${a.tag} baixado sem motivo.`);
  }

  const out = ['-- Migração do backup da Fase 1. Execute uma vez, em banco vazio.', 'begin;'];
  out.push('alter table public.assets disable trigger assets_audit_insert;');

  if (backup.sectors.length) {
    out.push(
      'insert into public.sectors (id, name) values\n' +
        backup.sectors.map((s) => `  (${qs(s.id)}, ${qs(s.name)})`).join(',\n') +
        '\non conflict (id) do nothing;'
    );
  }

  if (backup.assets.length) {
    const rows = backup.assets.map((a) => {
      const u = a.status === 'in_use' ? a.assignedTo : null;
      const m = a.status === 'maintenance' ? a.maintenance : null;
      const r = a.status === 'retired' ? a.retired : null;
      return (
        `  (${qs(a.tag)}, ${qs(a.name)}, ${qs(a.category)}, ${qs(a.serial)}, ${qs(a.sectorId)}, ${qs(a.status)}, ` +
        `${q(u?.user)}, ${q(u?.sectorId)}, ${ts(u?.since)}, ${q(u?.note)}, ` +
        `${q(m?.kind)}, ${q(m?.reason)}, ${ts(m?.since)}, ${q(r?.reason)}, ${ts(r?.at)}, ` +
        `${qs(a.notes)}, ${a.createdAt ? ts(a.createdAt) : 'now()'})`
      );
    });
    out.push(
      'insert into public.assets (tag, name, category, serial, sector_id, status, assigned_user, assigned_sector_id, ' +
        'assigned_since, assigned_note, maint_kind, maint_reason, maint_since, retired_reason, retired_at, notes, created_at) values\n' +
        rows.join(',\n') +
        ';'
    );
  }

  const events = backup.events
    .filter((e) => tags.has(e.tag))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  if (events.length) {
    const rows = events.map(
      (e) =>
        `  (${qs(e.tag)}, ${qs(e.type)}, ${ts(e.at)}, ${q(e.user)}, ${sectorIds.has(e.sectorId) ? q(e.sectorId) : 'null'}, ` +
        `${q(e.kind)}, ${q(e.condition)}, ${q(e.reason)}, ${q(e.note)})`
    );
    out.push(
      'insert into public.events (tag, type, at, user_name, sector_id, kind, condition, reason, note) values\n' +
        rows.join(',\n') +
        ';'
    );
  }

  out.push('alter table public.assets enable trigger assets_audit_insert;', 'commit;', '');
  return out.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.error('Uso: node scripts/backup-to-sql.mjs <backup.json> > migracao.sql');
    process.exit(1);
  }
  try {
    process.stdout.write(backupToSql(JSON.parse(readFileSync(file, 'utf8'))));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
