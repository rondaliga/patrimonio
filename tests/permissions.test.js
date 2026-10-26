import test from 'node:test';
import assert from 'node:assert/strict';
import { can } from '../src/lib/permissions.js';
import { slugify, fold } from '../src/lib/format.js';

test('permissões espelham as políticas do banco', () => {
  assert.ok(can('admin', 'sector.manage') && can('admin', 'asset.delete'));
  assert.ok(can('tecnico', 'asset.create') && can('tecnico', 'maintenance'));
  assert.ok(!can('tecnico', 'asset.delete') && !can('tecnico', 'sector.manage'));
  assert.ok(can('enfermagem', 'movement'));
  assert.ok(!can('enfermagem', 'maintenance') && !can('enfermagem', 'asset.create'));
  for (const a of ['movement', 'maintenance', 'asset.create', 'asset.edit', 'asset.delete', 'sector.manage']) {
    assert.ok(!can('consulta', a), a);
  }
  assert.ok(can('admin', 'event.delete'));
  for (const r of ['tecnico', 'enfermagem', 'consulta']) assert.ok(!can(r, 'event.delete'), `event.delete ${r}`);
  assert.ok(!can('admin', 'acao-inexistente'));
});

test('slugify e fold ignoram acentos e símbolos', () => {
  assert.equal(slugify('Centro Cirúrgico'), 'centro-cirurgico');
  assert.equal(slugify('  !!  '), 'setor');
  assert.equal(fold('Ação ÁÉ'), 'acao ae');
});
