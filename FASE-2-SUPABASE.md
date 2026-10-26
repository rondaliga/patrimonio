# Fase 2 — Conectar ao Supabase

Dados compartilhados entre toda a equipe, com login e permissões por papel, mantendo o site estático
no GitHub Pages. **O código já está pronto**: `supabaseAdapter.js`, tela de login e controle por papel.

## O que existe

- `supabase/schema.sql` (testado em PostgreSQL 16 com `supabase/schema.test.sql`, 44 verificações):
  tabelas `sectors`, `assets`, `events`, `profiles`; estado coerente garantido por CHECK; histórico
  imutável; movimentações atômicas por RPC; RLS com permissões mínimas; tempo real habilitado se disponível.
- `src/services/supabaseAdapter.js`: mesma API do adaptador local, mais `auth` (login/sessão/perfil).
  Lê ativos e os eventos dos últimos 60 dias em páginas de 1000 linhas (o histórico completo de cada ativo e a exportação são buscados sob demanda), traduz erros do banco em mensagens por campo e assina o tempo real (aplicando só a linha que mudou).
- `src/context/AuthContext.jsx`: exige login quando o Supabase está configurado e carrega o papel.
- `src/lib/permissions.js`: esconde na interface o que o papel não pode fazer (o banco bloqueia de qualquer forma).
- `scripts/backup-to-sql.mjs`: migra o backup da Fase 1 para o banco.

| Papel | Pode |
| --- | --- |
| `admin` | tudo (inclui setores, exclusões, histórico e usuários) |
| `tecnico` | cadastrar/editar ativos, manutenção, baixa, retirada/devolução |
| `enfermagem` | retirada/devolução |
| `consulta` (aparece como **Visualizador**) | apenas ver |

> O adaptador foi testado com um cliente simulado e o schema com PostgreSQL real, **mas não contra um
> projeto Supabase real**. Rode primeiro em um projeto de teste.

## Passo a passo

1. Crie um projeto em supabase.com (região mais próxima, ex.: South America – São Paulo).
2. **Authentication → Users → Add user → Create new user**: e-mail + senha, marcando **"Auto Confirm User"**.
   Este é só o primeiro administrador; as demais contas são criadas pelo próprio app (tela **Usuários**).
3. Abra `supabase/schema.sql` em um editor de texto e, perto do **final**, troque `SEU@EMAIL.COM` pelo e-mail do passo 2
   (só na linha `v_login text := '...'`).
4. **SQL Editor → New query** → cole o arquivo **inteiro** → **Run**.
   O arquivo é único e pode ser executado várias vezes sem erro. Ao final, a aba de mensagens mostra
   `OK: ... agora é administrador.` e `OK: ... agora entra com o nome de usuário "...".` Se mostrar `ATENÇÃO`, siga a mensagem (e-mail não trocado ou usuário inexistente) e rode de novo.
   **O login do app é por nome de usuário, não por e-mail.** Contas que já existiam recebem como usuário a parte do e-mail antes do `@`
   (ex.: `maria@gmail.com` → `maria`), com a mesma senha. Por baixo, o Supabase guarda `usuario@patrimonio.invalid`
   (domínio reservado que nunca recebe mensagens); é normal ver isso em Authentication → Users.
5. Desative o cadastro aberto: **Authentication → Sign In / Providers → Email → desligue "Allow new users to sign up"**.
   Crie e administre as contas da equipe em **Usuários** (menu, só administrador): nome, usuário, perfil
   (Administrador, Técnico, Enfermagem ou Visualizador) e senha inicial; depois dá para editar o perfil,
   redefinir a senha de qualquer pessoa e excluir contas. Cada pessoa troca a própria senha pelo ícone de chave no topo.
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
- Excluir um registro do histórico (lixeira ao lado de cada registro) só é permitido ao admin e passa pela função `delete_event` do banco (o front-end não tem DELETE direto em `events`). **Rode o `schema.sql` de novo para criá-la**; sem isso o app avisa que o banco não tem a função.
- Excluir ativo só é permitido ao admin e apenas para ativos sem movimentações; os demais devem ser baixados.

## Cuidados (LGPD e operação)

- O nome de quem retira um ativo é dado pessoal: mantenha login obrigatório e acesso por papéis.
- Defina quem administra os usuários e por quanto tempo o histórico é mantido.
- Configure backups do projeto Supabase e confirme a região e o plano antes de usar em produção.
- Se o hospital exigir dados na rede interna, hospede o mesmo schema em um PostgreSQL próprio com uma
  API — o adaptador continua sendo o único ponto a trocar.

## Usuários e senhas (como funciona)

- O front-end só tem a chave pública, que não cria contas no Supabase Auth. Por isso as contas são criadas pelas funções
  `admin_create_user`, `admin_update_user`, `admin_set_password`, `admin_delete_user` e `admin_list_users` do `schema.sql`:
  todas conferem que quem chama é `admin` e gravam em `auth.users` (senha com bcrypt). **Rode o `schema.sql` de novo ao atualizar.**
- Regras: usuário de 3 a 30 caracteres (minúsculas, números, `.`, `-`, `_`); senha de 8 a 72 caracteres; o administrador não pode
  excluir a própria conta nem tirar o próprio perfil de administrador (evita ficar sem ninguém no comando).
- Redefinir a senha de alguém encerra as sessões abertas dessa pessoa. A própria senha é trocada com confirmação da senha atual.
- **Teste antes de usar de verdade:** a criação de contas escreve direto nas tabelas do Auth (jeito que não depende de nenhum servidor
  extra). Foi testada em PostgreSQL real com uma cópia simulada dessas tabelas, mas não contra o GoTrue de um projeto Supabase real.
  Crie um usuário de teste, entre com ele e confira. Se algo falhar, crie a conta pelo painel (Authentication → Users) usando o e-mail
  `usuario@patrimonio.invalid` e ajuste o perfil em **Usuários**.
- Sem e-mail não há "esqueci minha senha": quem esquecer pede ao administrador (ícone de chave na linha da pessoa).
