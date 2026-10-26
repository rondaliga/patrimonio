// Garante a estrutura do repositório para o deploy automático no GitHub Pages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const has = (p) => existsSync(fileURLToPath(new URL(p, root)));

test('fluxo de deploy publica a pasta dist', () => {
  if (!has('.github/workflows/deploy.yml')) return;
  const wf = read('.github/workflows/deploy.yml');
  for (const piece of ['actions/checkout@v4', 'actions/setup-node@v4', 'actions/configure-pages@v5', 'actions/upload-pages-artifact@v3', 'actions/deploy-pages@v4', 'npm run build', 'path: dist', 'pages: write', 'id-token: write']) {
    assert.ok(wf.includes(piece), `deploy.yml sem: ${piece}`);
  }
  assert.ok(wf.includes('branches: [main]'));
});

test('vite usa base relativa (funciona em qualquer subcaminho do Pages)', () => {
  assert.match(read('vite.config.js'), /base: '\.\/'/);
});

test('arquivos essenciais do projeto', () => {
  for (const f of ['index.html', 'package.json', 'tailwind.config.js', 'postcss.config.js', 'src/main.jsx', 'supabase/schema.sql']) {
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

test('segredos não vão para o Git (quando os arquivos de ponto existem)', () => {
  // Arquivos que começam com ponto podem não subir em uploads pelo navegador: só validamos se existirem.
  if (has('.gitignore')) {
    const ig = read('.gitignore');
    for (const p of ['node_modules', 'dist', '.env']) assert.ok(ig.includes(p), p);
  }
  if (has('.env.example')) assert.ok(!/service_role/i.test(read('.env.example')));
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

test('desempenho: páginas em chunks, adaptadores sob demanda e service worker', () => {
  assert.match(read('src/App.jsx'), /lazy\(/);
  const idx = read('src/services/index.js');
  assert.match(idx, /import\('\.\/supabaseAdapter\.js'\)/);
  assert.match(idx, /import\('\.\/localAdapter\.js'\)/);
  assert.doesNotMatch(idx, /^import .*(supabase|localAdapter)/m, 'adaptadores não podem ser importados de forma estática');
  for (const f of ['src/context/AuthContext.jsx', 'src/context/DataContext.jsx']) {
    assert.doesNotMatch(read(f), /services\/index\.js/, `${f} não deve importar o índice dos serviços`);
  }
  assert.match(read('vite.config.js'), /manualChunks/);
  assert.ok(has('public/sw.js'));
});

test('schema.sql: funções de usuários só para o papel admin e fora do alcance do anônimo', () => {
  const sql = read('supabase/schema.sql');
  for (const fn of ['admin_list_users', 'admin_create_user', 'admin_update_user', 'admin_set_password', 'admin_delete_user']) {
    const def = sql.slice(sql.indexOf(`function public.${fn}(`));
    assert.ok(def.includes('security definer'), `${fn}: security definer`);
    assert.ok(def.slice(0, def.indexOf('$$;')).includes("_require_role('admin')"), `${fn}: exige admin`);
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\(`), `${fn}: grant só para authenticated`);
  }
  assert.ok(sql.indexOf('admin_delete_user(p_id uuid)') < sql.indexOf('revoke all on all functions'), 'funções criadas antes do revoke geral');
  assert.match(sql, /_clean_username/);
  assert.match(sql, /profiles_username_unique/);
});

test('tema: script anti-flash no index.html e darkMode por classe no Tailwind', () => {
  assert.match(read('index.html'), /patrimonio-theme/);
  assert.match(read('index.html'), /classList\.add\('dark'\)/);
  assert.match(read('tailwind.config.js'), /darkMode: 'class'/);
});

test('telas novas: rota, menu só para admin e nenhuma tela pede e-mail no login', () => {
  assert.match(read('src/router/routes.js'), /'\/usuarios': 'users'/);
  assert.match(read('src/components/layout/Sidebar.jsx'), /adminOnly: true/);
  assert.ok(!/E-mail/.test(read('src/context/AuthContext.jsx')), 'login por usuário, não por e-mail');
});
