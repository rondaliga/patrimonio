// Garante a estrutura do repositório para o deploy automático no GitHub Pages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const has = (p) => existsSync(fileURLToPath(new URL(p, root)));

test('fluxo de deploy existe e publica a pasta dist', () => {
  const wf = read('.github/workflows/deploy.yml');
  for (const piece of ['actions/checkout@v4', 'actions/setup-node@v4', 'actions/configure-pages@v5', 'actions/upload-pages-artifact@v3', 'actions/deploy-pages@v4', 'npm run build', 'path: dist', 'pages: write', 'id-token: write']) {
    assert.ok(wf.includes(piece), `deploy.yml sem: ${piece}`);
  }
  assert.ok(wf.includes('branches: [main]'));
});

test('build não depende de pasta docs/ nem de saída manual', () => {
  assert.ok(!has('docs'), 'a pasta docs/ obsoleta não deve existir');
  assert.ok(!/outDir/.test(read('vite.config.js')), 'vite deve usar a saída padrão (dist)');
  assert.match(read('vite.config.js'), /base: '\.\/'/);
});

test('arquivos essenciais do projeto', () => {
  for (const f of ['index.html', 'package.json', 'tailwind.config.js', 'postcss.config.js', 'src/main.jsx', 'supabase/schema.sql', '.gitignore', '.env.example']) {
    assert.ok(has(f), `falta ${f}`);
  }
  assert.match(read('index.html'), /src="\/src\/main\.jsx"/);
});

test('package.json: scripts e dependências do build', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const s of ['dev', 'build', 'preview', 'test']) assert.ok(pkg.scripts[s], `script ${s}`);
  for (const d of ['react', 'react-dom', 'lucide-react', '@supabase/supabase-js']) assert.ok(pkg.dependencies[d], d);
  for (const d of ['vite', '@vitejs/plugin-react', 'tailwindcss', 'postcss', 'autoprefixer']) assert.ok(pkg.devDependencies[d], d);
});

test('segredos não vão para o Git', () => {
  const ig = read('.gitignore');
  for (const p of ['node_modules', 'dist', '.env']) assert.ok(ig.includes(p), p);
  assert.ok(!/service_role/i.test(read('.env.example')));
});

test('todo import relativo de src/ aponta para um arquivo existente', () => {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      statSync(p).isDirectory() ? walk(p) : /\.(jsx?|mjs)$/.test(name) && files.push(p);
    }
  };
  walk(fileURLToPath(new URL('src', root)));
  const missing = [];
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/from '(\.[^']+)'/g)) {
      if (!existsSync(resolve(dirname(f), m[1]))) missing.push(`${f} -> ${m[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});
