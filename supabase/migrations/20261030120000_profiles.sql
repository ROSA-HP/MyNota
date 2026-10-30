-- MyNota · Phase 1 · profiles
-- One row per auth user, created automatically on sign-up.
-- Users may edit only their own name, avatar, username, language and theme.
-- role / status / two_factor_enabled are changed only server-side (service role / admin functions).

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  username           text not null,
  name               text not null default '',
  avatar_url         text,
  role               text not null default 'student',
  status             text not null default 'active',
  two_factor_enabled boolean not null default false,
  ui_language        text not null default 'en',
  theme              text not null default 'system',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint profiles_username_format
    check (username ~ '^[a-z][a-z0-9_]{2,23}$'),
  constraint profiles_name_length check (char_length(name) <= 80),
  constraint profiles_avatar_url_https
    check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 2048)),
  constraint profiles_role_valid check (role in ('student', 'admin')),
  constraint profiles_status_valid check (status in ('active', 'suspended')),
  constraint profiles_ui_language_valid check (ui_language in ('en', 'ar', 'de')),
  constraint profiles_theme_valid check (theme in ('light', 'dark', 'system'))
);

-- Usernames are stored lowercase (enforced by the format check), so a plain unique index is case-insensitive.
create unique index profiles_username_key on public.profiles (username);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Role helpers (security definer so policies never recurse into profiles RLS)
-- ---------------------------------------------------------------------------

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- Username availability (used by sign-up and settings before submitting)
-- ---------------------------------------------------------------------------

create or replace function public.username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select candidate ~ '^[a-z][a-z0-9_]{2,23}$'
     and not exists (select 1 from public.profiles p where p.username = candidate);
$$;

-- ---------------------------------------------------------------------------
-- Create a profile for every new auth user
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wanted      text  := lower(coalesce(meta ->> 'username', ''));
  base        text;
  final_name  text;
  final_user  text;
  final_lang  text;
  final_theme text;
  avatar      text;
  attempt     int := 0;
begin
  final_name := left(trim(coalesce(meta ->> 'name', meta ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1))), 80);

  final_lang := coalesce(meta ->> 'ui_language', 'en');
  if final_lang not in ('en', 'ar', 'de') then final_lang := 'en'; end if;

  final_theme := coalesce(meta ->> 'theme', 'system');
  if final_theme not in ('light', 'dark', 'system') then final_theme := 'system'; end if;

  avatar := coalesce(meta ->> 'avatar_url', meta ->> 'picture');
  if avatar is not null and (avatar !~ '^https://' or char_length(avatar) > 2048) then avatar := null; end if;

  if public.username_available(wanted) then
    final_user := wanted;
  elsif wanted <> '' and meta ? 'username' then
    -- An explicitly chosen username that is invalid or taken (lost a race): fail the sign-up
    -- so the user can pick another, instead of silently giving them a different name.
    raise exception 'username_unavailable' using errcode = '23505';
  else
    -- OAuth sign-ups have no username: derive one from the email and add a suffix if needed.
    base := regexp_replace(lower(split_part(coalesce(new.email, ''), '@', 1)), '[^a-z0-9_]', '', 'g');
    if base !~ '^[a-z]' then base := 'user' || base; end if;
    base := left(base, 18);
    if char_length(base) < 3 then base := rpad(base, 3, '0'); end if;
    final_user := base;
    while not public.username_available(final_user) loop
      attempt := attempt + 1;
      final_user := base || '_' || substr(md5(random()::text || clock_timestamp()::text), 1, 4 + least(attempt / 5, 1));
      if attempt > 50 then raise exception 'could not generate username'; end if;
    end loop;
  end if;

  insert into public.profiles (id, username, name, avatar_url, ui_language, theme)
  values (new.id, final_user, final_name, avatar, final_lang, final_theme);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Privileges and Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- Column-level grant: role, status and two_factor_enabled can never be written by users.
grant update (username, name, avatar_url, ui_language, theme) on public.profiles to authenticated;

create policy "profiles: read own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: admins read all"
  on public.profiles for select to authenticated
  using ((select public.is_admin()));

create policy "profiles: update own while active"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) and (select public.is_active_user()))
  with check (id = (select auth.uid()));

-- Functions: lock down then grant only what the client needs.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_active_user() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.username_available(text) from public;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
