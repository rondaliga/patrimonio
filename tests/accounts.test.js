import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOGIN_DOMAIN, generatePassword, loginEmail, normalizeUsername, usernameFromEmail, validatePassword, validateUsername,
} from '../src/lib/accounts.js';
import { applyTheme, readStoredTheme, resolveTheme, storeTheme, THEME_KEY } from '../src/lib/theme.js';
import { can, ROLES } from '../src/lib/permissions.js';

test('login por usuário vira o e-mail interno; e-mail antigo continua valendo', () => {
  assert.equal(loginEmail('  Maria.Souza '), `maria.souza@${LOGIN_DOMAIN}`);
  assert.equal(loginEmail('Fulano@Gmail.com'), 'fulano@gmail.com');
  assert.equal(usernameFromEmail(`maria.souza@${LOGIN_DOMAIN}`), 'maria.souza');
  assert.equal(usernameFromEmail('fulano@gmail.com'), 'fulano@gmail.com');
  assert.equal(normalizeUsername(' ABC '), 'abc');
});

test('nome de usuário: mesma regra do banco', () => {
  for (const ok of ['abc', 'maria.souza', 'joao_silva-2', 'a'.repeat(30), '0abc']) assert.equal(validateUsername(ok), '', ok);
  for (const bad of ['', 'ab', 'a'.repeat(31), 'joão', 'maria souza', '.abc', '-abc', 'a@b.com', '_abc']) assert.notEqual(validateUsername(bad), '', bad);
  assert.equal(validateUsername('MARIA'), '', 'maiúsculas são normalizadas');
});

test('senha: 8 a 72 caracteres', () => {
  assert.notEqual(validatePassword('1234567'), '');
  assert.equal(validatePassword('12345678'), '');
  assert.equal(validatePassword('x'.repeat(72)), '');
  assert.notEqual(validatePassword('x'.repeat(73)), '');
  assert.notEqual(validatePassword(undefined), '');
});

test('gerar senha: tamanho, sem caracteres ambíguos e válida', () => {
  let i = 0;
  const seq = (n) => (i++ * 7) % n;
  const pw = generatePassword(12, seq);
  assert.equal(pw.length, 12);
  assert.ok(!/[0O1lI]/.test(pw));
  for (let k = 0; k < 200; k++) {
    const g = generatePassword();
    assert.equal(g.length, 12);
    assert.ok(!/[0O1lI]/.test(g));
    assert.equal(validatePassword(g), '');
  }
  assert.notEqual(generatePassword(), generatePassword());
});

test('perfis: consulta aparece como Visualizador e só admin gerencia usuários', () => {
  assert.equal(ROLES.consulta, 'Visualizador');
  assert.equal(ROLES.admin, 'Administrador');
  assert.ok(can('admin', 'user.manage'));
  for (const r of ['tecnico', 'enfermagem', 'consulta']) assert.ok(!can(r, 'user.manage'), r);
});

test('tema: escolha salva vence o sistema; sem escolha segue o sistema', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(readStoredTheme(storage), null);
  assert.equal(resolveTheme(null, true), 'dark');
  assert.equal(resolveTheme(null, false), 'light');
  storeTheme('dark', storage);
  assert.equal(mem.get(THEME_KEY), 'dark');
  assert.equal(readStoredTheme(storage), 'dark');
  assert.equal(resolveTheme(readStoredTheme(storage), false), 'dark');
  mem.set(THEME_KEY, 'lixo');
  assert.equal(readStoredTheme(storage), null, 'valor inválido é ignorado');
  const broken = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
  assert.equal(readStoredTheme(broken), null);
  assert.doesNotThrow(() => storeTheme('light', broken));
});

test('tema: applyTheme liga/desliga a classe dark e o color-scheme', () => {
  const classes = new Set();
  const meta = { v: '', setAttribute(_, v) { this.v = v; } };
  const root = { classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) }, style: {}, ownerDocument: { querySelector: () => meta } };
  applyTheme('dark', root);
  assert.ok(classes.has('dark'));
  assert.equal(root.style.colorScheme, 'dark');
  assert.equal(meta.v, '#020617');
  applyTheme('light', root);
  assert.ok(!classes.has('dark'));
  assert.equal(root.style.colorScheme, 'light');
});
