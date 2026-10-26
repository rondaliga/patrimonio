-- =====================================================================
-- PatrimônioHosp — esquema do banco para Supabase (PostgreSQL)
-- Fase 2. ARQUIVO ÚNICO: cole inteiro no SQL Editor do Supabase e clique em Run.
--   * Pode ser executado quantas vezes quiser (não dá erro "already exists").
--   * Antes de rodar, vá até o FINAL do arquivo e troque SEU@EMAIL.COM pelo e-mail do
--     usuário que você criou em Authentication → Users (ele vira administrador).
--     Se o usuário ainda não existe, rode assim mesmo, crie o usuário e rode de novo.
--     (Depois da 1ª execução o login passa a ser por NOME DE USUÁRIO; veja a mensagem "OK: ... agora entra com...".)
--
-- Modelo de segurança:
--   * Todos precisam estar logados (role "authenticated"); "anon" não acessa nada.
--   * Papéis (tabela profiles): admin | tecnico | enfermagem | consulta
--   * Mudanças de estado (retirada, devolução, manutenção, baixa) SÓ acontecem pelas
--     funções RPC abaixo, que validam o ciclo de vida e gravam o histórico na mesma
--     transação. O front-end não consegue alterar status nem apagar o histórico.
-- =====================================================================

-- ---------- Tabelas ----------

create table if not exists public.sectors (
  id   text primary key,
  name text not null check (length(btrim(name)) >= 2)
);
create unique index if not exists sectors_name_unique on public.sectors (lower(btrim(name)));

create table if not exists public.profiles (
  id        uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role      text not null default 'consulta'
            check (role in ('admin', 'tecnico', 'enfermagem', 'consulta'))
);

-- nome de usuário usado no login (o Supabase Auth exige um e-mail; o app usa "usuario@patrimonio.invalid" por baixo)
alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username_unique on public.profiles (lower(username));
do $$ begin
  alter table public.profiles add constraint profiles_username_format
    check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{2,29}$');
exception when duplicate_object then null; end $$;

create table if not exists public.assets (
  tag      text primary key check (tag ~ '^[A-Z0-9][A-Z0-9-]{2,19}$'),
  name     text not null check (length(btrim(name)) >= 2),
  category text not null check (category in
             ('wheelchair','stretcher','infusion_pump','monitor','radio','collector','computer','printer')),
  serial   text not null default '',
  sector_id text not null references public.sectors (id),
  status   text not null default 'available'
           check (status in ('available','in_use','maintenance','retired')),

  -- empréstimo atual (preenchido só quando status = in_use)
  assigned_user      text,
  assigned_sector_id text references public.sectors (id),
  assigned_since     timestamptz,
  assigned_note      text,

  -- manutenção / esterilização atual (status = maintenance)
  maint_kind   text check (maint_kind in ('maintenance','sterilization')),
  maint_reason text,
  maint_since  timestamptz,

  -- baixa (status = retired)
  retired_reason text,
  retired_at     timestamptz,

  notes      text not null default '',
  created_at timestamptz not null default now(),

  -- o banco garante que o estado é coerente, mesmo que o app tenha um bug
  constraint in_use_fields check (
    (status = 'in_use') = (assigned_user is not null and assigned_sector_id is not null and assigned_since is not null)
  ),
  constraint maintenance_fields check (
    (status = 'maintenance') = (maint_kind is not null and maint_reason is not null and maint_since is not null)
  ),
  constraint retired_fields check (
    (status = 'retired') = (retired_reason is not null and retired_at is not null)
  )
);
create index if not exists assets_status_idx on public.assets (status);
create index if not exists assets_sector_idx on public.assets (sector_id);

