-- MyNota · Phase 1 · maps and map_members
-- Access model: owner (maps.owner_id), editor / viewer (map_members).
-- Share-link fields (link_token, link_access, link_expires_at) are written only by
-- server-side functions (Phase 5). link_token is readable by nobody through the API;
-- the owner will fetch it through a dedicated function.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.maps (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  subject_id       uuid references public.subjects (id) on delete set null,
  type             text not null,
  title            text not null,
  cover_color      text not null default 'yellow',
  languages        text[] not null default '{}',
  link_token       text,
  link_access      text not null default 'off',
  link_expires_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint maps_type_valid check (type in ('book', 'notes', 'blank')),
  constraint maps_title_length check (char_length(trim(title)) between 1 and 200),
  constraint maps_cover_color_valid
    check (cover_color in ('yellow', 'coral', 'sky', 'mint', 'lavender', 'pink', 'orange', 'lime')),
  constraint maps_languages_count check (cardinality(languages) <= 10),
  constraint maps_link_access_valid check (link_access in ('off', 'view', 'edit')),
  -- >= 32 random bytes, base64url without padding = 43+ chars.
  constraint maps_link_token_format check (link_token is null or link_token ~ '^[A-Za-z0-9_-]{43,}$'),
  constraint maps_link_needs_token check (link_access = 'off' or link_token is not null)
);

create index maps_owner_idx on public.maps (owner_id, updated_at desc);
create index maps_subject_idx on public.maps (subject_id);
create unique index maps_link_token_key on public.maps (link_token) where link_token is not null;

create table public.map_members (
  map_id      uuid not null references public.maps (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null,
  invited_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  added_at    timestamptz not null default now(),

  primary key (map_id, user_id),
  constraint map_members_role_valid check (role in ('editor', 'viewer'))
);

create index map_members_user_idx on public.map_members (user_id);

create trigger maps_set_updated_at
  before update on public.maps
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------

-- 'owner' | 'editor' | 'viewer' | null for the current user. Suspended users get null.
create or replace function public.map_role(target_map uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not public.is_active_user() then null
    when exists (select 1 from public.maps m where m.id = target_map and m.owner_id = (select auth.uid()))
      then 'owner'
    else (
      select mm.role from public.map_members mm
      where mm.map_id = target_map and mm.user_id = (select auth.uid())
    )
  end;
$$;

-- True when the current user and `other` are both on at least one map (owner or member).
create or replace function public.shares_map_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select m.id from public.maps m where m.owner_id = (select auth.uid())
    union
    select mm.map_id from public.map_members mm where mm.user_id = (select auth.uid())
  )
  select exists (
    select 1 from mine
    where exists (select 1 from public.maps m where m.id = mine.id and m.owner_id = other)
       or exists (select 1 from public.map_members mm where mm.map_id = mine.id and mm.user_id = other)
  );
$$;

-- ---------------------------------------------------------------------------
-- Integrity guards
-- ---------------------------------------------------------------------------

create or replace function public.maps_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.owner_id is distinct from old.owner_id then
      raise exception 'owner_id cannot be changed' using errcode = '42501';
    end if;
    -- Only the owner may file the map into one of their subjects.
    if new.subject_id is distinct from old.subject_id and old.owner_id <> (select auth.uid()) then
      raise exception 'only the owner can change the subject' using errcode = '42501';
    end if;
  end if;

  if new.subject_id is not null and not exists (
    select 1 from public.subjects s where s.id = new.subject_id and s.owner_id = new.owner_id
  ) then
    raise exception 'subject does not belong to the map owner' using errcode = '23503';
  end if;

  return new;
end;
$$;

create trigger maps_guard
  before insert or update on public.maps
  for each row execute function public.maps_guard();

create or replace function public.map_members_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.map_id <> old.map_id or new.user_id <> old.user_id) then
    raise exception 'membership keys cannot be changed' using errcode = '42501';
  end if;
  if exists (select 1 from public.maps m where m.id = new.map_id and m.owner_id = new.user_id) then
    raise exception 'the owner cannot also be a member' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger map_members_guard
  before insert or update on public.map_members
  for each row execute function public.map_members_guard();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

alter table public.maps enable row level security;
alter table public.map_members enable row level security;

revoke all on public.maps from anon, authenticated;
revoke all on public.map_members from anon, authenticated;

-- Every column except link_token is readable (clients must list columns explicitly).
grant select (id, owner_id, subject_id, type, title, cover_color, languages,
              link_access, link_expires_at, created_at, updated_at)
  on public.maps to authenticated;
grant insert (id, owner_id, subject_id, type, title, cover_color, languages)
  on public.maps to authenticated;
grant update (subject_id, type, title, cover_color, languages)
  on public.maps to authenticated;
grant delete on public.maps to authenticated;

grant select on public.map_members to authenticated;
grant insert (map_id, user_id, role, invited_by) on public.map_members to authenticated;
grant update (role) on public.map_members to authenticated;
grant delete on public.map_members to authenticated;

-- ---------------------------------------------------------------------------
-- Policies: maps
-- ---------------------------------------------------------------------------

-- The direct owner_id check lets "insert ... returning" work: map_role() is STABLE and
-- cannot see a row inserted by the same statement.
create policy "maps: members read"
  on public.maps for select to authenticated
  using (
    (owner_id = (select auth.uid()) and (select public.is_active_user()))
    or public.map_role(id) is not null
  );

create policy "maps: active users create their own"
  on public.maps for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.is_active_user()));

create policy "maps: owner and editors update"
  on public.maps for update to authenticated
  using (public.map_role(id) in ('owner', 'editor'))
  with check (public.map_role(id) in ('owner', 'editor'));

create policy "maps: owner deletes"
  on public.maps for delete to authenticated
  using (public.map_role(id) = 'owner');

-- ---------------------------------------------------------------------------
-- Policies: map_members
-- ---------------------------------------------------------------------------

create policy "map_members: everyone on the map reads"
  on public.map_members for select to authenticated
  using (public.map_role(map_id) is not null);

create policy "map_members: owner adds"
  on public.map_members for insert to authenticated
  with check (
    public.map_role(map_id) = 'owner'
    and invited_by = (select auth.uid())
  );

create policy "map_members: owner changes roles"
  on public.map_members for update to authenticated
  using (public.map_role(map_id) = 'owner')
  with check (public.map_role(map_id) = 'owner');

create policy "map_members: owner removes, members leave"
  on public.map_members for delete to authenticated
  using (
    public.map_role(map_id) = 'owner'
    or (user_id = (select auth.uid()) and (select public.is_active_user()))
  );

-- ---------------------------------------------------------------------------
-- Policies: collaborators can see each other's profile
-- ---------------------------------------------------------------------------

create policy "profiles: read map collaborators"
  on public.profiles for select to authenticated
  using ((select public.is_active_user()) and public.shares_map_with(id));

revoke execute on function public.map_role(uuid) from public, anon;
revoke execute on function public.shares_map_with(uuid) from public, anon;
revoke execute on function public.maps_guard() from public, anon, authenticated;
revoke execute on function public.map_members_guard() from public, anon, authenticated;
grant execute on function public.map_role(uuid) to authenticated;
grant execute on function public.shares_map_with(uuid) to authenticated;
