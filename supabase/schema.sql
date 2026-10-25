-- =====================================================================
-- PatrimônioHosp — esquema do banco para Supabase (PostgreSQL)
-- Fase 2. ARQUIVO ÚNICO: cole inteiro no SQL Editor do Supabase e clique em Run.
--   * Pode ser executado quantas vezes quiser (não dá erro "already exists").
--   * Antes de rodar, vá até o FINAL do arquivo e troque SEU@EMAIL.COM pelo e-mail do
--     usuário que você criou em Authentication → Users (ele vira administrador).
--     Se o usuário ainda não existe, rode assim mesmo, crie o usuário e rode de novo.
--
-- Modelo de segurança:
--   * Todos precisam estar logados (role "authenticated"); "anon" não acessa nada.
--   * Papéis (tabela profiles): admin | tecnico | enfermagem | consulta
--   * Mudanças de estado (check-out, check-in, manutenção, baixa) SÓ acontecem pelas
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
-- empréstimos ativos (dashboard) e check-outs por período (relatórios/gráfico semanal)
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
    raise exception 'Não é possível fazer check-out: % está "%".', a.tag, a.status;
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
    raise exception 'Não é possível fazer check-in: % está "%".', a.tag, a.status;
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
    raise exception 'Não é possível enviar para manutenção: % está "%". Se estiver em uso, faça o check-in primeiro.', a.tag, a.status;
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
    raise exception 'Não é possível dar baixa: % está "%". Se estiver em uso, faça o check-in primeiro.', a.tag, a.status;
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
-- >>> TROQUE O E-MAIL ABAIXO pelo do seu usuário (mantenha as aspas simples) <<<

do $$
declare
  v_email text := 'rauancostadev@gmail.com';
  v_id    uuid;
begin
  -- usuários criados antes deste script ganham perfil
  insert into public.profiles (id)
  select id from auth.users
  on conflict (id) do nothing;

  if v_email = 'SEU@EMAIL.COM' then
    raise notice 'ATENÇÃO: nenhum administrador definido. Troque SEU@EMAIL.COM pelo seu e-mail e rode de novo.';
    return;
  end if;
  select id into v_id from auth.users where lower(email) = lower(btrim(v_email));
  if v_id is null then
    raise notice 'ATENÇÃO: o usuário % ainda não existe. Crie-o em Authentication → Users e rode este arquivo de novo.', v_email;
  else
    update public.profiles set role = 'admin' where id = v_id;
    raise notice 'OK: % agora é administrador.', v_email;
  end if;
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