create table if not exists public.events (
  id        bigint generated always as identity primary key,
  tag       text not null references public.assets (tag) on update cascade on delete cascade,
  type      text not null check (type in
              ('created','edited','checkout','checkin','maintenance','sterilization','restored','retired')),
  at        timestamptz not null default now(),
  actor     uuid default auth.uid(),          -- quem fez (usuário logado)
  user_name text,                              -- responsável pela retirada/devolução
  sector_id text references public.sectors (id) on delete set null,
  kind      text check (kind in ('maintenance','sterilization')),
  condition text check (condition in ('ok','maintenance','sterilization')),
  reason    text,
  note      text
);
create index if not exists events_tag_at_idx on public.events (tag, at desc);
create index if not exists events_at_idx on public.events (at desc);
-- empréstimos ativos (painel) e retiradas por período (relatórios/gráfico semanal)
create index if not exists assets_in_use_idx on public.assets (assigned_since) where status = 'in_use';
create index if not exists events_type_at_idx on public.events (type, at desc);

-- ---------- Papéis ----------

create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

-- todo usuário novo do Supabase Auth ganha um perfil "consulta"
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as
$$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Histórico automático de cadastro/edição ----------

create or replace function public.audit_asset() returns trigger
language plpgsql security definer set search_path = public as
$$
begin
  if tg_op = 'INSERT' then
    insert into public.events (tag, type) values (new.tag, 'created');
  else
    insert into public.events (tag, type) values (new.tag, 'edited');
  end if;
  return null;
end
$$;
drop trigger if exists assets_audit_insert on public.assets;
create trigger assets_audit_insert after insert on public.assets
  for each row execute function public.audit_asset();
drop trigger if exists assets_audit_update on public.assets;
create trigger assets_audit_update after update on public.assets
  for each row
  when (old.name is distinct from new.name or old.category is distinct from new.category
     or old.serial is distinct from new.serial or old.sector_id is distinct from new.sector_id
     or old.notes is distinct from new.notes)
  execute function public.audit_asset();

-- ---------- Funções de movimentação (única porta de entrada para mudar status) ----------

create or replace function public._lock_asset(p_tag text) returns public.assets
language plpgsql security definer set search_path = public as
$$
declare a public.assets;
begin
  select * into a from public.assets where tag = upper(btrim(p_tag)) for update;
  if not found then
    raise exception 'Ativo % não encontrado.', p_tag;
  end if;
  return a;
end
$$;
revoke all on function public._lock_asset(text) from public;

create or replace function public._require_role(variadic roles text[]) returns void
language plpgsql security definer set search_path = public as
$$
begin
  if public.app_role() is null or not (public.app_role() = any (roles)) then
    raise exception 'Sem permissão para esta operação.' using errcode = '42501';
  end if;
end
$$;
revoke all on function public._require_role(text[]) from public;

create or replace function public.checkout_asset(p_tag text, p_user text, p_sector text, p_note text default '')
returns public.assets
language plpgsql security definer set search_path = public as
$$
declare a public.assets;
begin
  perform public._require_role('admin', 'tecnico', 'enfermagem');
  a := public._lock_asset(p_tag);
  if a.status <> 'available' then
    raise exception 'Não é possível registrar a retirada: % está "%".', a.tag, a.status;
  end if;
  if length(btrim(coalesce(p_user, ''))) < 2 then
    raise exception 'Informe quem está retirando.';
  end if;
  if not exists (select 1 from public.sectors where id = p_sector) then
    raise exception 'Escolha o setor de destino.';
  end if;

  update public.assets
     set status = 'in_use', assigned_user = btrim(p_user), assigned_sector_id = p_sector,
         assigned_since = now(), assigned_note = nullif(btrim(coalesce(p_note, '')), '')
   where tag = a.tag
   returning * into a;

  insert into public.events (tag, type, user_name, sector_id, note)
  values (a.tag, 'checkout', a.assigned_user, p_sector, nullif(btrim(coalesce(p_note, '')), ''));
  return a;
end
$$;

