-- Phase 6 · real-time co-editing (docs/features.md › Real-time co-editing, docs/data-model.md).
--
-- Decided 2026-10-31: live edits travel over Supabase Realtime (private Broadcast channels, no
-- separate sync server). Each map has Yjs documents: one per chapter (its sections, blocks and
-- the links inside it) and one book-level document `book` (the book and chapter nodes and links
-- between chapters). Every change is saved here as a Yjs update, so nothing depends on another
-- person being online; an editor's device now and then merges the saved updates into one state
-- (doc_compact). `nodes` / `relations` stay the readable copy for search, flashcards and export.
--
-- Realtime channels (topics), checked by the policies on realtime.messages below:
--   map:<map id>          document changes: everyone on the map receives, owner and editors send
--   map:<map id>:people   presence and cursors: everyone on the map
-- Link visitors who have not joined see a snapshot (decided 2026-10-31: refresh to update).
--
-- After applying: Supabase dashboard › Realtime › Settings › turn OFF "Allow public access",
-- so only private (checked) channels can be joined.
--
-- Error codes: MN400 invalid input · 42501 not allowed

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- The merged state of one document (all updates up to `upto`).
create table public.map_docs (
  map_id      uuid not null references public.maps (id) on delete cascade,
  doc_key     text not null,
  state       bytea not null,
  upto        bigint not null default 0,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),

  primary key (map_id, doc_key),
  constraint map_docs_key_valid check (
    doc_key = 'book' or doc_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  constraint map_docs_state_size check (octet_length(state) <= 20 * 1024 * 1024)
);

-- Changes saved since the last merge, in order.
create table public.map_doc_updates (
  id          bigint generated always as identity primary key,
  map_id      uuid not null references public.maps (id) on delete cascade,
  doc_key     text not null,
  data        bytea not null,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),

  constraint map_doc_updates_key_valid check (
    doc_key = 'book' or doc_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  constraint map_doc_updates_size check (octet_length(data) between 1 and 4 * 1024 * 1024)
);

create index map_doc_updates_doc_idx on public.map_doc_updates (map_id, doc_key, id);

alter table public.map_docs enable row level security;
alter table public.map_doc_updates enable row level security;

revoke all on public.map_docs, public.map_doc_updates from anon, authenticated;
grant select on public.map_docs, public.map_doc_updates to authenticated;
grant insert (map_id, doc_key, data) on public.map_doc_updates to authenticated;

create policy "map_docs: everyone on the map reads" on public.map_docs for select to authenticated
  using (public.map_role(map_id) is not null);
create policy "map_doc_updates: everyone on the map reads" on public.map_doc_updates
  for select to authenticated
  using (public.map_role(map_id) is not null);
