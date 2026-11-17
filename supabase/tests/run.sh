#!/usr/bin/env bash
# Runs the migrations and their tests against a throwaway local Postgres.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
[ -n "$BIN" ] || { echo "PostgreSQL server binaries not found" >&2; exit 1; }

DATA="$(mktemp -d)"
PORT="${PGTEST_PORT:-54329}"
as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$DATA"

cleanup() {
  as_pg "$BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$DATA"
}
trap cleanup EXIT

as_pg "$BIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
as_pg "$BIN/pg_ctl" -D "$DATA" -o "-p $PORT -c listen_addresses='' -k $DATA" -w start >/dev/null

sql() { as_pg "$BIN/psql" -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

sql -f "$HERE/shim.sql"
for migration in "${MIGRATIONS_DIR:-$HERE/../migrations}"/*.sql; do
  sql -f "$migration"
done
OUTPUT="$(sql -o /dev/null -f "$HERE/tests.sql" 2>&1)" || { echo "$OUTPUT" | sed 's/^psql:[^ ]* NOTICE:  //'; exit 1; }
echo "$OUTPUT" | sed 's/^psql:[^ ]* NOTICE:  //'
echo "Database tests passed ($(echo "$OUTPUT" | grep -c 'ok - ') checks)."