create or replace function public.checkin_asset(p_tag text, p_condition text default 'ok', p_note text default '')
returns public.assets
language plpgsql security definer set search_path = public as
$$
declare a public.assets; who text; why text;
begin
  perform public._require_role('admin', 'tecnico', 'enfermagem');
  a := public._lock_asset(p_tag);
  if a.status <> 'in_use' then
    raise exception 'Não é possível registrar a devolução: % está "%".', a.tag, a.status;
  end if;
  if p_condition not in ('ok', 'maintenance', 'sterilization') then
    raise exception 'Condição inválida.';
  end if;
  who := a.assigned_user;

  insert into public.events (tag, type, user_name, sector_id, condition, note)
  values (a.tag, 'checkin', who, a.sector_id, p_condition, nullif(btrim(coalesce(p_note, '')), ''));

  if p_condition = 'ok' then
    update public.assets
       set status = 'available', assigned_user = null, assigned_sector_id = null,
           assigned_since = null, assigned_note = null
     where tag = a.tag returning * into a;
  else
    why := coalesce(nullif(btrim(coalesce(p_note, '')), ''),
                    'Devolvido com necessidade de ' ||
                    case p_condition when 'sterilization' then 'esterilização' else 'manutenção' end);
    update public.assets
       set status = 'maintenance', assigned_user = null, assigned_sector_id = null,
           assigned_since = null, assigned_note = null,
           maint_kind = p_condition, maint_reason = why, maint_since = now()
     where tag = a.tag returning * into a;
    insert into public.events (tag, type, kind, reason) values (a.tag, p_condition, p_condition, why);
  end if;
  return a;
end
$$;

create or replace function public.send_to_maintenance(p_tag text, p_kind text, p_reason text)
returns public.assets
language plpgsql security definer set search_path = public as
$$
declare a public.assets;
begin
  perform public._require_role('admin', 'tecnico');
  a := public._lock_asset(p_tag);
  if a.status <> 'available' then
    raise exception 'Não é possível enviar para manutenção: % está "%". Se estiver em uso, faça a devolução primeiro.', a.tag, a.status;
  end if;
  if p_kind not in ('maintenance', 'sterilization') then
    raise exception 'Escolha manutenção ou esterilização.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Descreva o motivo.';
  end if;
  update public.assets
     set status = 'maintenance', maint_kind = p_kind, maint_reason = btrim(p_reason), maint_since = now()
   where tag = a.tag returning * into a;
  insert into public.events (tag, type, kind, reason) values (a.tag, p_kind, p_kind, btrim(p_reason));
  return a;
end
$$;

create or replace function public.complete_maintenance(p_tag text, p_note text default '')
returns public.assets
language plpgsql security definer set search_path = public as
$$
declare a public.assets; k text;
begin
  perform public._require_role('admin', 'tecnico');
  a := public._lock_asset(p_tag);
  if a.status <> 'maintenance' then
    raise exception 'Não é possível concluir a manutenção: % está "%".', a.tag, a.status;
  end if;
  k := a.maint_kind;
  update public.assets
     set status = 'available', maint_kind = null, maint_reason = null, maint_since = null
   where tag = a.tag returning * into a;
  insert into public.events (tag, type, kind, note)
  values (a.tag, 'restored', k, nullif(btrim(coalesce(p_note, '')), ''));
  return a;
end
$$;

create or replace function public.retire_asset(p_tag text, p_reason text)
returns public.assets
language plpgsql security definer set search_path = public as
$$
declare a public.assets;
begin
  perform public._require_role('admin', 'tecnico');
  a := public._lock_asset(p_tag);
  if a.status not in ('available', 'maintenance') then
    raise exception 'Não é possível dar baixa: % está "%". Se estiver em uso, faça a devolução primeiro.', a.tag, a.status;
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Informe o motivo da baixa.';
  end if;
  update public.assets
     set status = 'retired', maint_kind = null, maint_reason = null, maint_since = null,
         retired_reason = btrim(p_reason), retired_at = now()
   where tag = a.tag returning * into a;
  insert into public.events (tag, type, reason) values (a.tag, 'retired', btrim(p_reason));
  return a;
end
$$;

-- Excluir UM registro do histórico (só administrador). O ativo e a situação atual dele não mudam.
-- O front-end não tem DELETE direto na tabela de eventos: só esta função (que confere o papel).
create or replace function public.delete_event(p_id bigint)
returns bigint
language plpgsql security definer set search_path = public as
$$
declare n bigint;
begin
  perform public._require_role('admin');
  delete from public.events where id = p_id;
  get diagnostics n = row_count;
  return n;
