# PatrimônioHosp — Gestão de Ativos Hospitalares

Frontend estático (React + Vite + Tailwind + Lucide) inspirado no Snipe-IT, para gestão de
equipamentos médicos/móveis e de comunicação/TI em ambiente hospitalar.

**Fase 1:** sistema completo funcionando no navegador, com dados salvos em `localStorage` (padrão, sem configuração).
**Fase 2 (implementada nesta versão):** banco online compartilhado (Supabase) com login e permissões por papel.
O modo é escolhido automaticamente: com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` definidas, usa o Supabase; sem elas, usa o `localStorage`.

## O que o sistema faz

- **Dashboard** com métricas clicáveis, gráficos por setor/status, empréstimos ativos e atividade recente.
- **Ativos:** lista densa com busca (ignora acentos), filtros por status/setor/categoria, paginação e CSV;
  cadastro, edição, exclusão (só sem histórico) e página de detalhe com histórico completo.
- **Check-out / Check-in rápido:** retirada com responsável e setor de destino; devolução informando a
  condição (bom estado, precisa de manutenção ou esterilização). Aceita digitar ou escanear o patrimônio.
- **Manutenção e esterilização:** fila com motivo e tempo parado, conclusão e baixa definitiva.
- **Setores e alas:** contagem por status e cadastro de novos setores.
- **Relatórios:** empréstimos prolongados (> 12 h), tempo médio, check-outs por setor e exportação CSV.
- **Configurações:** backup/restauração em JSON, dados de demonstração.
- **Login e papéis** (modo online): administrador, técnico, enfermagem e consulta; a interface esconde o que o perfil não pode fazer e o banco bloqueia de qualquer forma.
- Layout responsivo (menu lateral vira gaveta no celular) e abas sincronizadas entre si.

Regras do ciclo de vida: `Disponível → Em uso → Disponível`, `Disponível/Em uso* → Manutenção → Disponível`
e `Disponível/Manutenção → Baixado` (definitivo). *Ativo em uso precisa de check-in antes.

## Publicar no GitHub Pages (automático)

O repositório tem o fluxo `.github/workflows/deploy.yml`: a cada upload na branch `main`, o GitHub
**instala, testa, compila e publica** o site sozinho. Você só faz upload do código-fonte.

**Configuração única (faça uma vez):**

1. Crie o repositório no GitHub e envie **todo o conteúdo da pasta `patrimonio-main/`** para a raiz dele
   (*Add file → Upload files*; arraste os arquivos e pastas, **incluindo a pasta `.github`**).
2. **Settings → Pages → Build and deployment → Source: `GitHub Actions`** (não use "Deploy from a branch").
3. Aba **Actions**: acompanhe o fluxo "Publicar no GitHub Pages". Quando ficar verde, o endereço
   `https://<usuario>.github.io/<repositorio>/` está no ar (force a atualização com Ctrl+F5).

**Depois disso**, para qualquer alteração: edite os arquivos e faça upload por cima (mesmos nomes). O site
atualiza em 1–3 minutos. Não é preciso rodar `npm run build` nem enviar pasta `docs/`.

> **Pasta `.github` não aparece / não foi enviada?** Em *Add file → Create new file*, digite
> `.github/workflows/deploy.yml` como nome e cole o conteúdo do arquivo `deploy.yml` deste projeto.
> No Mac, use Cmd+Shift+. no Finder para ver pastas que começam com ponto.

> **Tela branca?** Quase sempre é *Source* em "Deploy from a branch": o GitHub publica o código-fonte
> (`index.html` aponta para `/src/main.jsx`, que o navegador não executa). Troque para "GitHub Actions".
> Se existir uma pasta `docs/` antiga no repositório, pode apagá-la.

### Fase 2 (banco online) no site publicado
Em **Settings → Secrets and variables → Actions → aba Variables**, crie `VITE_SUPABASE_URL` e
`VITE_SUPABASE_ANON_KEY` (valores do Supabase; a anon key é pública por desenho). O próximo fluxo já
compila o site conectado ao banco. Sem essas variáveis, o site roda em modo local.

