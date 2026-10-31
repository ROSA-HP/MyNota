-- Phase 7.6 · error monitoring (decided 2026-10-31: MyNota's own table, no third-party service).
--
-- The app scrubs every report in the browser first (src/lib/errors/scrub.ts: no AI keys, no
-- tokens, no map content, no emails); this table only ever receives the scrubbed text. Reports
-- are kept 30 days and read only by admins (Admin › Errors).
--
-- Error codes: MN400 invalid input

create table public.client_errors (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  user_id      uuid references public.profiles (id) on delete set null,
  kind         text not null,
  message      text not null,
  stack        text not null default '',
  route        text not null default '',
  app_version  text not null default '',
  browser      text not null default '',

  constraint client_errors_kind_valid check (kind in ('error', 'rejection', 'render')),
  constraint client_errors_message_length check (char_length(message) between 1 and 300),
  constraint client_errors_stack_length check (char_length(stack) <= 2000),
  constraint client_errors_route_length check (char_length(route) <= 200),
  constraint client_errors_version_length check (char_length(app_version) <= 40),
  constraint client_errors_browser_length check (char_length(browser) <= 60)
);
create index client_errors_at_idx on public.client_errors (at desc);

alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;
-- No policies: written by report_client_error(), read by admin_client_errors().

-- Saves one scrubbed report. Signed-in people: 30 an hour each; visitors (share-link pages):
-- 300 an hour together. Old reports are removed as new ones arrive.
create or replace function public.report_client_error(
  p_kind text, p_message text, p_stack text, p_route text, p_version text, p_browser text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if p_kind not in ('error', 'rejection', 'render') or char_length(coalesce(p_message, '')) not between 1 and 300 then
    raise exception 'invalid report' using errcode = 'MN400';
  end if;
  if not public.rate_hit(coalesce('errors:' || me::text, 'errors:anon'),
                         case when me is null then 300 else 30 end, interval '1 hour') then
    return; -- quietly dropped: a loop must not fill the table
  end if;
  insert into public.client_errors (user_id, kind, message, stack, route, app_version, browser)
  values (me, p_kind, p_message, left(coalesce(p_stack, ''), 2000), left(coalesce(p_route, ''), 200),
          left(coalesce(p_version, ''), 40), left(coalesce(p_browser, ''), 60));
  if random() < 0.02 then
    delete from public.client_errors e where e.at < now() - interval '30 days';
  end if;
end;
$$;

-- Admin › Errors: reports grouped by message, newest first.
create or replace function public.admin_client_errors(p_days int default 7)
returns table (
  message text, kind text, count bigint, people bigint, first_at timestamptz,
  last_at timestamptz, route text, stack text, browser text, app_version text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_require();
  return query
    select e.message, min(e.kind), count(*), count(distinct e.user_id), min(e.at), max(e.at),
           (array_agg(e.route order by e.at desc))[1],
           (array_agg(e.stack order by e.at desc))[1],
           (array_agg(e.browser order by e.at desc))[1],
           (array_agg(e.app_version order by e.at desc))[1]
    from public.client_errors e
    where e.at > now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 30))
    group by e.message
    order by max(e.at) desc
    limit 200;
end;
$$;

revoke all on function public.report_client_error(text, text, text, text, text, text),
  public.admin_client_errors(int) from public, anon, authenticated;
grant execute on function public.report_client_error(text, text, text, text, text, text)
  to anon, authenticated;
grant execute on function public.admin_client_errors(int) to authenticated;
