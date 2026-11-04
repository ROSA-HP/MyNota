-- Admin mapping through MCP (docs/ai-pipeline.md › Admin mapping with MCP, docs/security.md).
--
-- An admin can build a map with Claude or Gemini on their normal plan, through the local server
-- in mcp/. This function is the only way that work reaches the database. It is what makes the
-- feature admin-only: the check is here, not in the local server, which anyone could change.
--
-- It can be called several times for one map (a big book goes up chapter by chapter, because
-- API requests have a statement time limit). Every id comes from the caller, so sending a part
-- again after a lost connection adds nothing twice.
--
-- It only writes maps that have never been opened. Once a map is open the app works from its
-- live Yjs document and no longer reads these rows, so a later write would silently vanish.
--
-- Error codes: MN400 invalid input · MN409 map already opened · 42501 not allowed

create or replace function public.admin_import_map(
  p_map uuid,
  p_title text,
  p_type text,
  p_languages text[] default '{}',
  p_nodes jsonb default '[]'::jsonb,
  p_relations jsonb default '[]'::jsonb,
  p_sources jsonb default '[]'::jsonb,
  p_details jsonb default '{}'::jsonb
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  map_owner uuid;
  is_new boolean := false;
  added_nodes int := 0;
  added_relations int := 0;
  added_sources int := 0;
begin
  perform public.admin_require();

  if p_map is null or p_type not in ('book', 'notes') then
    raise exception 'a map id and a type of book or notes are required' using errcode = 'MN400';
  end if;
  if jsonb_typeof(p_nodes) is distinct from 'array'
     or jsonb_typeof(p_relations) is distinct from 'array'
     or jsonb_typeof(p_sources) is distinct from 'array'
     or jsonb_typeof(p_details) is distinct from 'object' then
    raise exception 'nodes, relations and sources must be lists' using errcode = 'MN400';
  end if;
  -- One call stays well inside the API's statement time limit; bigger maps send more calls.
  if jsonb_array_length(p_nodes) + jsonb_array_length(p_relations) > 2000
     or jsonb_array_length(p_sources) > 50 then
    raise exception 'too many rows in one call' using errcode = 'MN400';
  end if;
  if pg_column_size(p_details) > 4096 then
    raise exception 'details are too long' using errcode = 'MN400';
  end if;

  select m.owner_id into map_owner from public.maps m where m.id = p_map for update;
  if not found then
    insert into public.maps (id, owner_id, type, title, languages)
    values (p_map, me, p_type, p_title, coalesce(p_languages, '{}'));
    is_new := true;
  elsif map_owner <> me then
    raise exception 'this map belongs to someone else' using errcode = '42501';
  end if;

  if exists (select 1 from public.map_docs d where d.map_id = p_map)
     or exists (select 1 from public.map_doc_updates u where u.map_id = p_map) then
    raise exception 'this map has been opened in the app, so it can no longer be imported into'
      using errcode = 'MN409';
  end if;

  -- map_id, created_by and the owner are always set here, never taken from the caller.
  insert into public.nodes (
    id, map_id, parent_id, sort_order, level, title, summary, type, color, importance, details,
    lang, dir, branch_view, collapsed, source, ai_added, ai_added_reason, origin, created_by)
  select n.id, p_map, n.parent_id, coalesce(n.sort_order, 0), n.level, n.title,
         coalesce(n.summary, ''), n.type, n.color, coalesce(n.importance, 'supporting'),
         coalesce(n.details, '[]'::jsonb), n.lang, coalesce(n.dir, 'ltr'),
         coalesce(n.branch_view, 'tree'), coalesce(n.collapsed, false),
         coalesce(n.source, '{"paragraphs": []}'::jsonb), coalesce(n.ai_added, false),
         n.ai_added_reason, coalesce(n.origin, 'ai'), me
  from jsonb_to_recordset(p_nodes) as n (
    id uuid, parent_id uuid, sort_order int, level text, title text, summary text, type text,
    color text, importance text, details jsonb, lang text, dir text, branch_view text,
    collapsed boolean, source jsonb, ai_added boolean, ai_added_reason text, origin text)
  on conflict (id) do nothing;
  get diagnostics added_nodes = row_count;

  insert into public.sources (
    id, map_id, chapter_node_id, kind, pages, paragraphs, file_name, file_size, file_hash,
    created_by)
  select s.id, p_map, s.chapter_node_id, coalesce(s.kind, 'text'), s.pages,
         coalesce(s.paragraphs, '[]'::jsonb), s.file_name, s.file_size, s.file_hash, me
  from jsonb_to_recordset(p_sources) as s (
    id uuid, chapter_node_id uuid, kind text, pages int, paragraphs jsonb, file_name text,
    file_size bigint, file_hash text)
  on conflict (id) do nothing;
  get diagnostics added_sources = row_count;

  insert into public.relations (
    id, map_id, from_node, to_node, type, label, direction, status, confidence, origin,
    created_by)
  select r.id, p_map, r.from_node, r.to_node, coalesce(r.type, 'related'), coalesce(r.label, ''),
         coalesce(r.direction, 'forward'), coalesce(r.status, 'accepted'), r.confidence,
         coalesce(r.origin, 'ai'), me
  from jsonb_to_recordset(p_relations) as r (
    id uuid, from_node uuid, to_node uuid, type text, label text, direction text, status text,
    confidence text, origin text)
  on conflict (id) do nothing;
  get diagnostics added_relations = row_count;

  -- The counts go last so the caller's details can never overwrite them.
  perform public.admin_log(
    'map_imported', 'map', p_map::text, 'built with the admin MCP mapper',
    p_details || jsonb_build_object('new_map', is_new, 'nodes', added_nodes,
                                    'relations', added_relations, 'sources', added_sources));

  return jsonb_build_object('map_id', p_map, 'new_map', is_new, 'nodes', added_nodes,
                            'relations', added_relations, 'sources', added_sources);
end;
$$;

revoke all on function
  public.admin_import_map(uuid, text, text, text[], jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function
  public.admin_import_map(uuid, text, text, text[], jsonb, jsonb, jsonb, jsonb)
  to authenticated;
