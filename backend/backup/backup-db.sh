#!/usr/bin/env bash
#
# NoteCord — Postgres backup script.
#
# Usage:
#   ./backup-db.sh
#
# Reads DB connection + retention/offsite config from backend/.env (same file
# setup-schema.js uses). See README.md for setup (rclone/R2, retention, cron).

set -u
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_DIR="$SCRIPT_DIR/db"
LOG_FILE="$DB_DIR/backup.log"
COMPOSE_FILE="$BACKEND_DIR/docker-compose.yml"

mkdir -p "$DB_DIR"

log() {
  # timestamp | outcome | detail
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) | $1 | $2" >> "$LOG_FILE"
}

fail() {
  echo "❌ $1" >&2
  log "FAILURE" "$1"
  exit 1
}

# ── Load backend/.env (KEY=VALUE lines only, same convention as setup-schema.js) ──
ENV_FILE="$BACKEND_DIR/.env"
[ -f "$ENV_FILE" ] || fail "backend/.env not found — copy backend/.env.example and fill it in first"

set -a
# shellcheck disable=SC1090
source <(grep -v '^\s*#' "$ENV_FILE" | grep '=')
set +a

: "${DB_USER:?DB_USER not set in backend/.env}"
: "${DB_PASSWORD:?DB_PASSWORD not set in backend/.env}"
: "${DB_DATABASE:?DB_DATABASE not set in backend/.env}"
RETENTION="${BACKUP_RETENTION_COUNT:-14}"

TIMESTAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
DUMP_FILE="$DB_DIR/notecord-db-$TIMESTAMP.dump"
SQL_GZ_FILE="$DB_DIR/notecord-db-$TIMESTAMP.sql.gz"

START_TIME=$(date +%s)

echo "→ Dumping Postgres (custom format) to $DUMP_FILE"
PGPASSWORD="$DB_PASSWORD" docker compose -f "$COMPOSE_FILE" exec -T database \
  pg_dump -U "$DB_USER" -Fc "$DB_DATABASE" > "$DUMP_FILE"
DUMP_EXIT=$?

if [ $DUMP_EXIT -ne 0 ] || [ ! -s "$DUMP_FILE" ]; then
  rm -f "$DUMP_FILE"
  fail "pg_dump failed or produced an empty file (exit $DUMP_EXIT) — is the database container up? (docker compose up -d)"
fi
echo "✓ Custom-format dump complete ($(du -h "$DUMP_FILE" | cut -f1))"

echo "→ Dumping plain SQL (gzip) to $SQL_GZ_FILE"
PGPASSWORD="$DB_PASSWORD" docker compose -f "$COMPOSE_FILE" exec -T database \
  pg_dump -U "$DB_USER" "$DB_DATABASE" | gzip > "$SQL_GZ_FILE"
SQL_EXIT=$?

if [ $SQL_EXIT -ne 0 ] || [ ! -s "$SQL_GZ_FILE" ]; then
  rm -f "$SQL_GZ_FILE"
  fail "plain-SQL gzip dump failed or produced an empty file (exit $SQL_EXIT)"
fi
echo "✓ Plain-SQL gzip dump complete ($(du -h "$SQL_GZ_FILE" | cut -f1))"

# ── Retention: keep the last $RETENTION of each artifact type ────────────────
echo "→ Applying retention (keep last $RETENTION)"
for pattern in 'notecord-db-*.dump' 'notecord-db-*.sql.gz'; do
  # shellcheck disable=SC2012
  ls -1t "$DB_DIR"/$pattern 2>/dev/null | tail -n "+$((RETENTION + 1))" | while IFS= read -r old; do
    echo "  ↳ removing old backup $(basename "$old")"
    rm -f "$old"
  done
done

# ── Offsite sync to Cloudflare R2 via rclone ─────────────────────────────────
if command -v rclone >/dev/null 2>&1; then
  R2_BUCKET="${R2_BUCKET:-}"
  R2_BACKUP_PREFIX="${R2_BACKUP_PREFIX:-notecord}"
  if [ -z "$R2_BUCKET" ]; then
    fail "rclone is installed but R2_BUCKET is not set in backend/.env — see README.md"
  fi
  echo "→ Syncing to r2:$R2_BUCKET/$R2_BACKUP_PREFIX/db/"
  rclone copy "$DUMP_FILE" "r2:$R2_BUCKET/$R2_BACKUP_PREFIX/db/" \
    && rclone copy "$SQL_GZ_FILE" "r2:$R2_BUCKET/$R2_BACKUP_PREFIX/db/" \
    || fail "rclone offsite sync failed — local dump succeeded but is NOT yet copied offsite"
  echo "✓ Offsite copy complete"
else
  fail "rclone not found on PATH — offsite backup is required, not optional. See README.md to install/configure it."
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
SIZE="$(du -ch "$DUMP_FILE" "$SQL_GZ_FILE" | tail -1 | cut -f1)"

node "$SCRIPT_DIR/lib/report-status.js" db "$SIZE, ${DURATION}s" "dump=$DUMP_FILE" || true

log "SUCCESS" "size=$SIZE duration=${DURATION}s dump=$(basename "$DUMP_FILE")"
echo "✅ Backup complete in ${DURATION}s (total size $SIZE)"