end
$$;

-- ---------- Gestão de usuários (só administrador) ----------
-- O front-end usa a chave pública (anon): ela não pode criar contas no Supabase Auth.
-- Por isso estas funções (security definer, conferem o papel 'admin') criam/alteram contas direto em auth.users.
-- O login é por NOME DE USUÁRIO: internamente a conta recebe o e-mail "usuario@patrimonio.invalid"
-- (domínio reservado, nunca recebe mensagens) e o app faz essa conversão sozinho.

create or replace function public._login_email(p_username text) returns text
language sql immutable as $$ select lower(btrim(p_username)) || '@patrimonio.invalid' $$;

create or replace function public._clean_username(p text) returns text
language plpgsql immutable as
$$
declare u text := lower(btrim(coalesce(p, '')));
begin
  if u !~ '^[a-z0-9][a-z0-9._-]{2,29}$' then
    raise exception 'Nome de usuário inválido: use de 3 a 30 letras minúsculas, números, ponto, hífen ou sublinhado.';
  end if;
  return u;
end
$$;

create or replace function public._check_password(p text) returns void
language plpgsql immutable as
$$
begin
  if length(coalesce(p, '')) < 8 then
    raise exception 'A senha deve ter pelo menos 8 caracteres.';
  end if;
  if length(p) > 72 then
    raise exception 'A senha deve ter no máximo 72 caracteres.';
  end if;
end
$$;

