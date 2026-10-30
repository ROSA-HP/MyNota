#!/usr/bin/env bash
# Starts a throwaway local Postgres for RLS tests and applies the shim + all migrations.
# Usage: tests/rls/scripts/start-db.sh   (prints the DATABASE_URL to use)
# Alternatively point RLS_DATABASE_URL at a `supabase start` database (skip the shim).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="${RLS_PGDATA:-/tmp/mynota-rls-pg}"
PORT="${RLS_PGPORT:-54329}"
RUNAS=()
[ "$(id -u)" = "0" ] && RUNAS=(sudo -u postgres)

if [ ! -f "$DATA/PG_VERSION" ]; then
  mkdir -p "$DATA" && [ ${#RUNAS[@]} -gt 0 ] && chown postgres "$DATA"
  "${RUNAS[@]}" "$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
fi
"${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/log" status >/dev/null 2>&1 ||
  "${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/log" -w start >/dev/null

URL="postgresql://postgres@127.0.0.1:$PORT"
psql "$URL/postgres" -qtc "drop database if exists mynota_rls" >/dev/null
psql "$URL/postgres" -qtc "create database mynota_rls" >/dev/null
psql "$URL/mynota_rls" -q -v ON_ERROR_STOP=1 -f "$ROOT/tests/rls/supabase-shim.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do
  psql "$URL/mynota_rls" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done
echo "$URL/mynota_rls"
