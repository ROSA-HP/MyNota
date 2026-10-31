-- Phase 7.1 · admin (docs/features.md › Admin dashboard, docs/security.md, docs/data-model.md).
--
-- Admins work only through the SECURITY DEFINER functions below. Each one checks, in the
-- database, that the caller is an active admin AND signed in with a second factor (the JWT's
-- `aal` claim is `aal2`); a hidden page is never the only protection. Every admin action, and
-- every admin view of map content, is written to `audit_log`.
--
-- Error codes: MN400 invalid input · MN404 not found · 42501 not allowed

-- ---------------------------------------------------------------------------
-- Who is an admin right now
-- ---------------------------------------------------------------------------

-- An active admin whose session passed two-factor sign-in.
create or replace function public.admin_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
$$;

create or replace function public.admin_require()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.admin_ok() then
    raise exception 'admins only (with two-factor sign-in)' using errcode = '42501';
  end if;
end;
$$;

-- Reading every profile now also needs the second factor.
drop policy "profiles: admins read all" on public.profiles;
create policy "profiles: admins read all" on public.profiles for select to authenticated
  using ((select public.admin_ok()));

-- Banned: like suspended, but meant to be permanent (sign-in is also blocked by the
-- admin-users Edge Function). `is_active_user()` already treats both as inactive.
alter table public.profiles drop constraint profiles_status_valid;
alter table public.profiles add constraint profiles_status_valid
  check (status in ('active', 'suspended', 'banned'));

-- profiles.two_factor_enabled follows the account's verified authenticator apps (Supabase MFA).
-- Called by the app after turning two-factor sign-in on or off; it only reads auth.mfa_factors,
-- so nobody can mark themselves as protected without a verified factor.
create or replace function public.two_factor_sync()
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  enabled boolean;
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select exists (select 1 from auth.mfa_factors f where f.user_id = me and f.status::text = 'verified')
    into enabled;
  update public.profiles p set two_factor_enabled = enabled
  where p.id = me and p.two_factor_enabled is distinct from enabled;
  return enabled;
end;
$$;

revoke all on function public.two_factor_sync() from public, anon;
grant execute on function public.two_factor_sync() to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.profiles (id) on delete set null,
  action       text not null,
  target_type  text not null,
  target_id    text,
  reason       text not null default '',
  details      jsonb not null default '{}'::jsonb,
  at           timestamptz not null default now(),

  constraint audit_log_action_length check (char_length(action) between 1 and 60),
  constraint audit_log_target_type_valid
    check (target_type in ('user', 'map', 'report', 'setting', 'share')),
  constraint audit_log_reason_length check (char_length(reason) <= 500)
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_target_idx on public.audit_log (target_type, target_id, at desc);

-- Sign-in attempts. Written by the auth-events Edge Function (service role); the IP address is
-- never stored, only a salted hash, and the country is approximate.
create table public.login_events (
  id        bigint generated always as identity primary key,
  user_id   uuid references public.profiles (id) on delete cascade,
  at        timestamptz not null default now(),
  success   boolean not null,
  method    text not null default 'password',
  device    text not null default '',
  country   text,
  ip_hash   text,

  constraint login_events_method_valid check (method in ('password', 'google', 'mfa', 'magic_link')),
  constraint login_events_device_length check (char_length(device) <= 200),
  constraint login_events_country_valid check (country is null or country ~ '^[A-Z]{2}$'),
  constraint login_events_ip_hash_length check (ip_hash is null or char_length(ip_hash) <= 128)
);
create index login_events_user_idx on public.login_events (user_id, at desc);
create index login_events_at_idx on public.login_events (at desc);

-- Accounts an admin marked for a closer look (from Login activity).
create table public.user_flags (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  reason      text not null default '',
  flagged_by  uuid references public.profiles (id) on delete set null,
  at          timestamptz not null default now(),

  constraint user_flags_reason_length check (char_length(reason) <= 500)
);

-- Limits and feature switches, edited on the admin System page. Everyone signed in may read
-- them (the app needs them); only admin_setting_set() writes.
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),

  constraint app_settings_key_valid check (key ~ '^(limits|features)\.[a-z_]{2,40}$'),
  constraint app_settings_value_type check (
    (key like 'limits.%' and jsonb_typeof(value) = 'number')
    or (key like 'features.%' and jsonb_typeof(value) = 'boolean'))
);

