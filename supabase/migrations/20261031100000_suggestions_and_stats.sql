-- MyNota · Phase 3 · link suggestions and library stats
--
-- 1. Suggested links (the cross-links pass) carry the model's confidence, and a dismissed
--    suggestion is kept as status 'dismissed' so the same link is never suggested again.
--    Dismissed rows are hidden everywhere in the app.
-- 2. ai_jobs records the merge pass ("Add notes") as its own kind.
-- 3. map_stats(): block and chapter counts for library cards. SECURITY INVOKER, so Row Level
--    Security decides which maps and nodes are counted, exactly as for a direct read.

alter table public.relations
  drop constraint relations_status_valid,
  add constraint relations_status_valid check (status in ('suggested', 'accepted', 'dismissed')),
  add column confidence text,
  add constraint relations_confidence_valid
    check (confidence is null or confidence in ('high', 'medium'));

comment on column public.relations.confidence is
  'AI suggestions only: how sure the cross-links pass was (high or medium).';

alter table public.ai_jobs
  drop constraint ai_jobs_pass_valid,
  add constraint ai_jobs_pass_valid check (pass in ('outline', 'details', 'links', 'merge', 'tool'));

create or replace function public.map_stats(map_ids uuid[])
returns table (
  map_id uuid,
  blocks integer,
  chapters integer,
  chapters_built integer,
  chapter_colors text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.id,
    (select count(*) from public.nodes n where n.map_id = m.id and n.level = 'block')::integer,
    (select count(*) from public.nodes c
      where c.map_id = m.id and c.level = 'chapter' and c.parent_id is not null)::integer,
    (select count(*) from public.nodes c
      where c.map_id = m.id and c.level = 'chapter' and c.parent_id is not null
        and exists (select 1 from public.nodes s where s.parent_id = c.id))::integer,
    coalesce(
      (select array_agg(coalesce(c.color, 'yellow') order by c.sort_order)
        from public.nodes c
        where c.map_id = m.id and c.level = 'chapter' and c.parent_id is not null),
      '{}'::text[])
  from public.maps m
  where m.id = any (map_ids[1:200])
$$;

revoke all on function public.map_stats(uuid[]) from public, anon;
grant execute on function public.map_stats(uuid[]) to authenticated;
