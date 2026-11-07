#!/usr/bin/env bash
# =====================================================================
# Nobino — fast update on the server (without reinstalling system dependencies)
#
#   sudo bash deploy/update.sh                     # pull + npm ci + build + backup + migrate + restart
#   sudo bash deploy/update.sh --no-pull           # without git pull (code was changed right here)
#   sudo bash deploy/update.sh --no-backup         # without pg_dump (database too big / low disk space)
#   sudo bash deploy/update.sh --backup-dir /var/backups/nobino
#   sudo bash deploy/update.sh --keep 5            # how many backups to keep (default 10)
#   sudo bash deploy/update.sh --rollback          # restore database + code to before the last upgrade
#   sudo bash deploy/update.sh --rollback=/path/x.dump
#   sudo bash deploy/update.sh --yes               # no prompts (required for non-interactive --rollback)
#   sudo bash deploy/update.sh --dry-run           # only show; no command is executed
# The database address is always printed with the password masked (postgresql://user:***@host/db);
# the password never goes into argv — it is converted from DATABASE_URL itself into
# PGPASSWORD/PGUSER/… and cleared immediately after pg_dump/pg_restore, so it cannot be
# read in `ps auxe` and monitoring tool logs.
#
# Database: no data is deleted or overwritten; only the schema is aligned
# (migrate deploy if prisma/migrations exists, otherwise db push). Right before that
# a full backup is taken with `pg_dump --format=custom` in backups/ and
# the pre-upgrade commit is written to a `.meta` file next to it; if migrate fails
# the script **stops before restarting** so the service does not come up with an
# incompatible table, and it shows the same backup for `--rollback`.
#
# Warning: backups/*.dump files contain all user data. This folder
# is gitignored and not served externally (nginx only uses frontend/dist as root);
# move it elsewhere with --backup-dir if you wipe the server.
# =====================================================================
set -euo pipefail
C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✅ %s%s\n' "$C_OK" "$*" "$C_OFF"; }
warn() { printf '%s⚠️  %s%s\n' "$C_WARN" "$*" "$C_OFF"; }
die()  { printf '%s❌ %s%s\n' "$C_ERR" "$*" "$C_OFF" >&2; exit 1; }
run()  { if $DRY_RUN; then printf '%s[dry] %s%s\n' "$C_DIM" "$*" "$C_OFF"; else "$@"; fi; }
# Extracts the password from the address: postgresql://u:p@h/d → postgresql://u:***@h/d.
# An address without a password stays untouched, and if the password itself contains
# "@" it is still masked correctly (whatever lies between "://" and the last "@" is user/password).
mask_url() {
  local u="${1:-}" proto userinfo host user
  [[ "$u" =~ ^([^:/]+://)(.*)@([^@]+)$ ]] || { printf '%s' "$u"; return 0; }
  proto="${BASH_REMATCH[1]}"; userinfo="${BASH_REMATCH[2]}"; host="${BASH_REMATCH[3]}"
  [[ "$userinfo" == *:* ]] || { printf '%s' "$u"; return 0; }
  user="${userinfo%%:*}"
  printf '%s%s:***@%s' "$proto" "$user" "$host"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DRY_RUN=false
DO_PULL=true
DO_BACKUP=true
AUTO_YES=false
ROLLBACK=false
ROLLBACK_DUMP=""
KEEP="${KEEP:-10}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --no-pull) DO_PULL=false; shift ;;
    --no-backup) DO_BACKUP=false; shift ;;
    --yes) AUTO_YES=true; shift ;;
    --rollback) ROLLBACK=true; shift ;;
    --rollback=*) ROLLBACK=true; ROLLBACK_DUMP="${1#*=}"; shift ;;
    --backup-dir) [[ $# -ge 2 ]] || die "--backup-dir needs a path"; BACKUP_DIR="$2"; shift 2 ;;
    --backup-dir=*) BACKUP_DIR="${1#*=}"; shift ;;
    --keep) [[ $# -ge 2 ]] || die "--keep needs a number"; KEEP="$2"; shift 2 ;;
    --keep=*) KEEP="${1#*=}"; shift ;;
    -h|--help) awk 'NR>1 && /^#/ {sub(/^# ?/,""); print; next} NR>1 {exit}' "$0"; exit 0 ;;
    *) die "Unknown option: $1 (see the option list with --help)" ;;
  esac
