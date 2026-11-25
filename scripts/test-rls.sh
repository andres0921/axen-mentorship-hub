#!/usr/bin/env bash
# RLS / migration test harness. Runs against a THROWAWAY local Postgres, never
# against Supabase. Creates a fresh database, loads a Supabase stub,
# supabase/schema.sql, legacy (pre-migration) data, every migration in order,
# checks the data copy, applies the migrations a SECOND time (idempotency),
# seeds portal fixtures and runs the RLS matrix.
#
# Env overrides: PGHOST (default /tmp), PGPORT (54329), PGUSER (postgres),
#                TEST_DB (axen_rls_test)
set -uo pipefail

export PATH="/usr/lib/postgresql/17/bin:$PATH"
export PGHOST="${PGHOST:-/tmp}"
export PGPORT="${PGPORT:-54329}"
export PGUSER="${PGUSER:-postgres}"
DB="${TEST_DB:-axen_rls_test}"

case "$PGHOST" in
  /tmp|localhost|127.0.0.1|/var/run/postgresql) ;;
  *) echo "Refusing to run against non-local PGHOST=$PGHOST" >&2; exit 2 ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="$(mktemp -t axen-rls-XXXXXX.log)"

run() {  # run <file> : stop on first SQL error
  echo "-- $1" >>"$LOG"
  if ! psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$1" >>"$LOG" 2>&1; then
    echo "ERROR while running $1 (see below)"; tail -n 30 "$LOG"; echo "Full log: $LOG"; exit 1
  fi
}

echo "Creating fresh database $DB on $PGHOST:$PGPORT"
psql -X -q -d postgres -c "drop database if exists $DB with (force)" >>"$LOG" 2>&1
psql -X -q -d postgres -c "create database $DB" >>"$LOG" 2>&1 || { echo "Could not create $DB"; cat "$LOG"; exit 1; }

run supabase/tests/00_supabase_stub.sql
run supabase/schema.sql
run supabase/tests/01_legacy_seed.sql
run supabase/tests/02_test_helpers.sql

MIGRATIONS=$(ls supabase/migrations/*.sql | sort)
for pass in 1 2; do
  for m in $MIGRATIONS; do run "$m"; done
  echo "Migrations applied (pass $pass)"
  run supabase/tests/03_post_migration_checks.sql
done

run supabase/tests/04_fixtures.sql
run supabase/tests/rls_matrix.sql

# Scenario 2: migrations on an EMPTY project (fresh install, no legacy data).
FRESH="${DB}_fresh"
psql -X -q -d postgres -c "drop database if exists $FRESH with (force)" >>"$LOG" 2>&1
psql -X -q -d postgres -c "create database $FRESH" >>"$LOG" 2>&1
for f in supabase/tests/00_supabase_stub.sql supabase/schema.sql $MIGRATIONS; do
  if ! psql -X -q -v ON_ERROR_STOP=1 -d "$FRESH" -f "$f" >>"$LOG" 2>&1; then
    echo "ERROR applying $f to empty database"; tail -n 30 "$LOG"; exit 1
  fi
done
echo "Migrations applied to empty database $FRESH"
psql -X -q -d postgres -c "drop database if exists $FRESH with (force)" >>"$LOG" 2>&1

PASS=$(grep -c 'PASS: ' "$LOG" || true)
FAIL=$(grep -c 'FAIL: ' "$LOG" || true)
grep -E 'FAIL: ' "$LOG" | sed 's/^.*NOTICE: *//' || true
echo "----------------------------------------"
echo "RLS tests: PASS=$PASS FAIL=$FAIL   (log: $LOG)"
if [ "$FAIL" -ne 0 ] || [ "$PASS" -eq 0 ]; then exit 1; fi
