-- MyNota · Phase 1 · subjects
-- Private folders that group a user's maps. Only the owner can see or change them.
-- Note: the brief's "order" column is named sort_order ("order" is a reserved word in SQL).

create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name        text not null,
  color       text not null default 'yellow',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint subjects_name_length check (char_length(trim(name)) between 1 and 80),
  constraint subjects_color_valid
    check (color in ('yellow', 'coral', 'sky', 'mint', 'lavender', 'pink', 'orange', 'lime'))
);

create index subjects_owner_idx on public.subjects (owner_id, sort_order);

create trigger subjects_set_updated_at
  before update on public.subjects
  for each row execute function public.set_updated_at();

-- owner_id can never be reassigned.
create or replace function public.subjects_guard_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger subjects_guard_owner
  before update on public.subjects
  for each row execute function public.subjects_guard_owner();

alter table public.subjects enable row level security;

revoke all on public.subjects from anon, authenticated;
grant select, insert, update, delete on public.subjects to authenticated;

create policy "subjects: owner reads"
  on public.subjects for select to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_active_user()));

create policy "subjects: owner inserts"
  on public.subjects for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.is_active_user()));

create policy "subjects: owner updates"
  on public.subjects for update to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_active_user()))
  with check (owner_id = (select auth.uid()));

create policy "subjects: owner deletes"
  on public.subjects for delete to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_active_user()));

revoke execute on function public.subjects_guard_owner() from public, anon, authenticated;
