-- Phase 5 · sharing (docs/features.md › Sharing, docs/security.md).
--
-- Decided 2026-10-31: sharing runs in SECURITY DEFINER Postgres functions (no Edge Functions);
-- an invite waits until the invitee accepts it; invites go to existing accounts only (username
-- or the email of an account), email invites to new people come later.
--
-- Memberships are no longer written directly by clients: they come from invite_respond() or
-- link_join(), and change through member_set_role() / member_remove(), so every change is
-- logged in share_events and rate limited.
--
-- Error codes raised here (PostgREST passes them through as `code`):
--   MN400 invalid input · MN404 not found (map, user, invite, link) · MN409 already done
--   MN410 link turned off or expired · MN429 too many actions, try later · 42501 not allowed

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.map_invites (
  id            uuid primary key default gen_random_uuid(),
  map_id        uuid not null references public.maps (id) on delete cascade,
  invitee_id    uuid not null references public.profiles (id) on delete cascade,
  role          text not null,
  invited_by    uuid references public.profiles (id) on delete set null,
  status        text not null default 'pending',
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,

  constraint map_invites_role_valid check (role in ('editor', 'viewer')),
  constraint map_invites_status_valid check (status in ('pending', 'accepted', 'declined', 'cancelled'))
);

create unique index map_invites_one_pending on public.map_invites (map_id, invitee_id)
  where status = 'pending';
create index map_invites_invitee_idx on public.map_invites (invitee_id, status);

create table public.share_events (
  id              uuid primary key default gen_random_uuid(),
  map_id          uuid references public.maps (id) on delete cascade,
  actor_id        uuid references public.profiles (id) on delete set null,
  action          text not null,
  target_user_id  uuid references public.profiles (id) on delete set null,
  at              timestamptz not null default now(),

  constraint share_events_action_valid check (action in (
    'link_created', 'link_changed', 'link_reset', 'link_joined',
    'invite_sent', 'invite_cancelled', 'invite_accepted', 'invite_declined',
    'member_removed', 'member_left', 'role_changed', 'map_copied', 'map_reported'))
);

create index share_events_map_idx on public.share_events (map_id, at desc);
create index share_events_actor_idx on public.share_events (actor_id, action, at desc);

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  map_id       uuid not null references public.maps (id) on delete cascade,
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  reason       text not null,
  details      text not null default '',
  status       text not null default 'open',
  outcome      text,
  handled_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,

  constraint reports_reason_valid
    check (reason in ('spam', 'inappropriate', 'copyright', 'harmful', 'other')),
  constraint reports_details_length check (char_length(details) <= 1000),
  constraint reports_status_valid check (status in ('open', 'resolved')),
  constraint reports_outcome_length check (outcome is null or char_length(outcome) <= 1000)
);

create unique index reports_one_open on public.reports (map_id, reporter_id) where status = 'open';

alter table public.map_invites enable row level security;
alter table public.share_events enable row level security;
alter table public.reports enable row level security;

revoke all on public.map_invites, public.share_events, public.reports from anon, authenticated;
grant select on public.map_invites, public.share_events, public.reports to authenticated;

create policy "map_invites: owner and invitee read" on public.map_invites for select to authenticated
  using (invitee_id = (select auth.uid()) or public.map_role(map_id) = 'owner');
create policy "share_events: owner and actor read" on public.share_events for select to authenticated
  using (actor_id = (select auth.uid()) or public.map_role(map_id) = 'owner');
create policy "reports: reporter reads own" on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));

-- Memberships change only through the functions below.
drop policy "map_members: owner adds" on public.map_members;
drop policy "map_members: owner changes roles" on public.map_members;
drop policy "map_members: owner removes, members leave" on public.map_members;
revoke insert, update, delete on public.map_members from authenticated;

-- ---------------------------------------------------------------------------
-- Helpers (internal: not callable through the API)
-- ---------------------------------------------------------------------------

create or replace function public.share_fail(code text, msg text)
returns void language plpgsql volatile set search_path = '' as $$
begin
  raise exception '%', msg using errcode = code;
end;
$$;

-- The caller, who must be a signed-in, active user.
create or replace function public.share_actor()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.is_active_user() then
    perform public.share_fail('42501', 'sign in to do this');
  end if;
  return uid;