insert into public.app_settings (key, value) values
  ('limits.maps_per_day', '30'),
  ('limits.blocks_per_map', '5000'),
  ('limits.uploads_per_day', '20'),
  ('features.signups', 'true'),
  ('features.ai_cards', 'true'),
  ('features.public_links', 'true');

alter table public.audit_log enable row level security;
alter table public.login_events enable row level security;
alter table public.user_flags enable row level security;
alter table public.app_settings enable row level security;

revoke all on public.audit_log, public.login_events, public.user_flags, public.app_settings
  from anon, authenticated;
grant select on public.login_events, public.app_settings to authenticated;

-- People see their own sign-ins (Settings › Security); admins use admin_login_events().
create policy "login_events: read own" on public.login_events for select to authenticated
  using (user_id = (select auth.uid()));
create policy "app_settings: everyone signed in reads" on public.app_settings
  for select to authenticated using (true);
-- audit_log and user_flags: no policies; read only through admin functions.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.admin_log(
  p_action text, p_type text, p_target text, p_reason text, p_details jsonb default '{}'::jsonb)
returns void language sql volatile security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, action, target_type, target_id, reason, details)
  values ((select auth.uid()), p_action, p_type, p_target, left(coalesce(p_reason, ''), 500),
          coalesce(p_details, '{}'::jsonb));
$$;

-- Actions on someone else need a reason the audit log can show.
create or replace function public.admin_reason(p_reason text)
returns text language plpgsql immutable set search_path = '' as $$
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'a reason is required' using errcode = 'MN400';
  end if;
  return left(btrim(p_reason), 500);
end;
$$;

-- ---------------------------------------------------------------------------
-- Overview
-- ---------------------------------------------------------------------------

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_require();
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'active_7d', (select count(distinct l.user_id) from public.login_events l
                  where l.success and l.at > now() - interval '7 days'),
    'studying_7d', (select count(distinct r.user_id) from public.review_logs r
                    where r.reviewed_at > now() - interval '7 days'),
    'suspended', (select count(*) from public.profiles p where p.status <> 'active'),
    'maps', (select count(*) from public.maps),
    'maps_7d', (select count(*) from public.maps m where m.created_at > now() - interval '7 days'),
    'blocks', (select count(*) from public.nodes n where n.level = 'block'),
    'reviews_7d', (select count(*) from public.review_logs r
                   where r.reviewed_at > now() - interval '7 days'),
    'public_links', (select count(*) from public.maps m where m.link_access <> 'off'),
    'open_reports', (select count(*) from public.reports r where r.status = 'open'),
    'source_bytes', (select coalesce(sum(pg_column_size(s.paragraphs)), 0) from public.sources s),
    'signups', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'count', d.n) order by d.day)
      from (select p.created_at::date as day, count(*) as n from public.profiles p
            where p.created_at > now() - interval '30 days' group by 1) d), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

create or replace function public.admin_users(
  p_query text default '', p_status text default null, p_limit int default 50, p_offset int default 0)
