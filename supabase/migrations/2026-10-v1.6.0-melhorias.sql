-- =====================================================================
-- PatrimônioHosp — migração v1.5.0 -> v1.6.0 (rode UMA vez no SQL Editor do Supabase; pode repetir sem erro)
--   1. Troca de senha obrigatória no primeiro acesso  (profiles.must_change_password)
--   2. Desativar usuários sem excluir                  (profiles.is_active + admin_set_active)
--   3. Autoria visível nas movimentações               (events.actor_username / actor_name)
-- Quem faz instalação NOVA não precisa deste arquivo: o schema.sql já inclui tudo.
-- =====================================================================

-- ---------- 1 e 2: colunas do perfil ----------
-- v1.6.0: conta ativa/inativa (férias, licença — o histórico fica intacto) e troca de senha obrigatória no 1º acesso
alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists must_change_password boolean not null default false;
do $$ begin
  alter table public.profiles add constraint profiles_username_format
    check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{2,29}$');
exception when duplicate_object then null; end $$;

-- ---------- 3: colunas de autoria no histórico ----------
-- v1.6.0: quem registrou a ação (cópia do nome de usuário/nome na hora do registro, para o histórico
-- continuar legível mesmo que a conta seja excluída depois)
alter table public.events add column if not exists actor_username text;
alter table public.events add column if not exists actor_name text;

-- ---------- app_role: conta inativa não tem papel (RLS e funções passam a recusá-la) ----------
create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() and is_active $$;   -- conta inativa = sem papel = sem acesso

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
-- ---------- gatilhos: autoria do evento e fim da senha temporária ----------
-- v1.6.0: preenche quem registrou cada evento (auth.uid() já vale dentro das funções security definer)
create or replace function public._fill_event_actor() returns trigger
language plpgsql security definer set search_path = public as
$$
begin
  if new.actor is null then new.actor := auth.uid(); end if;
  if new.actor is not null and new.actor_username is null and new.actor_name is null then
    select p.username, nullif(btrim(p.full_name), '') into new.actor_username, new.actor_name
      from public.profiles p where p.id = new.actor;
  end if;
  return new;
end
$$;
drop trigger if exists events_fill_actor on public.events;
create trigger events_fill_actor before insert on public.events
  for each row execute function public._fill_event_actor();

-- v1.6.0: a senha só deixa de ser "temporária" quando a PRÓPRIA pessoa realmente a troca
-- (qualquer mudança em auth.users.encrypted_password limpa a marca; admin_set_password a recoloca em seguida)
create or replace function public._password_changed() returns trigger
language plpgsql security definer set search_path = public as
$$
begin
  update public.profiles set must_change_password = false where id = new.id and must_change_password;
  return null;
end
$$;
drop trigger if exists on_auth_password_changed on auth.users;
create trigger on_auth_password_changed
  after update of encrypted_password on auth.users
  for each row when (old.encrypted_password is distinct from new.encrypted_password)
  execute function public._password_changed();

-- ---------- funções de usuários ----------
-- (o tipo de retorno mudou na v1.6.0: é preciso recriar a função)
drop function if exists public.admin_list_users();
create or replace function public.admin_list_users()
returns table (id uuid, username text, full_name text, role text, created_at timestamptz, last_sign_in_at timestamptz,
               is_active boolean, must_change_password boolean)
language plpgsql stable security definer set search_path = public as
$$
begin
  perform public._require_role('admin');
  return query
    select p.id, p.username, p.full_name, p.role, u.created_at, u.last_sign_in_at, p.is_active, p.must_change_password
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
  -- senha definida pelo administrador é temporária: a pessoa troca no primeiro acesso
  insert into public.profiles (id, full_name, role, username, must_change_password) values (v_id, v_name, p_role, v_user, true)
  on conflict (id) do update set full_name = excluded.full_name, role = excluded.role, username = excluded.username,
                                 must_change_password = true
  returning * into r;
  return r;
end
$$;
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
  -- senha definida pelo administrador para OUTRA pessoa é temporária (a troca do gatilho acima já limpou a marca)
  update public.profiles set must_change_password = (p_id <> auth.uid()) where id = p_id;
  -- encerra as sessões abertas da pessoa: ela entra de novo com a senha nova
  if p_id <> auth.uid() and to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p_id;
  end if;
end
$$;
-- Ativa/desativa uma conta SEM apagar nada (histórico e vínculos permanecem).
-- Desativar: (1) app_role() passa a devolver null -> RLS e funções recusam tudo; (2) o Supabase Auth bloqueia o
-- login (banned_until); (3) as sessões abertas são encerradas.
create or replace function public.admin_set_active(p_id uuid, p_active boolean)
returns public.profiles
language plpgsql security definer set search_path = public as
$$
declare r public.profiles;
begin
  perform public._require_role('admin');
  if p_active is null then
    raise exception 'Informe se a conta deve ficar ativa ou inativa.';
  end if;
  if p_id = auth.uid() and not p_active then
    raise exception 'Você não pode desativar a sua própria conta.';
  end if;
  update public.profiles set is_active = p_active where id = p_id returning * into r;
  if not found then
    raise exception 'Usuário não encontrado.';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'auth' and table_name = 'users' and column_name = 'banned_until') then
    execute 'update auth.users set banned_until = $2, updated_at = now() where id = $1'
      using p_id, case when p_active then null else now() + interval '100 years' end;
  end if;
  if not p_active and to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p_id;
  end if;
  return r;
end
$$;

-- ---------- permissões ----------
-- funções novas/recriadas nascem executáveis por todos: fecha e abre só para quem usa
revoke all on function public.admin_list_users()               from public, anon, authenticated;
revoke all on function public.admin_set_active(uuid, boolean)  from public, anon, authenticated;
revoke all on function public._fill_event_actor()              from public, anon, authenticated;
revoke all on function public._password_changed()              from public, anon, authenticated;
grant execute on function public.admin_list_users()               to authenticated;
grant execute on function public.admin_set_active(uuid, boolean)  to authenticated;
-- as funções recriadas acima voltam a ter as permissões padrão do banco: reaplica as que o app usa
grant execute on function public.admin_create_user(text, text, text, text) to authenticated;
grant execute on function public.admin_set_password(uuid, text)            to authenticated;

-- ---------- leitura só para contas ativas ----------
drop policy if exists sectors_read on public.sectors;
create policy sectors_read on public.sectors for select to authenticated using ((select public.app_role()) is not null);
drop policy if exists assets_read on public.assets;
create policy assets_read on public.assets for select to authenticated using ((select public.app_role()) is not null);
drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated using ((select public.app_role()) is not null);

-- ---------- eventos antigos ganham o nome de quem os registrou ----------
-- v1.6.0: eventos antigos ganham o nome de quem os registrou (a coluna `actor` já existia)
update public.events e
   set actor_username = p.username, actor_name = nullif(btrim(p.full_name), '')
  from public.profiles p
 where e.actor = p.id and e.actor_username is null and e.actor_name is null;

select 'OK: migração v1.6.0 aplicada.' as resultado;