end;
$$;

-- Raises MN429 when the caller already did `act` `max_count` times within `win`.
create or replace function public.share_limit(act text, max_count integer, win interval)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.share_events e
      where e.actor_id = auth.uid() and e.action = act and e.at > now() - win) >= max_count then
    perform public.share_fail('MN429', 'too many, try again later');
  end if;
end;
$$;

create or replace function public.share_log(p_map uuid, act text, target uuid default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.share_events (map_id, actor_id, action, target_user_id)
  values (p_map, auth.uid(), act, target);
$$;

create or replace function public.share_new_token()
returns text language sql volatile set search_path = '' as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
$$;

create or replace function public.share_require_owner(p_map uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.share_actor();
  if public.map_role(p_map) is distinct from 'owner' then
    perform public.share_fail('42501', 'only the owner can do this');
  end if;
end;
$$;

-- A map reached through a share link: valid, switched on, not expired, owner not suspended.
create or replace function public.share_link_map(p_token text)
returns public.maps language plpgsql stable security definer set search_path = '' as $$
declare m public.maps;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43,}$' then
    perform public.share_fail('MN404', 'link not found');
  end if;
  select * into m from public.maps where link_token = p_token;
  if not found or not exists (select 1 from public.profiles p where p.id = m.owner_id and p.status = 'active') then
    perform public.share_fail('MN404', 'link not found');
  end if;
  if m.link_access = 'off' or (m.link_expires_at is not null and m.link_expires_at <= now()) then
    perform public.share_fail('MN410', 'link is off or expired');
  end if;
  return m;
end;
$$;

-- ---------------------------------------------------------------------------
-- Share link (owner)
-- ---------------------------------------------------------------------------

create or replace function public.share_settings(p_map uuid)
returns table (link_access text, link_token text, link_expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.share_require_owner(p_map);
  return query select m.link_access, m.link_token, m.link_expires_at from public.maps m where m.id = p_map;
end;
$$;

create or replace function public.share_link_set(p_map uuid, p_access text, p_expires_at timestamptz default null)
returns table (link_access text, link_token text, link_expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare had_token boolean;
begin
  perform public.share_require_owner(p_map);
  if p_access not in ('off', 'view', 'edit') then
    perform public.share_fail('MN400', 'access must be off, view or edit');
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    perform public.share_fail('MN400', 'the expiry date must be in the future');
  end if;
  select m.link_token is not null into had_token from public.maps m where m.id = p_map;
  if p_access <> 'off' and not had_token then
    perform public.share_limit('link_created', 20, interval '1 hour');
  end if;
  update public.maps m
     set link_access = p_access,
         link_expires_at = p_expires_at,
         link_token = case when p_access <> 'off' and m.link_token is null
                           then public.share_new_token() else m.link_token end
   where m.id = p_map;
  perform public.share_log(p_map, case when p_access <> 'off' and not had_token
                                       then 'link_created' else 'link_changed' end);
  return query select m.link_access, m.link_token, m.link_expires_at from public.maps m where m.id = p_map;
end;
$$;

-- A new secret: the old link stops working at once.
create or replace function public.share_link_reset(p_map uuid)
returns table (link_access text, link_token text, link_expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.share_require_owner(p_map);
  perform public.share_limit('link_reset', 10, interval '1 hour');
  update public.maps m set link_token = public.share_new_token() where m.id = p_map;
  perform public.share_log(p_map, 'link_reset');
  return query select m.link_access, m.link_token, m.link_expires_at from public.maps m where m.id = p_map;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invites and members
-- ---------------------------------------------------------------------------

-- Invite by username (with or without @) or by the email of an existing account.
create or replace function public.invite_member(p_map uuid, p_who text, p_role text)
returns table (invite_id uuid, invitee_id uuid, username text, name text)
language plpgsql security definer set search_path = '' as $$
declare
  who text := lower(btrim(coalesce(p_who, '')));
  target public.profiles;
  inv uuid;
begin
  perform public.share_require_owner(p_map);
  if p_role not in ('editor', 'viewer') then
    perform public.share_fail('MN400', 'role must be editor or viewer');
  end if;
  perform public.share_limit('invite_sent', 30, interval '1 hour');
  if position('@' in who) > 1 then
    select p.* into target from public.profiles p join auth.users u on u.id = p.id
     where lower(u.email) = who;
  else
    select p.* into target from public.profiles p where p.username = ltrim(who, '@');
  end if;
  if target.id is null or target.status <> 'active' then
    perform public.share_fail('MN404', 'no MyNota account with that username or email');
  end if;
  if target.id = auth.uid() then
    perform public.share_fail('MN400', 'you own this map');
  end if;
  if exists (select 1 from public.map_members mm where mm.map_id = p_map and mm.user_id = target.id) then
    perform public.share_fail('MN409', 'already on this map');
  end if;
  -- A second invite to the same person updates the role of the pending one.
  update public.map_invites i set role = p_role
   where i.map_id = p_map and i.invitee_id = target.id and i.status = 'pending'
   returning i.id into inv;
  if inv is null then
    insert into public.map_invites (map_id, invitee_id, role, invited_by)
    values (p_map, target.id, p_role, auth.uid()) returning id into inv;
  end if;
  perform public.share_log(p_map, 'invite_sent', target.id);
  return query select inv, target.id, target.username, target.name;
end;
$$;

create or replace function public.invite_cancel(p_invite uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.map_invites;
begin
  select * into i from public.map_invites where id = p_invite;
  if not found then perform public.share_fail('MN404', 'invite not found'); end if;
  perform public.share_require_owner(i.map_id);
  if i.status <> 'pending' then perform public.share_fail('MN409', 'invite already answered'); end if;
  update public.map_invites set status = 'cancelled', responded_at = now() where id = p_invite;
  perform public.share_log(i.map_id, 'invite_cancelled', i.invitee_id);
end;
$$;

-- The invitee answers; accepting adds them to the map with the invited role.
create or replace function public.invite_respond(p_invite uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.share_actor();
  i public.map_invites;
begin
  select * into i from public.map_invites where id = p_invite and invitee_id = uid;
  if not found then perform public.share_fail('MN404', 'invite not found'); end if;
  if i.status <> 'pending' then perform public.share_fail('MN409', 'invite already answered'); end if;
  update public.map_invites
     set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
   where id = p_invite;
  if p_accept then
    insert into public.map_members (map_id, user_id, role, invited_by)
    values (i.map_id, uid, i.role, i.invited_by)
    on conflict (map_id, user_id) do update set role = excluded.role;
  end if;
  perform public.share_log(i.map_id, case when p_accept then 'invite_accepted' else 'invite_declined' end, uid);
  return i.map_id;
end;
$$;

create or replace function public.member_set_role(p_map uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.share_require_owner(p_map);
  if p_role not in ('editor', 'viewer') then
    perform public.share_fail('MN400', 'role must be editor or viewer');
  end if;
  update public.map_members set role = p_role where map_id = p_map and user_id = p_user;
  if not found then perform public.share_fail('MN404', 'not a member'); end if;
  perform public.share_log(p_map, 'role_changed', p_user);
end;
$$;

-- The owner removes someone, or a member leaves (p_user = themselves).
create or replace function public.member_remove(p_map uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.share_actor();
begin
  if p_user <> uid and public.map_role(p_map) is distinct from 'owner' then
    perform public.share_fail('42501', 'only the owner can remove others');
  end if;
  delete from public.map_members where map_id = p_map and user_id = p_user;
  if not found then perform public.share_fail('MN404', 'not a member'); end if;
  perform public.share_log(p_map, case when p_user = uid then 'member_left' else 'member_removed' end, p_user);
end;
$$;

-- Everyone on a map (owner first), and for the owner also the pending invites.
create or replace function public.map_people(p_map uuid)
returns table (
  kind text, user_id uuid, username text, name text, avatar_url text,
  role text, invite_id uuid, since timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare me text;
begin
  perform public.share_actor();
  me := public.map_role(p_map);
  if me is null then perform public.share_fail('42501', 'not on this map'); end if;
  return query
    select 'owner'::text, p.id, p.username, p.name, p.avatar_url, 'owner'::text, null::uuid, m.created_at
      from public.maps m join public.profiles p on p.id = m.owner_id where m.id = p_map
    union all
    select 'member', p.id, p.username, p.name, p.avatar_url, mm.role, null::uuid, mm.added_at
      from public.map_members mm join public.profiles p on p.id = mm.user_id where mm.map_id = p_map
    union all
    select 'invite', p.id, p.username, p.name, p.avatar_url, i.role, i.id, i.created_at
      from public.map_invites i join public.profiles p on p.id = i.invitee_id
     where me = 'owner' and i.map_id = p_map and i.status = 'pending';
end;
$$;

-- Invites waiting for the caller's answer.
create or replace function public.my_invites()
returns table (
  invite_id uuid, map_id uuid, map_title text, map_type text, cover_color text, role text,
  inviter_username text, inviter_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.share_actor();
begin
  return query
    select i.id, m.id, m.title, m.type, m.cover_color, i.role, p.username, p.name, i.created_at
      from public.map_invites i
      join public.maps m on m.id = i.map_id
      left join public.profiles p on p.id = i.invited_by
     where i.invitee_id = uid and i.status = 'pending'
     order by i.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Share links: open (anyone), join (signed in, edit links)
-- ---------------------------------------------------------------------------

-- The map behind a link, read only: its blocks, accepted links and source text.
create or replace function public.link_open(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  m public.maps := public.share_link_map(p_token);
begin
  return jsonb_build_object(
    'map', jsonb_build_object(
      'id', m.id, 'title', m.title, 'type', m.type, 'cover_color', m.cover_color,
      'languages', m.languages, 'updated_at', m.updated_at, 'created_at', m.created_at),
    'access', m.link_access,
    'owner', (select jsonb_build_object('username', p.username, 'name', p.name)
                from public.profiles p where p.id = m.owner_id),
    'role', case when auth.uid() is null then null else public.map_role(m.id) end,
    'nodes', coalesce((select jsonb_agg(to_jsonb(n) - 'search_text' - 'search_fts' order by n.sort_order)
                         from public.nodes n where n.map_id = m.id), '[]'::jsonb),
    'relations', coalesce((select jsonb_agg(to_jsonb(r))
                             from public.relations r where r.map_id = m.id and r.status = 'accepted'), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(to_jsonb(s) - 'search_text')
                           from public.sources s where s.map_id = m.id), '[]'::jsonb));
end;
$$;

-- Signed in on an edit link: become an editor (viewers on the map are upgraded).
create or replace function public.link_join(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.share_actor();
  m public.maps := public.share_link_map(p_token);
begin
  if m.link_access <> 'edit' then
    perform public.share_fail('42501', 'this link is view only');
  end if;
  if m.owner_id <> uid then
    insert into public.map_members (map_id, user_id, role, invited_by)
    values (m.id, uid, 'editor', m.owner_id)
    on conflict (map_id, user_id) do update set role = 'editor';
    update public.map_invites set status = 'accepted', responded_at = now()
     where map_id = m.id and invitee_id = uid and status = 'pending';
    perform public.share_log(m.id, 'link_joined', uid);
  end if;
  return m.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Copy to my library, report
-- ---------------------------------------------------------------------------

-- A full copy (blocks, accepted links, source text) owned by the caller. Cards are made again
-- by the app from the copied blocks; study progress is never copied.
create or replace function public.copy_map(p_map uuid default null, p_token text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.share_actor();
  src public.maps;
  copy_id uuid := gen_random_uuid();
  copied integer;
begin
  if p_token is not null then
    src := public.share_link_map(p_token);
  else
    select * into src from public.maps where id = p_map;
    if not found or public.map_role(p_map) is null then
      perform public.share_fail('MN404', 'map not found');
    end if;
  end if;
  perform public.share_limit('map_copied', 20, interval '1 hour');

  insert into public.maps (id, owner_id, type, title, cover_color, languages)
  values (copy_id, uid, src.type, left(src.title, 200), src.cover_color, src.languages);

  with ids as materialized (
    select n.id as old_id, gen_random_uuid() as new_id from public.nodes n where n.map_id = src.id
  ),
  n_ins as (
    insert into public.nodes (
      id, map_id, parent_id, sort_order, level, title, summary, type, icon, color, importance,
      details, lang, dir, branch_view, position, size, collapsed, source, ai_added,
      ai_added_reason, origin, created_by)
    select i.new_id, copy_id, p.new_id, n.sort_order, n.level, n.title, n.summary, n.type, n.icon,
           n.color, n.importance, n.details, n.lang, n.dir, n.branch_view, n.position, n.size,
           n.collapsed, n.source, n.ai_added, n.ai_added_reason, n.origin, uid
      from public.nodes n
      join ids i on i.old_id = n.id
      left join ids p on p.old_id = n.parent_id
    returning 1
  ),
  r_ins as (
    insert into public.relations (map_id, from_node, to_node, type, label, direction, status,
                                  confidence, origin, created_by)
    select copy_id, f.new_id, t.new_id, r.type, r.label, r.direction, r.status, r.confidence, r.origin, uid
      from public.relations r
      join ids f on f.old_id = r.from_node
      join ids t on t.old_id = r.to_node
     where r.map_id = src.id and r.status = 'accepted'
    returning 1
  ),
  s_ins as (
    insert into public.sources (map_id, chapter_node_id, kind, pages, paragraphs,
                                file_name, file_size, file_hash, created_by)
    select copy_id, c.new_id, s.kind, s.pages, s.paragraphs, s.file_name, s.file_size, s.file_hash, uid
      from public.sources s
      left join ids c on c.old_id = s.chapter_node_id
     where s.map_id = src.id
    returning 1
  )
  select (select count(*) from n_ins) + (select count(*) from r_ins) + (select count(*) from s_ins)
    into copied;

  perform public.share_log(src.id, 'map_copied');
  return copy_id;
end;
$$;

create or replace function public.report_map(
  p_reason text, p_details text default '', p_map uuid default null, p_token text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.share_actor();
  target uuid;
  rid uuid;
begin
  if p_token is not null then
    target := (public.share_link_map(p_token)).id;
  else
    if public.map_role(p_map) is null then perform public.share_fail('MN404', 'map not found'); end if;
    target := p_map;
  end if;
  if public.map_role(target) = 'owner' then
    perform public.share_fail('MN400', 'you cannot report your own map');
  end if;
  if p_reason not in ('spam', 'inappropriate', 'copyright', 'harmful', 'other') then
    perform public.share_fail('MN400', 'unknown reason');
  end if;
  perform public.share_limit('map_reported', 5, interval '1 day');
  if exists (select 1 from public.reports r where r.map_id = target and r.reporter_id = uid and r.status = 'open') then
    perform public.share_fail('MN409', 'already reported');
  end if;
  insert into public.reports (map_id, reporter_id, reason, details)
  values (target, uid, p_reason, left(coalesce(p_details, ''), 1000)) returning id into rid;
  perform public.share_log(target, 'map_reported');
  return rid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke all on function
  public.share_fail(text, text), public.share_actor(), public.share_limit(text, integer, interval),
  public.share_log(uuid, text, uuid), public.share_new_token(), public.share_require_owner(uuid),
  public.share_link_map(text)
  from public, anon, authenticated;

revoke all on function
  public.share_settings(uuid), public.share_link_set(uuid, text, timestamptz),
  public.share_link_reset(uuid), public.invite_member(uuid, text, text), public.invite_cancel(uuid),
  public.invite_respond(uuid, boolean), public.member_set_role(uuid, uuid, text),
  public.member_remove(uuid, uuid), public.map_people(uuid), public.my_invites(),
  public.link_open(text), public.link_join(text), public.copy_map(uuid, text),
  public.report_map(text, text, uuid, text)
  from public, anon;

grant execute on function
  public.share_settings(uuid), public.share_link_set(uuid, text, timestamptz),
  public.share_link_reset(uuid), public.invite_member(uuid, text, text), public.invite_cancel(uuid),
  public.invite_respond(uuid, boolean), public.member_set_role(uuid, uuid, text),
  public.member_remove(uuid, uuid), public.map_people(uuid), public.my_invites(),
  public.link_open(text), public.link_join(text), public.copy_map(uuid, text),
  public.report_map(text, text, uuid, text)
  to authenticated;

-- Opening a link works without an account.
grant execute on function public.link_open(text) to anon;