## Desenvolvimento local

Requer Node.js 18+ (recomendado 22; há `.nvmrc`).

```bash
npm install
npm run dev          # desenvolvimento → http://localhost:5173
npm test             # testes: regras, adaptadores local e Supabase, permissões, migração
npm run build        # opcional: gera dist/ para conferir o resultado (não vai para o Git)
npm run preview      # serve o dist/ em http://localhost:4173
```

> **Não abra `index.html` com duplo clique.** Os navegadores bloqueiam módulos JavaScript em `file://`
> (tela branca). Use `npm run dev`, `npm run preview` ou o site publicado.

## Onde ficam os dados (importante)

Na Fase 1, os dados ficam **no navegador de quem usa** (`localStorage`): não são compartilhados entre
pessoas nem entre computadores, e limpar os dados do site apaga tudo. Use **Configurações → Exportar
backup** com frequência. Para uso compartilhado entre a equipe, siga a Fase 2.

## Estrutura

```
.github/workflows/       deploy.yml: testa, compila e publica no GitHub Pages a cada upload
scripts/                 backup-to-sql.mjs: migra o backup JSON da Fase 1 para o Supabase
.env.example             variáveis do Supabase para uso local (copie para .env.local)
public/sw.js             service worker (cache das visitas seguintes)
supabase/                Fase 2: schema.sql (arquivo único e repetível) + testes e mock locais
tests/                   testes automatizados (node --test)
src/
├─ services/             camada de dados — única parte que muda ao trocar de backend (carregada sob demanda)
│  ├─ rules.js           regras puras: ciclo de vida, validações, texto do histórico
│  ├─ localAdapter.js    API de dados sobre localStorage
│  ├─ supabaseAdapter.js API de dados sobre o Supabase (mesmos métodos) + autenticação
│  ├─ supabaseMapping.js linhas do banco ⇄ objetos do app; tradução de erros
│  ├─ patch.js           atualizações incrementais do estado (ativo, eventos, tempo real)
│  ├─ storage.js · seed.js · stats.js · index.js (loadApi)
├─ context/              AuthContext (login/papel), DataContext (dados + ações) e ToastContext
├─ router/               roteador por hash (#/ativos/RAD-0042) e carregamento das páginas (routes.js)
├─ pages/                Dashboard, Ativos, Detalhe, Setores, Check-in/out, Manutenção, Relatórios, Config
├─ components/           layout, dashboard, forms, ui
├─ lib/                  status, formatação, CSV (+ colunas), permissões, download
├─ App.jsx · main.jsx · index.css
```

## Fase 2 — banco de dados

Veja **`FASE-2-SUPABASE.md`** (passo a passo: criar o projeto, rodar `supabase/schema.sql`, criar o administrador, configurar `.env.local` e migrar o backup da Fase 1).

## Solução de problemas

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| Site em branco ou aviso "JavaScript do app não foi encontrado" | Pages com Source "Deploy from a branch" (publica o código-fonte) | Settings → Pages → Source = **GitHub Actions** |
| Site 404 logo após configurar | O fluxo ainda não terminou ou falhou | Aba **Actions**: espere ficar verde; se estiver vermelho, abra o log |
| Fluxo não aparece em Actions | A pasta `.github` não foi enviada | Crie `.github/workflows/deploy.yml` pelo botão *Create new file* (veja acima) |
| Fluxo vermelho em "Testes" | Algum arquivo de `src/` ou `tests/` ficou inconsistente após o upload | Abra o log; reenvie os arquivos citados |
| Mudei o código mas o site não mudou | Upload não chegou na branch `main`, ou o fluxo está rodando | Confira o commit em *Code* e a aba *Actions* |
| Dados "sumiram" | Dados do site foram limpos no navegador, ou outro navegador/computador | Importe um backup em Configurações |
| Erro vermelho na tela ("Erro ao carregar a aplicação") | Exceção em tempo de execução | A mensagem mostra a causa; veja também o console (F12) |