done
[[ "$KEEP" =~ ^[0-9]+$ ]] && [[ "$KEEP" -ge 1 ]] || die "--keep takes an integer ≥1 (default 10)"
[[ -f "$APP_DIR/package.json" ]] || die "Project directory not found: $APP_DIR"
ENV_FILE="$APP_DIR/.env"

# Reads a key from .env (quotes and CR are stripped; empty string if the file is missing).
env_value() {
  [[ -f "$ENV_FILE" ]] || return 0
  awk -v k="$1" 'BEGIN{FS="="} $1==k { v=substr($0, index($0,"=")+1); gsub(/\r$/,"",v); gsub(/^"/,"",v); gsub(/"$/,"",v); print v }' "$ENV_FILE" | tail -1
}
DB_URL="$(env_value DATABASE_URL)"; [[ -n "$DB_URL" ]] || DB_URL="${DATABASE_URL:-}"
# The Prisma query string (?schema=public&…) is not understood by libpq; for pg_dump/pg_restore
# only the plain database address is needed.
DB_TARGET="${DB_URL%%\?*}"
DB_NAME="$(printf '%s' "$DB_TARGET" | sed -E 's#.*/([^/?]+).*#\1#')"
# Whatever is printed to stdout is always masked; in a real run the full address
# no longer goes into argv either (HI-1): credentials are passed only via libpq variables.
DB_DISPLAY="$(mask_url "$DB_TARGET")"
PG_ARGS=()

# %XX → character (URL-encoded passwords in DATABASE_URL).
url_decode() {
  local s="${1:-}"
  if [[ "$s" == *%* ]]; then printf '%b' "${s//%/\\x}"; else printf '%s' "$s"; fi
}

