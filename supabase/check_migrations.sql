-- MyNota: which migrations are applied in this database?
-- Paste into Supabase › SQL Editor and press Run. Read only: it changes nothing.
-- Every row should say "applied". Apply the missing ones in order (see docs/migrations.md).
select step, file, case when applied then 'applied' else 'MISSING' end as status
from (values
  (1,  '20261030120000_profiles.sql',              to_regclass('public.profiles') is not null),
  (2,  '20261030120100_subjects.sql',              to_regclass('public.subjects') is not null),
  (3,  '20261030120200_maps.sql',                  to_regclass('public.maps') is not null),
  (4,  '20261030130000_map_content.sql',           to_regclass('public.nodes') is not null),
  (5,  '20261030140000_sources_files.sql',         exists (select 1 from information_schema.columns
                                                     where table_schema = 'public' and table_name = 'sources'
                                                       and column_name = 'file_hash')),
  (6,  '20261031100000_suggestions_and_stats.sql', to_regprocedure('public.map_stats(uuid[])') is not null),
  (7,  '20261031120000_flashcards.sql',            to_regclass('public.cards') is not null),
  (8,  '20261031130000_review_undo.sql',           exists (select 1 from pg_policies
                                                     where tablename = 'review_logs'
                                                       and policyname = 'review_logs: undo own recent')),
  (9,  '20261031150000_search.sql',                to_regprocedure('public.search_all(text, integer)') is not null),
  (10, '20261031170000_sharing.sql',               to_regclass('public.map_invites') is not null)
) as m (step, file, applied)
order by step;
