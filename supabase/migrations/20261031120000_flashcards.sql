-- MyNota · Phase 4 · flashcards
--
-- cards:         one deck per map; every card can link back to its block (node_id).
-- card_progress: FSRS state per card and per user (progress is personal, also on shared maps).
-- review_logs:   one row per answer, for stats, streaks and future FSRS optimisation.
-- profiles:      daily limits for new cards and reviews (decided 2026-10-31: 10 new / 100).
--
-- Cards are readable by everyone on the map and written by the owner and editors (like nodes).
-- Progress and logs are only ever readable and writable by the student themself.

-- ---------------------------------------------------------------------------
-- cards
-- ---------------------------------------------------------------------------
create table public.cards (
  id          uuid primary key default gen_random_uuid(),
  map_id      uuid not null references public.maps (id) on delete cascade,
  node_id     uuid references public.nodes (id) on delete cascade,
  type        text not null default 'basic',
  front       text not null,
  back        text not null default '',
  languages   text[] not null default '{}',
  -- auto: made from a block's type; ai: the AI's card ideas or "make cards"; manual: by hand.
  origin      text not null default 'manual',
  -- For made cards: which rule made it ('type' or 'q:<n>'), so a sync never adds it twice.
  source_key  text,
  -- A made card the student removed: kept (hidden) so a later sync does not make it again.
  suspended   boolean not null default false,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint cards_type_valid check (type in ('basic', 'reversed', 'vocab', 'cloze')),
  constraint cards_origin_valid check (origin in ('auto', 'ai', 'manual')),
  constraint cards_front_length check (char_length(front) between 1 and 1000),
  constraint cards_back_length check (char_length(back) <= 2000),
  constraint cards_source_key_length check (source_key is null or char_length(source_key) <= 80)
);

create index cards_map_idx on public.cards (map_id);
create index cards_node_idx on public.cards (node_id);
create unique index cards_made_once on public.cards (node_id, source_key)
  where source_key is not null;

create trigger cards_set_updated_at
  before update on public.cards
  for each row execute function public.set_updated_at();

-- A card's block must be in the card's map; map_id never moves.
create or replace function public.cards_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.map_id is distinct from old.map_id then
    raise exception 'map_id cannot be changed' using errcode = '42501';
  end if;
  if new.node_id is not null and not exists (
    select 1 from public.nodes n where n.id = new.node_id and n.map_id = new.map_id
  ) then
    raise exception 'block belongs to another map' using errcode = '23503';
  end if;
  return null;
end;
$$;

create constraint trigger cards_guard after insert or update on public.cards
  for each row execute function public.cards_guard();

-- ---------------------------------------------------------------------------
-- card_progress (FSRS, per user)
-- ---------------------------------------------------------------------------
create table public.card_progress (
  card_id         uuid not null references public.cards (id) on delete cascade,
  user_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  map_id          uuid not null references public.maps (id) on delete cascade,
  due             timestamptz not null,
  stability       double precision not null default 0,
  difficulty      double precision not null default 0,
  elapsed_days    integer not null default 0,
  scheduled_days  integer not null default 0,
  learning_steps  integer not null default 0,
  reps            integer not null default 0,
  lapses          integer not null default 0,
  -- FSRS state: 0 new, 1 learning, 2 review, 3 relearning
  state           smallint not null default 0,
  last_review     timestamptz,
  updated_at      timestamptz not null default now(),
  primary key (card_id, user_id),

  constraint card_progress_state_valid check (state between 0 and 3),
  constraint card_progress_numbers check (
    stability >= 0 and difficulty >= 0 and reps >= 0 and lapses >= 0
    and elapsed_days >= 0 and scheduled_days >= 0 and learning_steps >= 0)
);

create index card_progress_user_due_idx on public.card_progress (user_id, due);
create index card_progress_user_map_idx on public.card_progress (user_id, map_id);

create trigger card_progress_set_updated_at
  before update on public.card_progress
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- review_logs (per user)
-- ---------------------------------------------------------------------------
create table public.review_logs (
  id              uuid primary key default gen_random_uuid(),
  card_id         uuid not null references public.cards (id) on delete cascade,
  user_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  map_id          uuid not null references public.maps (id) on delete cascade,
  rating          smallint not null,
  -- The card's state before this answer (0 new … 3 relearning).
  state           smallint not null,
  elapsed_days    integer not null default 0,
  scheduled_days  integer not null default 0,
  duration_ms     integer,
  reviewed_at     timestamptz not null default now(),

  constraint review_logs_rating_valid check (rating between 1 and 4),
  constraint review_logs_state_valid check (state between 0 and 3),
  constraint review_logs_duration check (duration_ms is null or duration_ms between 0 and 3600000)
);

