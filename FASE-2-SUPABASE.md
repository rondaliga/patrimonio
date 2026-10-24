# Fase 2 — Conectar ao Supabase

Dados compartilhados entre toda a equipe, com login e permissões por papel, mantendo o site estático
no GitHub Pages. **O código já está pronto**: `supabaseAdapter.js`, tela de login e controle por papel.

## O que existe

- `supabase/schema.sql` (testado em PostgreSQL 16 com `supabase/schema.test.sql`, 44 verificações):
  tabelas `sectors`, `assets`, `events`, `profiles`; estado coerente garantido por CHECK; histórico
  imutável; movimentações atômicas por RPC; RLS com permissões mínimas; tempo real habilitado se disponível.
- `src/services/supabaseAdapter.js`: mesma API do adaptador local, mais `auth` (login/sessão/perfil).
  Lê tudo em páginas de 1000 linhas, traduz erros do banco em mensagens por campo e assina o tempo real.
- `src/context/AuthContext.jsx`: exige login quando o Supabase está configurado e carrega o papel.
- `src/lib/permissions.js`: esconde na interface o que o papel não pode fazer (o banco bloqueia de qualquer forma).
- `scripts/backup-to-sql.mjs`: migra o backup da Fase 1 para o banco.

| Papel | Pode |
| --- | --- |
| `admin` | tudo (inclui setores, exclusões e perfis) |
| `tecnico` | cadastrar/editar ativos, manutenção, baixa, check-in/out |
| `enfermagem` | check-in/out |
| `consulta` | apenas ver |

> O adaptador foi testado com um cliente simulado e o schema com PostgreSQL real, **mas não contra um
> projeto Supabase real**. Rode primeiro em um projeto de teste.

## Passo a passo

1. Crie um projeto em supabase.com (região mais próxima, ex.: South America – São Paulo).
2. **Authentication → Users → Add user → Create new user**: e-mail + senha, marcando **"Auto Confirm User"**.
3. Abra `supabase/schema.sql` em um editor de texto e, perto do **final**, troque `SEU@EMAIL.COM` pelo e-mail do passo 2
   (só na linha `v_email text := '...'`).
4. **SQL Editor → New query** → cole o arquivo **inteiro** → **Run**.
   O arquivo é único e pode ser executado várias vezes sem erro. Ao final, a aba de mensagens mostra
   `OK: ... agora é administrador.` Se mostrar `ATENÇÃO`, siga a mensagem (e-mail não trocado ou usuário inexistente) e rode de novo.
5. Desative o cadastro aberto: **Authentication → Sign In / Providers → Email → desligue "Allow new users to sign up"**.
   Novos usuários nascem com papel `consulta`; promova-os rodando o arquivo com o e-mail deles, ou
   `update public.profiles set role = 'tecnico' where id = '<UUID>';`.
6. Copie **Project URL** e **anon public key** (Project Settings → API).
7. No projeto: `npm install`, copie `.env.example` para `.env.local` e preencha:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
   A *anon key* é pública por desenho — quem protege os dados é o login + RLS. **Nunca** use a
   `service_role key` no front-end.
8. `npm run dev` para testar localmente.
9. Para o site publicado no GitHub Pages: **Settings → Secrets and variables → Actions → Variables** →
   crie `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (mesmos valores). O próximo upload já publica conectado.

## Migrar os dados da Fase 1

1. No sistema antigo: **Configurações → Exportar backup (.json)**.
2. `node scripts/backup-to-sql.mjs backup-patrimonio-AAAA-MM-DD.json > migracao.sql`
3. Cole `migracao.sql` no SQL Editor do Supabase e execute (em banco **vazio**, logo após o `schema.sql`).
   O histórico original é preservado (o front-end não consegue gravar eventos; por isso a migração é por SQL).

## Limitações do modo online

- "Importar backup", "Restaurar demonstração" e "Apagar todos os ativos" não existem (são do modo local).
- Excluir ativo só é permitido ao admin e apenas para ativos sem movimentações; os demais devem ser baixados.

## Cuidados (LGPD e operação)

- O nome de quem retira um ativo é dado pessoal: mantenha login obrigatório e acesso por papéis.
- Defina quem administra os usuários e por quanto tempo o histórico é mantido.
- Configure backups do projeto Supabase e confirme a região e o plano antes de usar em produção.
- Se o hospital exigir dados na rede interna, hospede o mesmo schema em um PostgreSQL próprio com uma
  API — o adaptador continua sendo o único ponto a trocar.