returns table (
  id uuid, username text, name text, email text, role text, status text,
  two_factor_enabled boolean, flagged boolean, created_at timestamptz,
  last_login timestamptz, map_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  q text := lower(btrim(coalesce(p_query, '')));
begin
  perform public.admin_require();
  return query
    select p.id, p.username, p.name, u.email::text, p.role, p.status, p.two_factor_enabled,
           exists (select 1 from public.user_flags f where f.user_id = p.id),
           p.created_at,
           (select max(l.at) from public.login_events l where l.user_id = p.id and l.success),
           (select count(*) from public.maps m where m.owner_id = p.id)
    from public.profiles p
    left join auth.users u on u.id = p.id
    where (q = '' or p.username like '%' || q || '%' or lower(p.name) like '%' || q || '%'
           or lower(coalesce(u.email::text, '')) like '%' || q || '%')
      and (p_status is null or p.status = p_status)
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_user_detail(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  prof public.profiles;
begin
  perform public.admin_require();
  select * into prof from public.profiles p where p.id = p_user;
  if prof.id is null then raise exception 'user not found' using errcode = 'MN404'; end if;
  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', prof.id, 'username', prof.username, 'name', prof.name, 'role', prof.role,
      'status', prof.status, 'two_factor_enabled', prof.two_factor_enabled,
      'created_at', prof.created_at,
      'email', (select u.email::text from auth.users u where u.id = prof.id),
      'flag', (select jsonb_build_object('reason', f.reason, 'at', f.at)
               from public.user_flags f where f.user_id = prof.id)),
    'maps', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'title', m.title, 'type', m.type,
        'link_access', m.link_access, 'created_at', m.created_at, 'updated_at', m.updated_at)
        order by m.updated_at desc)
      from public.maps m where m.owner_id = prof.id), '[]'::jsonb),
    'logins', coalesce((
      select jsonb_agg(jsonb_build_object('at', l.at, 'success', l.success, 'method', l.method,
        'device', l.device, 'country', l.country) order by l.at desc)
      from (select * from public.login_events l where l.user_id = prof.id
            order by l.at desc limit 20) l), '[]'::jsonb),
    'shares', coalesce((
      select jsonb_agg(jsonb_build_object('map_id', e.map_id, 'action', e.action, 'at', e.at)
        order by e.at desc)
      from (select * from public.share_events e where e.actor_id = prof.id
            order by e.at desc limit 20) e), '[]'::jsonb),
    'reports_made', (select count(*) from public.reports r where r.reporter_id = prof.id),
    'reports_against', (select count(*) from public.reports r
                        join public.maps m on m.id = r.map_id where m.owner_id = prof.id)
  );
end;
$$;

-- active / suspended / banned. Never one's own account; reactivating also clears a flag.
create or replace function public.admin_set_user_status(p_user uuid, p_status text, p_reason text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  why text;
  before text;
begin
  perform public.admin_require();
  why := public.admin_reason(p_reason);
  if p_status not in ('active', 'suspended', 'banned') then
    raise exception 'status must be active, suspended or banned' using errcode = 'MN400';
  end if;
  if p_user = (select auth.uid()) then
    raise exception 'admins cannot change their own status' using errcode = '42501';
  end if;
  select p.status into before from public.profiles p where p.id = p_user;
  if before is null then raise exception 'user not found' using errcode = 'MN404'; end if;
  update public.profiles p set status = p_status where p.id = p_user;
  if p_status = 'active' then delete from public.user_flags f where f.user_id = p_user; end if;
  perform public.admin_log('user.' || p_status, 'user', p_user::text, why,
                           jsonb_build_object('before', before));
end;
$$;

create or replace function public.admin_flag_user(p_user uuid, p_reason text, p_flag boolean default true)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  why text;
begin
  perform public.admin_require();
  why := public.admin_reason(p_reason);
  if not exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'user not found' using errcode = 'MN404';
  end if;
  if p_flag then
    insert into public.user_flags (user_id, reason, flagged_by) values (p_user, why, (select auth.uid()))
    on conflict (user_id) do update set reason = excluded.reason, flagged_by = excluded.flagged_by, at = now();
  else
    delete from public.user_flags f where f.user_id = p_user;
  end if;
  perform public.admin_log(case when p_flag then 'user.flag' else 'user.unflag' end,
                           'user', p_user::text, why);
end;
$$;

-- ---------------------------------------------------------------------------
-- Maps and sharing
-- ---------------------------------------------------------------------------

create or replace function public.admin_maps(
  p_query text default '', p_shared_only boolean default false, p_limit int default 50, p_offset int default 0)
returns table (
  id uuid, title text, type text, owner_id uuid, owner_username text, blocks bigint,
  members bigint, pending_invites bigint, link_access text, link_expires_at timestamptz,
  open_reports bigint, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  q text := lower(btrim(coalesce(p_query, '')));
begin
  perform public.admin_require();
  return query
    select m.id, m.title, m.type, m.owner_id, p.username,
           (select count(*) from public.nodes n where n.map_id = m.id and n.level = 'block'),
           (select count(*) from public.map_members mm where mm.map_id = m.id),
           (select count(*) from public.map_invites i where i.map_id = m.id and i.status = 'pending'),
           m.link_access, m.link_expires_at,
           (select count(*) from public.reports r where r.map_id = m.id and r.status = 'open'),
           m.created_at, m.updated_at
    from public.maps m
    join public.profiles p on p.id = m.owner_id
    where (q = '' or lower(m.title) like '%' || q || '%' or p.username like '%' || q || '%')
      and (not coalesce(p_shared_only, false) or m.link_access <> 'off'
           or exists (select 1 from public.map_members mm where mm.map_id = m.id))
    order by m.updated_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Map content for moderation. Always written to the audit log, with the reason given.
create or replace function public.admin_map_content(p_map uuid, p_reason text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  why text;
  m public.maps;
begin
  perform public.admin_require();
  why := public.admin_reason(p_reason);
  select * into m from public.maps x where x.id = p_map;
  if m.id is null then raise exception 'map not found' using errcode = 'MN404'; end if;
  perform public.admin_log('map.view_content', 'map', p_map::text, why);
  return jsonb_build_object(
    'map', jsonb_build_object('id', m.id, 'title', m.title, 'type', m.type, 'owner_id', m.owner_id,
                              'link_access', m.link_access, 'updated_at', m.updated_at),
    'nodes', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'parent_id', n.parent_id, 'level', n.level,
        'sort_order', n.sort_order, 'title', n.title, 'summary', n.summary, 'type', n.type,
        'details', n.details) order by n.sort_order)
      from public.nodes n where n.map_id = p_map), '[]'::jsonb),
    'relations', coalesce((
      select jsonb_agg(jsonb_build_object('from_node', r.from_node, 'to_node', r.to_node,
        'type', r.type, 'label', r.label, 'status', r.status))
      from public.relations r where r.map_id = p_map and r.status = 'accepted'), '[]'::jsonb)
  );