create index review_logs_user_time_idx on public.review_logs (user_id, reviewed_at desc);

-- Progress and logs must point at a card of the same map the row names.
create or replace function public.study_rows_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.cards c where c.id = new.card_id and c.map_id = new.map_id) then
    raise exception 'card belongs to another map' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id or new.card_id is distinct from old.card_id) then
    raise exception 'progress cannot move to another user or card' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger card_progress_guard before insert or update on public.card_progress
  for each row execute function public.study_rows_guard();
create trigger review_logs_guard before insert on public.review_logs
  for each row execute function public.study_rows_guard();

-- ---------------------------------------------------------------------------
-- Daily limits on the profile
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column daily_new_limit integer not null default 10,
  add column daily_review_limit integer not null default 100,
  add constraint profiles_daily_new_limit check (daily_new_limit between 0 and 500),
  add constraint profiles_daily_review_limit check (daily_review_limit between 0 and 5000);

grant update (daily_new_limit, daily_review_limit) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges and Row Level Security
-- ---------------------------------------------------------------------------
alter table public.cards enable row level security;
alter table public.card_progress enable row level security;
alter table public.review_logs enable row level security;

revoke all on public.cards, public.card_progress, public.review_logs from anon, authenticated;
grant select, insert, update, delete on public.cards to authenticated;
grant select, insert, update, delete on public.card_progress to authenticated;
grant select, insert on public.review_logs to authenticated;

create policy "cards: everyone on the map reads" on public.cards for select to authenticated
  using (public.map_role(map_id) is not null);
create policy "cards: owner and editors add" on public.cards for insert to authenticated
  with check (public.map_role(map_id) in ('owner', 'editor'));
create policy "cards: owner and editors change" on public.cards for update to authenticated
  using (public.map_role(map_id) in ('owner', 'editor'))
  with check (public.map_role(map_id) in ('owner', 'editor'));
create policy "cards: owner and editors delete" on public.cards for delete to authenticated
  using (public.map_role(map_id) in ('owner', 'editor'));

-- Progress: only your own rows, and only for maps you can open.
create policy "card_progress: own rows" on public.card_progress for select to authenticated
  using (user_id = (select auth.uid()) and public.map_role(map_id) is not null);
create policy "card_progress: add own" on public.card_progress for insert to authenticated
  with check (user_id = (select auth.uid()) and public.map_role(map_id) is not null);
create policy "card_progress: change own" on public.card_progress for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.map_role(map_id) is not null);
create policy "card_progress: delete own" on public.card_progress for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "review_logs: own rows" on public.review_logs for select to authenticated
  using (user_id = (select auth.uid()));
create policy "review_logs: add own" on public.review_logs for insert to authenticated
  with check (user_id = (select auth.uid()) and public.map_role(map_id) is not null);

-- ---------------------------------------------------------------------------
-- Study numbers for Home and the deck list (SECURITY INVOKER: RLS applies)
-- ---------------------------------------------------------------------------
-- Per map: total cards, new (never studied), due now, learning, mastered (review state with a
-- stability of at least 21 days).
create or replace function public.deck_stats(map_ids uuid[] default null)
returns table (
  map_id uuid,
  total integer,
  new_cards integer,
  due integer,
  learning integer,
  mastered integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.map_id,
    count(*)::integer,
    count(*) filter (where p.card_id is null)::integer,
    count(*) filter (where p.card_id is not null and p.due <= now())::integer,
    count(*) filter (where p.card_id is not null and not (p.state = 2 and p.stability >= 21))::integer,
    count(*) filter (where p.state = 2 and p.stability >= 21)::integer
  from public.cards c
  left join public.card_progress p on p.card_id = c.id and p.user_id = (select auth.uid())
  where map_ids is null or c.map_id = any (map_ids)
  group by c.map_id
$$;

-- Reviews per day (in the student's time zone) for the last `days` days: streak and week chart.
create or replace function public.study_activity(days integer default 120, tz text default 'UTC')
returns table (day date, reviews integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select (r.reviewed_at at time zone tz)::date as day, count(*)::integer
  from public.review_logs r
  where r.user_id = (select auth.uid())
    and r.reviewed_at > now() - make_interval(days => least(greatest(days, 1), 400))
  group by 1
  order by 1
$$;

revoke all on function public.deck_stats(uuid[]) from public, anon;
revoke all on function public.study_activity(integer, text) from public, anon;
grant execute on function public.deck_stats(uuid[]) to authenticated;
grant execute on function public.study_activity(integer, text) to authenticated;
