# Database migrations

All database changes live in `supabase/migrations/`, one SQL file per change, named by date so
they sort in the order they must run. Each file creates its tables **with** their row level
security and is meant to run **once**, in order.

## The migrations so far

| # | File | Phase | What it adds |
|---|---|---|---|
| 1 | `20261030120000_profiles.sql` | 1 | `profiles` (one per account, made on sign-up), `is_active_user()`, `username_available()` |
| 2 | `20261030120100_subjects.sql` | 1 | `subjects` (folders for maps) |
| 3 | `20261030120200_maps.sql` | 1 | `maps`, `map_members`, `map_role()`; the share-link columns (secret hidden) |
| 4 | `20261030130000_map_content.sql` | 2 | `nodes`, `relations`, `sources`, `ai_jobs` and their guards |
| 5 | `20261030140000_sources_files.sql` | 3 | file name / size / hash on `sources` (books stay on the device) |
| 6 | `20261031100000_suggestions_and_stats.sql` | 3 | link suggestions (confidence, dismissed), `map_stats()` for the library |
| 7 | `20261031120000_flashcards.sql` | 4 | `cards`, `card_progress`, `review_logs`, daily limits on `profiles`, `deck_stats()`, `study_activity()` |
| 8 | `20261031130000_review_undo.sql` | 4.2 | undo in a study session (delete your own review within an hour) |
| 9 | `20261031150000_search.sql` | 4.5 | `pg_trgm`, search columns and indexes, `search_normalize()`, `search_all()` |
| 10 | `20261031170000_sharing.sql` | 5 | `map_invites`, `share_events`, `reports`, all sharing functions; members change only through them |

## Which ones does my database already have?

Open your project on supabase.com › **SQL Editor** › New query, paste the contents of
`supabase/check_migrations.sql`, and press **Run**. It only reads. Each row says `applied` or
`MISSING`. Missing ones are always at the end of the list (they build on each other).

## Applying them

### Option A: SQL Editor (no tools needed; how it has been done so far)

For each `MISSING` file, **in the order of the table**:

1. Open the file from your copy of the repository (for example `D:\Projects\MyNota\supabase\migrations\…`)
   in a text editor and copy all of it.
2. Supabase › SQL Editor › New query › paste › **Run**.
3. Wait for "Success. No rows returned". If it shows an error, stop and send it to me before
   running the next file.

Then run `check_migrations.sql` again: every row should say `applied`.

### Option B: Supabase CLI

Only for a **new, empty** project, or one where every migration was applied by the CLI.
The CLI keeps its own list of what it ran, so it does not know about files you ran in the SQL
Editor and would try to run them again.

```bash
npx supabase login
npx supabase link --project-ref <your project ref>
npx supabase db push
```

## Rules for new migrations

- Never edit a migration that has been applied anywhere; add a new file instead.
- Tables get RLS in the same file that creates them, and tests in `tests/rls/`.
- `bash tests/rls/scripts/start-db.sh && pnpm test:rls` runs every migration on a fresh local
  database and checks the permissions.
- Add the new file to the table above and to `supabase/check_migrations.sql`.