create or replace function public.admin_list_users()
returns table (id uuid, username text, full_name text, role text, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public as
$$
begin
  perform public._require_role('admin');
  return query
    select p.id, p.username, p.full_name, p.role, u.created_at, u.last_sign_in_at
      from public.profiles p
      join auth.users u on u.id = p.id
     order by lower(coalesce(nullif(p.full_name, ''), p.username, '')), p.id;
end
$$;

create or replace function public.admin_create_user(p_username text, p_full_name text, p_role text, p_password text)
returns public.profiles
language plpgsql security definer set search_path = public, extensions as
$$
declare
  v_user  text := public._clean_username(p_username);
  v_name  text := btrim(coalesce(p_full_name, ''));
  v_email text := public._login_email(v_user);
  v_id    uuid := gen_random_uuid();
  v_col   text;
  r       public.profiles;
begin
  perform public._require_role('admin');
  if length(v_name) < 2 then
    raise exception 'Informe o nome completo da pessoa.';
  end if;
  if p_role is null or p_role not in ('admin', 'tecnico', 'enfermagem', 'consulta') then
    raise exception 'Perfil de acesso inválido.';
  end if;
  perform public._check_password(p_password);
  if exists (select 1 from public.profiles where lower(username) = v_user)
     or exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'Já existe um usuário com este nome de usuário.';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', v_name), now(), now()
  );
  -- o GoTrue falha ao ler colunas de token nulas: garante texto vazio nas que existirem nesta versão
  for v_col in
    select column_name from information_schema.columns
     where table_schema = 'auth' and table_name = 'users'
       and column_name in ('confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change',
                           'email_change_token_current', 'phone_change', 'phone_change_token', 'reauthentication_token')
  loop
    execute format('update auth.users set %I = coalesce(%I, '''') where id = $1', v_col, v_col) using v_id;
  end loop;
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (v_id, v_id, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
          'email', v_id::text, now(), now(), now());

  -- o gatilho on_auth_user_created já criou o perfil: completa os dados
  insert into public.profiles (id, full_name, role, username) values (v_id, v_name, p_role, v_user)
  on conflict (id) do update set full_name = excluded.full_name, role = excluded.role, username = excluded.username
  returning * into r;
  return r;
end
$$;

create or replace function public.admin_update_user(p_id uuid, p_full_name text, p_role text)
returns public.profiles
language plpgsql security definer set search_path = public as
$$
declare
  v_name text := btrim(coalesce(p_full_name, ''));
  r public.profiles;
begin
  perform public._require_role('admin');
  if length(v_name) < 2 then
    raise exception 'Informe o nome completo da pessoa.';
  end if;
  if p_role is null or p_role not in ('admin', 'tecnico', 'enfermagem', 'consulta') then
    raise exception 'Perfil de acesso inválido.';
  end if;
  if p_id = auth.uid() and p_role <> 'admin' then
    raise exception 'Você não pode tirar o seu próprio acesso de administrador.';
  end if;
  update public.profiles set full_name = v_name, role = p_role where id = p_id returning * into r;
  if not found then
    raise exception 'Usuário não encontrado.';
  end if;
  return r;
end
$$;

-- Redefine a senha de OUTRA pessoa (a própria senha cada um troca em "Alterar minha senha").
create or replace function public.admin_set_password(p_id uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, extensions as
$$
begin
  perform public._require_role('admin');
  perform public._check_password(p_password);
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_id;
  if not found then
    raise exception 'Usuário não encontrado.';
  end if;
  -- encerra as sessões abertas da pessoa: ela entra de novo com a senha nova
  if p_id <> auth.uid() and to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p_id;
  end if;
end
$$;

create or replace function public.admin_delete_user(p_id uuid)
returns void
language plpgsql security definer set search_path = public as
$$
begin
  perform public._require_role('admin');
  if p_id = auth.uid() then
    raise exception 'Você não pode excluir a sua própria conta.';
  end if;
  delete from auth.users where id = p_id;   -- o perfil some junto (on delete cascade)
  if not found then
    raise exception 'Usuário não encontrado.';
  end if;
end
$$;

-- ---------- Permissões (princípio do menor privilégio) ----------

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;

grant usage on schema public to authenticated;
grant select on public.sectors, public.assets, public.events, public.profiles to authenticated;

-- cadastro/edição: só colunas "cadastrais" (status e histórico ficam fora do alcance direto)
grant insert (tag, name, category, serial, sector_id, notes) on public.assets to authenticated;
grant update (name, category, serial, sector_id, notes)      on public.assets to authenticated;
grant delete on public.assets to authenticated;
grant insert, update, delete on public.sectors to authenticated;
grant update (full_name, role) on public.profiles to authenticated;

grant execute on function public.app_role()                                  to authenticated;
grant execute on function public.checkout_asset(text, text, text, text)     to authenticated;
grant execute on function public.checkin_asset(text, text, text)            to authenticated;
grant execute on function public.send_to_maintenance(text, text, text)      to authenticated;
grant execute on function public.complete_maintenance(text, text)           to authenticated;
grant execute on function public.retire_asset(text, text)                   to authenticated;
grant execute on function public.delete_event(bigint)                       to authenticated;
grant execute on function public.admin_list_users()                          to authenticated;
grant execute on function public.admin_create_user(text, text, text, text)   to authenticated;
grant execute on function public.admin_update_user(uuid, text, text)         to authenticated;
grant execute on function public.admin_set_password(uuid, text)              to authenticated;
grant execute on function public.admin_delete_user(uuid)                     to authenticated;

-- ---------- Row Level Security ----------

alter table public.sectors  enable row level security;
alter table public.profiles enable row level security;
alter table public.assets   enable row level security;
alter table public.events   enable row level security;

drop policy if exists sectors_read on public.sectors;
create policy sectors_read on public.sectors for select to authenticated using (true);
drop policy if exists sectors_admin on public.sectors;
create policy sectors_admin on public.sectors for all    to authenticated
  using ((select public.app_role()) = 'admin') with check ((select public.app_role()) = 'admin');

drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.app_role()) = 'admin');
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
  using ((select public.app_role()) = 'admin') with check ((select public.app_role()) = 'admin');

drop policy if exists assets_read on public.assets;
create policy assets_read on public.assets for select to authenticated using (true);
drop policy if exists assets_insert on public.assets;
create policy assets_insert on public.assets for insert to authenticated
  with check ((select public.app_role()) in ('admin', 'tecnico'));
drop policy if exists assets_update on public.assets;
create policy assets_update on public.assets for update to authenticated
  using ((select public.app_role()) in ('admin', 'tecnico')) with check ((select public.app_role()) in ('admin', 'tecnico'));
-- excluir: só admin, e só ativo sem movimentações reais (igual à regra do app)
drop policy if exists assets_delete on public.assets;
create policy assets_delete on public.assets for delete to authenticated
  using (
    (select public.app_role()) = 'admin'
    and status <> 'in_use'
    and not exists (
      select 1 from public.events e
       where e.tag = assets.tag and e.type not in ('created', 'edited')
    )
  );

drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated using (true);
-- (sem política/grant de INSERT/UPDATE/DELETE: o histórico só é escrito pelas funções acima)

-- ---------- Dados iniciais ----------

insert into public.sectors (id, name) values
  ('uti', 'UTI'),
  ('ps',  'Pronto-Socorro'),
  ('cc',  'Centro Cirúrgico'),
  ('ped', 'Pediatria'),
  ('eng', 'Engenharia Clínica'),
  ('ti',  'TI')
on conflict do nothing;

-- ---------- Administrador ----------
-- >>> Aqui vai o NOME DE USUÁRIO (ou o e-mail antigo) de quem deve ser administrador <<<
-- Depois da primeira execução este bloco só reaplica o papel de administrador a essa pessoa.
-- Para criar e administrar os demais usuários, use a tela "Usuários" do app.

do $$
declare
  v_login text := 'rauancostadev@gmail.com';
  v_id    uuid;
begin
  -- usuários criados antes deste script ganham perfil
  insert into public.profiles (id)
  select id from auth.users
  on conflict (id) do nothing;

  if v_login = 'SEU@EMAIL.COM' then
    raise notice 'ATENÇÃO: nenhum administrador definido. Troque SEU@EMAIL.COM pelo seu usuário (ou e-mail) e rode de novo.';
    return;
  end if;
  select u.id into v_id
    from auth.users u join public.profiles p on p.id = u.id
   where lower(u.email) = lower(btrim(v_login))
      or lower(p.username) = lower(btrim(v_login))
      or lower(u.raw_user_meta_data ->> 'email_original') = lower(btrim(v_login))
   limit 1;
  if v_id is null then
    raise notice 'ATENÇÃO: o usuário % ainda não existe. Crie-o em Authentication → Users e rode este arquivo de novo.', v_login;
  else
    update public.profiles set role = 'admin' where id = v_id;
    raise notice 'OK: % agora é administrador.', v_login;
  end if;
end $$;

-- ---------- Nomes de usuário (login sem e-mail) ----------
-- Contas que já existiam recebem um nome de usuário (a parte do e-mail antes do @) e passam a
-- entrar por ele, com a MESMA senha. Roda uma vez por conta; o e-mail original fica guardado nos
-- metadados. Contas novas criadas pela tela "Usuários" já nascem assim.
do $$
declare
  r record;
  base text; cand text; n int; v_email text;
begin
  for r in
    select p.id, u.email
      from public.profiles p join auth.users u on u.id = p.id
     where p.username is null
     order by u.created_at, u.id
  loop
    base := regexp_replace(lower(split_part(coalesce(r.email, ''), '@', 1)), '[^a-z0-9._-]', '', 'g');
    base := left(regexp_replace(base, '^[^a-z0-9]+', ''), 26);
    if length(base) < 3 then base := 'usuario'; end if;
    cand := base; n := 1;
    while exists (select 1 from public.profiles where lower(username) = cand) loop
      n := n + 1; cand := base || n;
    end loop;

    update public.profiles set username = cand where id = r.id;
    v_email := public._login_email(cand);
    if lower(coalesce(r.email, '')) <> v_email then
      update auth.users
         set email = v_email,
             raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('email_original', r.email),
             updated_at = now()
       where id = r.id;
      update auth.identities
         set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_email))
       where user_id = r.id and provider = 'email';
    end if;
    raise notice 'OK: % agora entra com o nome de usuário "%" (a senha continua a mesma).', coalesce(r.email, r.id::text), cand;
  end loop;
end $$;

-- Tempo real no front-end (idempotente; só age se a publicação do Supabase existir)
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['sectors', 'assets', 'events'] loop
      if not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
