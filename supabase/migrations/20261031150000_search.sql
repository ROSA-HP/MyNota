-- Phase 4.5: search across every map the student can open (docs/features.md › Search).
--
-- Each searchable row gets a normalized text (lower case, Latin accents and Arabic diacritics,
-- hamza seats, tatweel, taa marbuta and alef maqsura unified) for substring matching with a
-- trigram index, and an English + German stemmed tsvector for word forms. search_all() runs as
-- the caller, so RLS decides which maps, blocks, cards and sources can be found.

create extension if not exists pg_trgm with schema extensions;

-- Same rules as src/lib/searchText.ts normalizeForSearch().
create or replace function public.search_normalize(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    replace(lower(translate(
      regexp_replace(
        normalize(coalesce(t, ''), NFKD),
        -- combining marks: Latin accents, Arabic tashkeel and Quranic marks, superscript alef; tatweel
        '[̀-ͯؐ-ًؚ-ٰٟۖ-ۭـ]', '', 'g'),
      -- ٱ ى ة → ا ي ه (أ إ آ ؤ ئ lose their hamza or madda above in NFKD)
      'ٱىة', 'ايه')), 'ß', 'ss'),
    '\s+', ' ', 'g'))
$$;

-- The text inside a node's details (every string field except "kind").
create or replace function public.detail_text(d jsonb)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(string_agg(kv.value, ' '), '')
  from jsonb_array_elements(case when jsonb_typeof(d) = 'array' then d else '[]'::jsonb end) e,
       lateral jsonb_each_text(case when jsonb_typeof(e) = 'object' then e else '{}'::jsonb end) kv
  where kv.key <> 'kind'
$$;

create or replace function public.paragraph_text(p jsonb)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(string_agg(e ->> 'text', ' '), '')
  from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) e
$$;

create or replace function public.search_fts(t text)
returns tsvector
language sql
immutable
parallel safe
set search_path = ''
as $$
  select to_tsvector('pg_catalog.english'::regconfig, coalesce(t, ''))
      || to_tsvector('pg_catalog.german'::regconfig, coalesce(t, ''))
$$;

alter table public.maps
  add column search_text text generated always as (public.search_normalize(title)) stored;

alter table public.nodes
  add column search_text text generated always as
    (public.search_normalize(title || ' ' || summary || ' ' || public.detail_text(details))) stored,
  add column search_fts tsvector generated always as
    (public.search_fts(title || ' ' || summary || ' ' || public.detail_text(details))) stored;

alter table public.cards
  add column search_text text generated always as (public.search_normalize(front || ' ' || back)) stored,
  add column search_fts tsvector generated always as (public.search_fts(front || ' ' || back)) stored;

alter table public.sources
  add column search_text text generated always as
    (public.search_normalize(public.paragraph_text(paragraphs))) stored;

-- maps uses column grants (the share token stays hidden): the search column is readable too.
grant select (search_text) on public.maps to authenticated;

create index maps_search_trgm on public.maps using gin (search_text extensions.gin_trgm_ops);
create index nodes_search_trgm on public.nodes using gin (search_text extensions.gin_trgm_ops);
create index nodes_search_fts on public.nodes using gin (search_fts);
create index cards_search_trgm on public.cards using gin (search_text extensions.gin_trgm_ops);
create index cards_search_fts on public.cards using gin (search_fts);
create index sources_search_trgm on public.sources using gin (search_text extensions.gin_trgm_ops);

-- Results for one query, best first. kind: map | node | card | source.
create or replace function public.search_all(q text, max_results integer default 60)
returns table (
  kind       text,
  map_id     uuid,
  map_title  text,
  map_type   text,
  node_id    uuid,
  card_id    uuid,
  title      text,
  snippet    text,
  rank       real
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  nq   text := public.search_normalize(left(coalesce(q, ''), 200));
  pats text[];
  tq   tsquery;
  lim  integer := least(greatest(coalesce(max_results, 60), 1), 100);
begin
  if char_length(nq) < 2 then
    return;
  end if;
  -- Every word must appear (any order); LIKE wildcards in the query are taken literally.
  select array_agg('%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%')
    into pats
  from regexp_split_to_table(nq, ' ') w
  where w <> '';
  tq := websearch_to_tsquery('pg_catalog.english'::regconfig, q)
     || websearch_to_tsquery('pg_catalog.german'::regconfig, q);

  return query
  select * from (
    select 'map'::text, m.id, m.title, m.type, null::uuid, null::uuid, m.title, ''::text,
           (case when m.search_text like nq || '%' then 4 else 3 end)::real
    from public.maps m
    where m.search_text like all (pats)

    union all
    select 'node', m.id, m.title, m.type, x.id, null::uuid, x.title,
           left(x.summary, 200),
           ((case
              when public.search_normalize(x.title) like nq || '%' then 3
              when public.search_normalize(x.title) like all (pats) then 2
              else 1 end)
            + ts_rank(x.search_fts, tq))::real
    from public.nodes x
    join public.maps m on m.id = x.map_id
    -- the map's title node repeats the map itself
    where x.parent_id is not null and (x.search_text like all (pats) or x.search_fts @@ tq)

    union all
    select 'card', m.id, m.title, m.type, c.node_id, c.id, c.front, left(c.back, 200),
           (0.9 + ts_rank(c.search_fts, tq))::real
    from public.cards c
    join public.maps m on m.id = c.map_id
    where not c.suspended and (c.search_text like all (pats) or c.search_fts @@ tq)

    union all
    select 'source', m.id, m.title, m.type, s.chapter_node_id, null::uuid,
           coalesce(p ->> 'n', ''), left(p ->> 'text', 240), 0.5::real
    from public.sources s
    join public.maps m on m.id = s.map_id
    cross join lateral (
      select e as p
      from jsonb_array_elements(s.paragraphs) e
      where public.search_normalize(e ->> 'text') like all (pats)
      limit 1
    ) first_paragraph
    where s.search_text like all (pats)
  ) r (kind, map_id, map_title, map_type, node_id, card_id, title, snippet, rank)
  order by r.rank desc, r.map_title, r.title
  limit lim;
end;
$$;

revoke all on function public.search_all(text, integer) from public, anon;
grant execute on function public.search_all(text, integer) to authenticated;
grant execute on function public.search_normalize(text) to authenticated;
