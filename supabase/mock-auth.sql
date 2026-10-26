-- Simula o que o Supabase já traz pronto (auth.users, auth.uid(), papéis). SÓ para testes locais — NÃO rode no Supabase.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create schema extensions;
create extension if not exists pgcrypto schema extensions;
create table auth.users (
  instance_id uuid, id uuid primary key default gen_random_uuid(), aud text, role text,
  email text unique, encrypted_password text, email_confirmed_at timestamptz,
  raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}',
  created_at timestamptz default now(), updated_at timestamptz, last_sign_in_at timestamptz,
  confirmation_token text, recovery_token text, email_change_token_new text, email_change text
);
create table auth.identities (
  id uuid primary key, user_id uuid not null references auth.users (id) on delete cascade,
  identity_data jsonb not null, provider text not null, provider_id text not null,
  email text generated always as (lower(identity_data ->> 'email')) stored,
  last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users (id) on delete cascade);
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
-- (publication não necessária no teste)