create policy "map_doc_updates: owner and editors save changes" on public.map_doc_updates
  for insert to authenticated
  with check (public.map_role(map_id) in ('owner', 'editor') and created_by = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Functions (base64 in and out, so the app does not deal with bytea encoding)
-- ---------------------------------------------------------------------------

-- The saved state and the changes after it, for each requested document that has any.
-- SECURITY INVOKER: the read policies above apply.
create or replace function public.doc_load(p_map uuid, p_keys text[])
returns table (doc_key text, state text, updates text[], upto bigint)
language sql stable security invoker set search_path = '' as $$
  with keys as (select distinct unnest(p_keys) as k)
  select
    keys.k,
    encode(d.state, 'base64'),
    coalesce(
      (select array_agg(encode(u.data, 'base64') order by u.id)
       from public.map_doc_updates u
       where u.map_id = p_map and u.doc_key = keys.k and u.id > coalesce(d.upto, 0)),
      '{}'),
    greatest(
      coalesce(d.upto, 0),
      coalesce((select max(u.id) from public.map_doc_updates u
                where u.map_id = p_map and u.doc_key = keys.k), 0))
  from keys
  left join public.map_docs d on d.map_id = p_map and d.doc_key = keys.k
  where d.map_id is not null
     or exists (select 1 from public.map_doc_updates u where u.map_id = p_map and u.doc_key = keys.k);
$$;

-- Saves one change; returns its number. SECURITY INVOKER: only owner and editors may insert.
create or replace function public.doc_push(p_map uuid, p_key text, p_update text)
returns bigint
language plpgsql volatile security invoker set search_path = '' as $$
declare
  bytes bytea;
  new_id bigint;
begin
  begin
    bytes := decode(p_update, 'base64');
  exception when others then
    raise exception 'update is not base64' using errcode = 'MN400';
  end;
  insert into public.map_doc_updates (map_id, doc_key, data)
  values (p_map, p_key, bytes)
  returning id into new_id;
  return new_id;
end;
$$;

-- Replaces the saved state with a merged one that includes every change up to `p_upto`, and
-- drops those changes. Returns false when someone already merged further (nothing changes).
-- SECURITY DEFINER: clients cannot write map_docs or delete updates directly.
create or replace function public.doc_compact(p_map uuid, p_key text, p_state text, p_upto bigint)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  bytes bytea;
  cur bigint;
begin
  if auth.uid() is null or coalesce(public.map_role(p_map), '') not in ('owner', 'editor') then
    raise exception 'only the owner and editors can do this' using errcode = '42501';
  end if;
  if p_upto is null or p_upto < 0 then
    raise exception 'invalid upto' using errcode = 'MN400';
  end if;
  begin
    bytes := decode(p_state, 'base64');
  exception when others then
    raise exception 'state is not base64' using errcode = 'MN400';
  end;
  if bytes is null or octet_length(bytes) = 0 then
    raise exception 'empty state' using errcode = 'MN400';
  end if;
  -- One merge at a time per document.
  perform pg_advisory_xact_lock(hashtextextended(p_map::text || '/' || p_key, 0));
  select d.upto into cur from public.map_docs d where d.map_id = p_map and d.doc_key = p_key;
  if cur is not null and cur >= p_upto then
    return false;
  end if;
  insert into public.map_docs (map_id, doc_key, state, upto, updated_by, updated_at)
  values (p_map, p_key, bytes, p_upto, auth.uid(), now())
  on conflict (map_id, doc_key) do update
    set state = excluded.state, upto = excluded.upto,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  delete from public.map_doc_updates u
  where u.map_id = p_map and u.doc_key = p_key and u.id <= p_upto;
  return true;
end;
$$;

revoke all on function
  public.doc_load(uuid, text[]), public.doc_push(uuid, text, text),
  public.doc_compact(uuid, text, text, bigint)
  from public, anon;
grant execute on function
  public.doc_load(uuid, text[]), public.doc_push(uuid, text, text),
  public.doc_compact(uuid, text, text, bigint)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime channels
-- ---------------------------------------------------------------------------

-- The map id in a MyNota channel topic (`map:<id>` or `map:<id>:people`), else null.
create or replace function public.live_topic_map(topic text)
returns uuid language sql immutable set search_path = '' as $$
  select case
    when topic ~ '^map:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:people)?$'
      then substr(topic, 5, 36)::uuid
  end;
$$;

grant execute on function public.live_topic_map(text) to authenticated;

-- Supabase checks these when someone joins a private channel (and caches the answer for the
-- connection). RLS on realtime.messages is already on; do not alter that table here.
create policy "mynota live: people on the map receive" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and public.map_role(public.live_topic_map((select realtime.topic()))) is not null
  );

create policy "mynota live: send changes, presence and cursors" on realtime.messages
  for insert to authenticated
  with check (
    case
      -- presence and cursors: everyone on the map
      when (select realtime.topic()) like '%:people' then
        realtime.messages.extension in ('broadcast', 'presence')
        and public.map_role(public.live_topic_map((select realtime.topic()))) is not null
      -- document changes: owner and editors only
      else
        realtime.messages.extension = 'broadcast'
        and public.map_role(public.live_topic_map((select realtime.topic()))) in ('owner', 'editor')
    end
  );
