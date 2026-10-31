-- Minimal stand-in for the parts of Supabase that our migrations and RLS policies rely on.
-- Used only by the local RLS test database (tests/rls), never applied to a real project.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists auth;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  raw_user_meta_data  jsonb default '{}'::jsonb,
  created_at          timestamptz default now()
);

-- Same definition Supabase uses.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

-- Supabase MFA factors (only the columns our functions read).
create table if not exists auth.mfa_factors (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  factor_type  text not null default 'totp',
  status       text not null default 'unverified'
);

-- Same as Supabase: the whole JWT (tests set `aal` there for two-factor sessions).
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

grant usage on schema public, auth, extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;

-- Supabase's default privileges grant everything on new public tables to the API roles;
-- our migrations must revoke what they do not want, so emulate that default here.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- Realtime: the table whose RLS policies decide who may join private channels, and the
-- function that tells those policies which topic is being joined (Supabase's real schema has
-- more columns; these are the ones policies use). Tests set `realtime.topic` and then try to
-- select / insert, the same check Realtime runs at join time.
create schema if not exists realtime;
create table if not exists realtime.messages (
  id           bigserial primary key,
  topic        text not null,
  extension    text not null,
  payload      jsonb,
  event        text,
  private      boolean default true,
  inserted_at  timestamptz not null default now()
);
alter table realtime.messages enable row level security;
create or replace function realtime.topic() returns text
language sql stable as $$ select nullif(current_setting('realtime.topic', true), '') $$;
grant usage on schema realtime to anon, authenticated, service_role;
grant select, insert on realtime.messages to authenticated;
grant usage on sequence realtime.messages_id_seq to authenticated;
grant execute on function realtime.topic() to anon, authenticated, service_role;
