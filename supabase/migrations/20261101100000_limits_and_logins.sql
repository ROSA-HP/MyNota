-- Phase 7.4 · limits and sign-in records (docs/security.md › Rate limiting, Authentication).
--
-- Limits come from app_settings (migration 12), so admins change them on the System page
-- without a deploy. They are enforced here, in the database, whatever the app does.
--
-- After applying (docs/migrations.md #13):
--   Supabase › Authentication › Hooks › "Password verification attempt" → Postgres function
--   public.hook_password_attempt  (records failed password sign-ins in login_events)
--   and deploy the log-signin Edge Function (successful sign-ins, with device and country).
--
-- Error codes: MN429 limit reached · MN403 switched off by an admin

-- ---------------------------------------------------------------------------
-- Reading settings
-- ---------------------------------------------------------------------------

create or replace function public.setting_number(p_key text, p_default numeric)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((select (s.value #>> '{}')::numeric from public.app_settings s
                   where s.key = p_key and jsonb_typeof(s.value) = 'number'), p_default);
$$;

create or replace function public.setting_on(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select (s.value #>> '{}')::boolean from public.app_settings s
                   where s.key = p_key and jsonb_typeof(s.value) = 'boolean'), true);
$$;

-- ---------------------------------------------------------------------------
-- Limits on maps, blocks and uploads
-- ---------------------------------------------------------------------------

-- New maps per person per day (copies count too).
create or replace function public.limit_maps()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cap numeric := public.setting_number('limits.maps_per_day', 30);
begin
  if (select count(*) from public.maps m
      where m.owner_id = new.owner_id and m.created_at > now() - interval '1 day') >= cap then
    raise exception 'daily map limit reached' using errcode = 'MN429';
  end if;
  return new;
end;
$$;

create trigger maps_limit before insert on public.maps
  for each row execute function public.limit_maps();

-- Nodes per map. Saving re-sends existing rows (upsert), so only new rows count.
create or replace function public.limit_nodes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cap numeric := public.setting_number('limits.blocks_per_map', 5000);
begin
  if exists (select 1 from public.nodes n where n.id = new.id) then return new; end if;
  if (select count(*) from public.nodes n where n.map_id = new.map_id) >= cap then
    raise exception 'block limit for this map reached' using errcode = 'MN429';
  end if;
  return new;
end;
$$;

create trigger nodes_limit before insert on public.nodes
  for each row execute function public.limit_nodes();

-- Uploaded books and photo sets per person per day: one upload is one file (its hash), however
-- many chapters it has.
create or replace function public.limit_uploads()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cap numeric := public.setting_number('limits.uploads_per_day', 20);
begin
  if new.kind not in ('pdf', 'images') or new.file_hash is null then return new; end if;
  if exists (select 1 from public.sources s
             where s.created_by = new.created_by and s.file_hash = new.file_hash
               and s.created_at > now() - interval '1 day') then
    return new; -- another chapter of the same upload
  end if;
  if (select count(distinct s.file_hash) from public.sources s
      where s.created_by = new.created_by and s.kind in ('pdf', 'images')
        and s.created_at > now() - interval '1 day') >= cap then
    raise exception 'daily upload limit reached' using errcode = 'MN429';
  end if;
  return new;
end;
$$;

create trigger sources_limit before insert on public.sources
  for each row execute function public.limit_uploads();

-- ---------------------------------------------------------------------------
-- Feature switches
-- ---------------------------------------------------------------------------

-- New share links can be switched off (existing ones keep working; admins take those down).
create or replace function public.switch_public_links()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.link_access <> 'off' and old.link_access = 'off' and not public.setting_on('features.public_links') then
    raise exception 'new share links are switched off' using errcode = 'MN403';
  end if;
  return new;
end;
$$;

create trigger maps_public_links before update of link_access on public.maps
  for each row execute function public.switch_public_links();

-- Sign-ups can be closed (existing accounts still sign in).
create or replace function public.switch_signups()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.setting_on('features.signups') then
    raise exception 'sign-ups are closed' using errcode = 'MN403';
  end if;
  return new;
end;
$$;

create trigger before_auth_user_created before insert on auth.users
  for each row execute function public.switch_signups();

-- ---------------------------------------------------------------------------
-- Rate counters (for Edge Functions; docs/security.md)
-- ---------------------------------------------------------------------------

create table public.rate_limits (
  key           text not null,
  window_start  timestamptz not null,
  count         integer not null default 0,

  primary key (key, window_start),
  constraint rate_limits_key_length check (char_length(key) between 1 and 200)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
-- No policies: only the service role (Edge Functions) uses it, through rate_hit().

-- Counts one hit for `key` in the current window; false when the limit is already reached.
create or replace function public.rate_hit(p_key text, p_max integer, p_window interval)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / extract(epoch from p_window))
                                * extract(epoch from p_window));
  n integer;
begin
  insert into public.rate_limits (key, window_start, count) values (p_key, w, 1)
  on conflict (key, window_start) do update set count = public.rate_limits.count + 1
  returning count into n;
  delete from public.rate_limits r where r.window_start < now() - interval '2 days';
  return n <= p_max;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sign-in records
-- ---------------------------------------------------------------------------

-- Supabase Auth hook "Password verification attempt": records failed attempts. Successful
-- sign-ins (password and Google) are recorded by the log-signin Edge Function, which also knows
-- the device and the country. Never blocks a sign-in (Supabase's own limits do that).
create or replace function public.hook_password_attempt(event jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid;
begin
  -- Inside the block, so a malformed event is caught below instead of failing the sign-in.
  uid := nullif(event ->> 'user_id', '')::uuid;
  if coalesce((event ->> 'valid')::boolean, false) = false
     and exists (select 1 from public.profiles p where p.id = uid) then
    insert into public.login_events (user_id, success, method) values (uid, false, 'password');
  end if;
  return jsonb_build_object('decision', 'continue');
exception when others then
  return jsonb_build_object('decision', 'continue');
end;
$$;

-- Records a successful sign-in for the caller's own account (the log-signin Edge Function calls
-- it with the user's token; device, country and IP hash come from the request there).
create or replace function public.log_signin(
  p_method text, p_device text, p_country text, p_ip_hash text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  -- At most one record per account per minute (a reload is not a new sign-in).
  if exists (select 1 from public.login_events l
             where l.user_id = me and l.success and l.at > now() - interval '1 minute') then
    return;
  end if;
  insert into public.login_events (user_id, success, method, device, country, ip_hash)
  values (me,
          true,
          case when p_method in ('password', 'google', 'mfa', 'magic_link') then p_method else 'password' end,
          left(coalesce(p_device, ''), 200),
          case when upper(p_country) ~ '^[A-Z]{2}$' then upper(p_country) end,
          left(p_ip_hash, 128));
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function
  public.setting_number(text, numeric), public.setting_on(text), public.limit_maps(),
  public.limit_nodes(), public.limit_uploads(), public.switch_public_links(),
  public.switch_signups(), public.rate_hit(text, integer, interval),
  public.hook_password_attempt(jsonb), public.log_signin(text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.setting_on(text) to authenticated;
grant execute on function public.log_signin(text, text, text, text) to authenticated;
grant execute on function public.rate_hit(text, integer, interval) to service_role;

-- The Auth server calls the hook as supabase_auth_admin (SECURITY DEFINER does the writing).
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_password_attempt(jsonb) to supabase_auth_admin;