# Converts DATABASE_URL to PGPASSWORD/PGUSER/PGHOST/PGPORT/PGDATABASE and builds PG_ARGS,
# so no password is visible on the command line (and in `ps auxe`). Empty or
# non-standard address → the address itself goes to --dbname (so dry-run shows the plan).
prepare_pg() {
  local u="$DB_TARGET" rest="" cred="" hp=""
  PG_ARGS=()
  if [[ -z "$u" ]]; then
    PG_ARGS=(--dbname="postgresql://USER:PASS@HOST:5432/nobino")
    return 0
  fi
  if [[ "$u" != *"://"* ]]; then
    PG_ARGS=(--dbname="$u")
    return 0
  fi
  rest="${u#*://}"
  if [[ "$rest" == *"@"* ]]; then
    cred="${rest%@*}"
    rest="${rest##*@}"
    if [[ "$cred" == *:* ]]; then export PGPASSWORD="$(url_decode "${cred#*:}")"; fi
    if [[ -n "${cred%%:*}" ]]; then export PGUSER="${cred%%:*}"; fi
  fi
  if [[ "$rest" == */* ]]; then
    hp="${rest%%/*}"
    export PGDATABASE="${rest#*/}"
  else
    hp="$rest"
  fi
  if [[ -n "$hp" ]]; then
    if [[ "$hp" == *:* ]]; then export PGHOST="${hp%:*}" PGPORT="${hp#*:}"; else export PGHOST="$hp"; fi
  fi
  if [[ -n "${PGDATABASE:-}" ]]; then
    PG_ARGS=(--dbname="$PGDATABASE")
  else
    PG_ARGS=(--dbname="$u")
  fi
  return 0
}
clear_pg_env() { unset PGPASSWORD PGUSER PGHOST PGPORT PGDATABASE; }
prepare_pg

# ── 0) Rollback (if requested, before anything else) ──────────────
latest_dump() { ls -1t "$BACKUP_DIR"/nobino-*.dump 2>/dev/null | head -1; }

confirm_destructive() {
  $AUTO_YES && return 0
  if [[ -t 0 ]]; then
    warn "$1"
    read -r -p "    Type the word ROLLBACK to continue: " ans
    [[ "${ans:-}" == "ROLLBACK" ]] || die "Cancelled; nothing was changed."
    return 0
  fi
  die "This overwrites the database and was run non-interactively; confirm it with --yes."
}

rollback() {
  local dump commit base cur_branch tables untracked
  dump="$ROLLBACK_DUMP"
  [[ -n "$dump" ]] || dump="$(latest_dump || true)"
  [[ -n "$dump" && -f "$dump" ]] || die "No backup in \"$BACKUP_DIR\". Give the folder path with --backup-dir or --rollback=/path/to.dump."
  base="$(basename "$dump")"
  # Our backup names: nobino-<commit>-<time>.dump — if it is some other hand-made
  # file, no commit is extracted and only the database is restored.
  commit="$(printf '%s' "$base" | sed -E 's/^nobino-(.+)-[0-9]{8}-[0-9]{6}\.dump$/\1/')"
  [[ "$commit" != "$base" ]] || commit=""
  if [[ -z "$DB_URL" ]]; then
    $DRY_RUN || die "DATABASE_URL (in .env or the environment) is required for rollback."
    warn "No DATABASE_URL; dry-run shows a placeholder address."
  fi
  if ! command -v pg_restore >/dev/null 2>&1; then
    $DRY_RUN || die "pg_restore is missing; install it with 'apt-get install postgresql-client'."
    warn "pg_restore is missing; it must be installed on a real server."
  fi
  # Only *uncommitted changes to tracked files* block checkout; untracked files
  # (including backups this script creates inside the repo) are not destroyed by
  # checkout and should not lock the rollback path.
  if [[ -n "$(git -C "$APP_DIR" status --porcelain --untracked-files=no 2>/dev/null || true)" ]]; then
    die "Working tree is dirty (uncommitted changes); commit or stash first so 'git checkout' does not ruin someone's work."
  fi
  untracked="$(git -C "$APP_DIR" status --porcelain --untracked-files=only 2>/dev/null || true)"
  if [[ -n "$untracked" ]]; then
    warn "$(printf '%s\n' "$untracked" | grep -c . || true) untracked file(s); 'git checkout' leaves them alone."
  fi
  cur_branch="$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '-')"
  say "— Rolling back to the state before the last upgrade —"
  say "  Backup  : $dump"
  say "  Commit  : $commit"
  say "  Database: $DB_DISPLAY"
  [[ -f "$dump.meta" ]] && sed 's/^/    /' "$dump.meta"
  confirm_destructive "Database \"$DB_NAME\" will be overwritten with this backup and the code will go back to $commit."
  if command -v pm2 >/dev/null 2>&1; then
    # Writing during restore leaves half-finished data
    run pm2 stop nobino-api
  fi
  # --exit-on-error + --single-transaction: on any error the whole restore is
  # rolled back and the database keeps exactly its previous state; without these two,
  # pg_restore exited with code 0 while half the tables were left empty.
  run pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --single-transaction \
    "${PG_ARGS[@]}" "$dump" \
    || { clear_pg_env; die "pg_restore failed; because of --single-transaction nothing was applied and the code is untouched. Check the state with 'pm2 logs nobino-api' and a manual pg_restore run."; }
  if $DRY_RUN; then
    clear_pg_env
  else
    if command -v psql >/dev/null 2>&1; then
      tables="$(psql -tAc "select count(*) from pg_tables where schemaname='public'" "${PG_ARGS[@]}" 2>/dev/null || true)"
      clear_pg_env
      if [[ "$tables" =~ ^[0-9]+$ ]]; then
        [[ "$tables" -gt 0 ]] || die "The restore created no tables in the public schema; the service will not be restarted. Check the database state manually."
        ok "Restore verified: $tables tables in the public schema"
      else
        warn "Could not read the table count after the restore; check the database manually before restarting."
      fi
    else
      clear_pg_env
      warn "psql is not installed; verification of the restore is limited to pg_restore's exit code."
    fi
  fi
  if [[ -n "$commit" && "$commit" != "-" ]]; then
    run git -C "$APP_DIR" checkout "$commit" || die "Could not check out $commit; the code was left untouched (database has been restored)."
    # Checking out a commit leaves HEAD detached and the next update.sh run fails on
    # a detached HEAD; we saved the previous branch so that run can return to it.
    if ! $DRY_RUN && [[ -d "$APP_DIR/.git" && "$cur_branch" != "HEAD" && "$cur_branch" != "-" ]]; then
      printf '%s\n' "$cur_branch" >"$APP_DIR/.git/nobino-deploy-branch" ||
        warn "The rollback branch ($cur_branch) was not saved; after rollback run 'git checkout $cur_branch' manually."
    fi
  else
    clear_pg_env
    warn "The backup commit is not in the file name; only the database is restored. Move the code back to the previous version manually."
  fi
  DO_PULL=false
  DO_BACKUP=false
  ok "Database and code went back to before the last upgrade; now this version will be rebuilt and restarted."
}

if $ROLLBACK; then rollback; fi

BRANCH="$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '-')"
BEFORE="$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo '-')"

if $DO_PULL; then
  # After a --rollback, HEAD is detached on a commit and `git pull --ff-only` dies
  # on it ("You are not currently on a branch"). We restore the saved branch.
  if ! $DRY_RUN && ! git -C "$APP_DIR" symbolic-ref -q HEAD >/dev/null 2>&1; then
    attach=""
    if [[ -f "$APP_DIR/.git/nobino-deploy-branch" ]]; then
      attach="$(head -1 "$APP_DIR/.git/nobino-deploy-branch" 2>/dev/null || true)"
    fi
    if [[ -z "$attach" ]]; then
      attach="$(git -C "$APP_DIR" symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)"
    fi
    if [[ -z "$attach" || "$attach" == "HEAD" ]]; then
      die "HEAD is detached on a commit and the rollback branch is unknown. Choose the main branch manually:  git checkout <branch>  then run this command again."
    fi
    warn "HEAD is detached (probably after --rollback); returning to branch \"$attach\"."
    run git -C "$APP_DIR" checkout "$attach" || die "Could not return to branch \"$attach\"."
  fi
  say "— git pull ($BRANCH) —"
  if ! $DRY_RUN && [[ -n "$(git -C "$APP_DIR" status --porcelain)" ]]; then
    warn "There are uncommitted changes in the working tree; pull only proceeds if there is no conflict."
  fi
  run git -C "$APP_DIR" pull --ff-only
fi
AFTER="$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo '-')"
ok "Code: $BEFORE → $AFTER"

say "— Installing dependencies (npm ci every time; no lockfile change detection) —"
for dir in "" "backend" "frontend"; do
  cwd="$APP_DIR"; [[ -n "$dir" ]] && cwd="$APP_DIR/$dir"
  if [[ -f "$cwd/package-lock.json" ]]; then
    run sh -c "cd '$cwd' && npm ci --no-audit --no-fund"
  else
    run sh -c "cd '$cwd' && npm install --no-audit --no-fund"
  fi
done

say "— Prisma generate + build —"
PRISMA_CLI="$APP_DIR/node_modules/prisma/build/index.js"
$DRY_RUN || [[ -f "$PRISMA_CLI" ]] || die "prisma CLI is missing; did npm ci fail?"
run node "$PRISMA_CLI" generate --schema "$APP_DIR/prisma/schema.prisma"
run node "$APP_DIR/scripts/build-release.mjs" --skip-install --no-smoke

# ── Backup: after the build (so if the build failed the database is untouched) and
#    definitely before any schema change. In --dry-run this step only prints the plan
#    and tolerates missing tools/`DATABASE_URL` with a warning (a real run is
#    strict: without a backup, migrate and restart do not happen). ────────
say "— Database backup (pg_dump) —"
DUMP=""
if $DO_BACKUP; then
  if [[ -z "$DB_URL" ]]; then
    $DRY_RUN || die "DATABASE_URL was not found in .env or the environment; we do not continue without a backup. Complete .env or pass --no-backup."
    warn "DATABASE_URL is missing; dry-run shows a placeholder address."
  fi
  if ! command -v pg_dump >/dev/null 2>&1; then
    $DRY_RUN || die "pg_dump is not in PATH; 'apt-get install postgresql-client' (or deploy/bootstrap.sh) installs it. If you deliberately want no backup: --no-backup"
    warn "pg_dump is missing; dry-run prints the planned command, but it must be installed on a real server."
  fi
  DUMP="$BACKUP_DIR/nobino-${BEFORE}-$(date +%Y%m%d-%H%M%S).dump"
  run mkdir -p "$BACKUP_DIR"
  run pg_dump --no-owner --no-privileges --format=custom --file="$DUMP" "${PG_ARGS[@]}"
  clear_pg_env
  if ! $DRY_RUN; then
    [[ -s "$DUMP" ]] || die "Backup \"$DUMP\" was not created; we stop before changing the schema."
    printf 'commit=%s\nbranch=%s\ndb=%s\nbytes=%s\nutc=%s\n' \
      "$BEFORE" "$BRANCH" "$DB_NAME" "$(wc -c <"$DUMP" | tr -d ' ')" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$DUMP.meta"
    ok "Backup: $DUMP"
    # Rotation: only the $KEEP newest backups remain (dump and .meta together)
    while IFS= read -r oldf; do
      [[ -n "$oldf" && -f "$oldf" ]] || continue
      rm -f "$oldf" "$oldf.meta"
      warn "Old backup removed: $(basename "$oldf")"
    done < <(ls -1t "$BACKUP_DIR"/nobino-*.dump 2>/dev/null | tail -n +$((KEEP + 1)))
  fi
else
  warn "Backup skipped (--no-backup or a --rollback path); if the schema changes you have no way back except a manual backup."
fi

say "— Aligning the database schema (without deleting data) —"
SCHEMA_OK=true
if [[ -d "$APP_DIR/prisma/migrations" ]]; then
  run node "$PRISMA_CLI" migrate deploy --schema "$APP_DIR/prisma/schema.prisma" || SCHEMA_OK=false
else
  run node "$PRISMA_CLI" db push --skip-generate --schema "$APP_DIR/prisma/schema.prisma" || SCHEMA_OK=false
fi
if ! $SCHEMA_OK; then
  # Restarting with an incompatible table means a 500 on every page; it is better
  # to keep the previous version up on the same healthy database and let the operator decide.
  printf '%s❌ schema was not aligned; the service was not restarted.%s\n' "$C_ERR" "$C_OFF" >&2
  say "   Backup from this moment: ${DUMP:-no backup was taken}"
  say "   Full rollback:           sudo bash deploy/update.sh --rollback --yes"
  say "   Reasons and log:         pm2 logs nobino-api --lines 40  +  a manual migrate deploy run"
  exit 1
fi

say "— Restarting the service —"
if command -v pm2 >/dev/null 2>&1; then
  # restart (not reload) so cron jobs are not duplicated in cluster mode
  run pm2 restart nobino-api --update-env
  run pm2 save
  ok "nobino-api restarted"
elif [[ -f "$APP_DIR/scripts/paas-start.mjs" ]]; then
  warn "PM2 is not available; if it runs under Docker:  docker compose up -d --build"
fi

say "— Health check —"
PORT="$(env_value PORT)"; [[ -n "$PORT" ]] || PORT="${PORT:-3100}"  # not in .env ← process env ← 3100
if $DRY_RUN; then
  printf '%s[dry] curl http://127.0.0.1:%s/api/health?db=1%s\n' "$C_DIM" "$PORT" "$C_OFF"
else
  # The health check is the real deployment gate, not a warning. (1) Retry for up to 90 seconds, because
  # boot with prisma generate/migrate takes time; (2) if pm2 and ss are available,
  # the pid holding the port is matched against the target service pid so that the health of another
  # process on the same port does not make this deployment look "successful"; (3) failure → exit 1.
  EXPECT_PID=""
  if command -v pm2 >/dev/null 2>&1; then
    EXPECT_PID="$(pm2 pid nobino-api 2>/dev/null | tr -dc '0-9')"
  fi
  HEALTH_URL="http://127.0.0.1:$PORT/api/health?db=1"
  H=""
  waited=0
  while [[ -z "$H" && $waited -lt 90 ]]; do
    H="$(curl -fsS --max-time 10 "$HEALTH_URL" 2>/dev/null || true)"
    if [[ -z "$H" ]]; then sleep 3; waited=$((waited + 3)); fi
  done
  if [[ -z "$H" ]]; then
    say "   Service log:  pm2 logs nobino-api --lines 60"
    if [[ -n "$DUMP" ]]; then
      warn "If the new version is broken: sudo bash deploy/update.sh --rollback --yes (backup: $DUMP)"
    fi
    die "The service did not respond at $HEALTH_URL within 90 seconds; the deployment failed."
  fi
  OWNER=""
  if [[ -n "$EXPECT_PID" ]] && command -v ss >/dev/null 2>&1; then
    OWNER="$(ss -ltnp "sport = :$PORT" 2>/dev/null | grep -oE 'pid=[0-9]+' | head -1 | sed 's/pid=//')"
    if [[ -n "$OWNER" && "$OWNER" != "$EXPECT_PID" ]]; then
      die "Port $PORT was answered by process $OWNER, not by nobino-api (pid $EXPECT_PID). Stop that process before continuing; the freshly built version is not being served."
    fi
  fi
  say "$H"
  if [[ -n "$OWNER" ]]; then ok "Server is healthy (pid $OWNER on port $PORT)"; else ok "Server is healthy (port $PORT)"; fi
fi
say ""
say "${C_OK}Update finished.${C_OFF} (commit: ${BEFORE} → ${AFTER}) backup: ${DUMP:-—}"