end;
$$;

-- Turns the share link off and makes the old address stop working.
create or replace function public.admin_link_takedown(p_map uuid, p_reason text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  why text;
  before text;
begin
  perform public.admin_require();
  why := public.admin_reason(p_reason);
  select m.link_access into before from public.maps m where m.id = p_map;
  if before is null then raise exception 'map not found' using errcode = 'MN404'; end if;
  update public.maps m set link_access = 'off', link_token = public.share_new_token()
  where m.id = p_map;
  perform public.admin_log('map.link_takedown', 'map', p_map::text, why,
                           jsonb_build_object('before', before));
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

create or replace function public.admin_reports(p_status text default 'open', p_limit int default 100)
returns table (
  id uuid, map_id uuid, map_title text, owner_id uuid, owner_username text,
  reporter_username text, reason text, details text, status text, outcome text,
  handled_by_username text, created_at timestamptz, resolved_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_require();
  return query
    select r.id, r.map_id, m.title, m.owner_id, o.username, rp.username, r.reason, r.details,
           r.status, r.outcome, h.username, r.created_at, r.resolved_at
    from public.reports r
    join public.maps m on m.id = r.map_id
    join public.profiles o on o.id = m.owner_id
    join public.profiles rp on rp.id = r.reporter_id
    left join public.profiles h on h.id = r.handled_by
    where p_status is null or r.status = p_status
    order by r.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

-- Resolves a report: nothing else, take the link down, or also suspend the map's owner.
create or replace function public.admin_report_resolve(p_report uuid, p_action text, p_outcome text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  why text;
  rep public.reports;
  owner uuid;
begin
  perform public.admin_require();
  why := public.admin_reason(p_outcome);
  if p_action not in ('none', 'takedown', 'suspend') then
    raise exception 'action must be none, takedown or suspend' using errcode = 'MN400';
  end if;
  select * into rep from public.reports r where r.id = p_report;
  if rep.id is null then raise exception 'report not found' using errcode = 'MN404'; end if;
  if rep.status <> 'open' then raise exception 'report already resolved' using errcode = 'MN400'; end if;
  update public.reports r set status = 'resolved', outcome = why, handled_by = (select auth.uid()),
                              resolved_at = now()
  where r.id = p_report;
  perform public.admin_log('report.resolve', 'report', p_report::text, why,
                           jsonb_build_object('action', p_action, 'map_id', rep.map_id));
  if p_action in ('takedown', 'suspend') then
    perform public.admin_link_takedown(rep.map_id, why);
  end if;
  if p_action = 'suspend' then
    select m.owner_id into owner from public.maps m where m.id = rep.map_id;
    if owner <> (select auth.uid()) then
      perform public.admin_set_user_status(owner, 'suspended', why);
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Login activity, AI jobs, audit log, settings
-- ---------------------------------------------------------------------------

create or replace function public.admin_login_events(
  p_user uuid default null, p_failed_only boolean default false, p_limit int default 100,
  p_before bigint default null)
returns table (
  id bigint, user_id uuid, username text, at timestamptz, success boolean, method text,
  device text, country text, flagged boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_require();
  return query
    select l.id, l.user_id, p.username, l.at, l.success, l.method, l.device, l.country,
           exists (select 1 from public.user_flags f where f.user_id = l.user_id)
    from public.login_events l
    left join public.profiles p on p.id = l.user_id
    where (p_user is null or l.user_id = p_user)
      and (not coalesce(p_failed_only, false) or not l.success)
      and (p_before is null or l.id < p_before)
    order by l.id desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

-- Success and failure by provider, model and prompt version (never keys or content).
create or replace function public.admin_ai_jobs(p_days int default 30)
returns table (
  provider text, model text, prompt_version text, pass text, total bigint, done bigint,
  failed bigint, avg_ms integer, tokens_in bigint, tokens_out bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_require();
  return query
    select j.provider, j.model, j.prompt_version, j.pass, count(*),
           count(*) filter (where j.status = 'done'), count(*) filter (where j.status = 'failed'),
           avg(j.duration_ms)::integer, coalesce(sum(j.tokens_in), 0)::bigint,
           coalesce(sum(j.tokens_out), 0)::bigint
    from public.ai_jobs j
    where j.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 400))
    group by 1, 2, 3, 4
    order by count(*) desc;
end;
$$;

create or replace function public.admin_audit(p_limit int default 100, p_before bigint default null)
returns table (
  id bigint, at timestamptz, actor_id uuid, actor_username text, action text,
  target_type text, target_id text, reason text, details jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_require();
  return query
    select a.id, a.at, a.actor_id, p.username, a.action, a.target_type, a.target_id, a.reason, a.details
    from public.audit_log a
    left join public.profiles p on p.id = a.actor_id
    where p_before is null or a.id < p_before
    order by a.id desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

create or replace function public.admin_setting_set(p_key text, p_value jsonb, p_reason text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  why text;
  before jsonb;
begin
  perform public.admin_require();
  why := public.admin_reason(p_reason);
  select s.value into before from public.app_settings s where s.key = p_key;
  if before is null then raise exception 'unknown setting' using errcode = 'MN404'; end if;
  if p_key like 'limits.%' and (jsonb_typeof(p_value) <> 'number'
      or (p_value #>> '{}')::numeric not between 0 and 1000000) then
    raise exception 'limits are numbers between 0 and 1000000' using errcode = 'MN400';
  end if;
  if p_key like 'features.%' and jsonb_typeof(p_value) <> 'boolean' then
    raise exception 'feature switches are true or false' using errcode = 'MN400';
  end if;
  update public.app_settings s set value = p_value, updated_by = (select auth.uid()), updated_at = now()
  where s.key = p_key;
  perform public.admin_log('setting.set', 'setting', p_key, why,
                           jsonb_build_object('before', before, 'after', p_value));
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function
  public.admin_ok(), public.admin_require(), public.admin_log(text, text, text, text, jsonb),
  public.admin_reason(text), public.admin_overview(), public.admin_users(text, text, int, int),
  public.admin_user_detail(uuid), public.admin_set_user_status(uuid, text, text),
  public.admin_flag_user(uuid, text, boolean), public.admin_maps(text, boolean, int, int),
  public.admin_map_content(uuid, text), public.admin_link_takedown(uuid, text),
  public.admin_reports(text, int), public.admin_report_resolve(uuid, text, text),
  public.admin_login_events(uuid, boolean, int, bigint), public.admin_ai_jobs(int),
  public.admin_audit(int, bigint), public.admin_setting_set(text, jsonb, text)
  from public, anon, authenticated;

grant execute on function
  public.admin_ok(), public.admin_overview(), public.admin_users(text, text, int, int),
  public.admin_user_detail(uuid), public.admin_set_user_status(uuid, text, text),
  public.admin_flag_user(uuid, text, boolean), public.admin_maps(text, boolean, int, int),
  public.admin_map_content(uuid, text), public.admin_link_takedown(uuid, text),
  public.admin_reports(text, int), public.admin_report_resolve(uuid, text, text),
  public.admin_login_events(uuid, boolean, int, bigint), public.admin_ai_jobs(int),
  public.admin_audit(int, bigint), public.admin_setting_set(text, jsonb, text)
  to authenticated;
