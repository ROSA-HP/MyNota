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
| 11 | `20261031190000_live_docs.sql` | 6 | `map_docs`, `map_doc_updates`, `doc_load()`, `doc_push()`, `doc_compact()`, who may join a map's live (Realtime) channels. **Also one dashboard setting, below** |
| 12 | `20261101090000_admin.sql` | 7.1 | `audit_log`, `login_events`, `user_flags`, `app_settings` (limits and feature switches); the `admin_*` functions (admin + two-factor session checked in the database, every action audited); status `banned` |
| 13 | `20261101100000_limits_and_logins.sql` | 7.4 | limits from `app_settings` (maps per day, blocks per map, uploads per day; error `MN429`), switches for sign-ups and new share links (`MN403`), `rate_limits` + `rate_hit()`, `log_signin()`, the password-attempt hook. **Also one Auth hook and one Edge Function, below** |
| 14 | `20261101110000_client_errors.sql` | 7.6 | `client_errors` (scrubbed app errors, 30 days), `report_client_error()` (30 an hour per person, 300 an hour for visitors), `admin_client_errors()` |

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

### After migration 11: one Realtime setting

Live editing (Phase 6) uses private Realtime channels, checked by the rules in migration 11.
Supabase › **Realtime** › **Settings** › turn **off** "Allow public access" › Save. Without
this, channels are still checked when the app joins them as private (it always does), but
turning it off makes sure nothing can join a channel without those checks.

Optional, recommended: in the project settings, find the access token (JWT) expiry setting and
set it to 15 minutes (900 seconds). Someone removed from a map stops receiving live changes
when their token renews (the default is 1 hour); they can never save changes after removal.

### After migration 13: the password hook and the log-signin function

1. Supabase › **Authentication** › **Hooks** › **Password verification attempt** › enable ›
   type **Postgres** › schema `public`, function `hook_password_attempt` › Save. Failed password
   sign-ins then appear in Admin › Login activity. It never blocks a sign-in.
2. Deploy the Edge Function that records successful sign-ins (device and approximate country;
   the IP address is only stored as a salted hash). One time, in a terminal in the project
   folder:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your project ref>
   npx supabase secrets set IP_HASH_SALT=<a long random string> APP_ORIGIN=<your app's address>
   npx supabase functions deploy log-signin
   ```

   Linking only connects the CLI to the project; it does not run any migration. Until the
   function is deployed, signing in works as before and only the successful sign-ins are
   missing from Login activity.
3. Deploy the account-deletion function (Settings › Your data › Delete my account; Phase 7.5):

   ```bash
   npx supabase functions deploy delete-account
   ```

   Until it is deployed, the delete button shows "could not be deleted"; nothing is removed.

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
