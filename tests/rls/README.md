# RLS tests

These tests run real SQL against Postgres as the `anon` and `authenticated` roles, the
same way Supabase's API does, and check every policy in `supabase/migrations`.

## Run locally (no Docker needed)

```bash
tests/rls/scripts/start-db.sh   # throwaway Postgres on :54329 + shim + all migrations
pnpm test:rls
```

`supabase-shim.sql` provides just enough of Supabase (`auth.users`, `auth.uid()`, API roles,
default grants) for the migrations to run on plain Postgres.

## Run against the Supabase CLI stack

```bash
supabase start
RLS_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm test:rls
```

Re-run `start-db.sh` after changing a migration; it recreates the database from scratch.
