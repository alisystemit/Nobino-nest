#!/usr/bin/env bash
# =====================================================================
# Nobino (NestJS edition) — single-command installer on an Ubuntu/Debian server
#
#   sudo bash deploy/install.sh --domain nobino.ir
#
# What it does (in order):
#   1) Pre-flight checks: root/sudo, .env file, valid DATABASE_URL
#   2) Installs only the real dependencies: Node.js ≥ 20, nginx, PM2 (if missing)
#      — it does not touch PHP, MySQL/MariaDB, domains or credentials of existing databases
#   3) npm ci + prisma generate + build backend and SPA (scripts/build-release.mjs)
#   4) Prepare the database schema (DB_SETUP=auto→migrate deploy; push→db push; skip→don't touch)
#   5) PM2 service + autostart
#   6) nginx vhost with wildcard subdomains (mah.nobino.ir and ...)
#
# Options:
#   --domain <root-domain>  main domain; pass it several times for multiple domains (alias), or
#                           separate them with commas (default: ROOT_DOMAIN and EXTRA_DOMAINS in .env)
#   --port <port>           internal API/SPA port (default: 3100)
#   --app-dir <path>        install path (default: this repository)
#   --copy                  copy the repository to --app-dir before building
#   --user <user>           PM2 service user for autostart (default: root)
#   --skip-build            do not build (only service and nginx)
#   --skip-nginx            do not create the vhost
#   --tls                   if the SSL certificate is ready, enable the HTTPS block
#   --demo-seed             seed the development demo (empty server only)
#   --dry-run               only print the mutating commands
#
# Nothing is sent outside; all changes stay on this server.
# =====================================================================
set -euo pipefail

C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✅ %s%s\n' "$C_OK" "$*" "$C_OFF"; }
warn() { printf '%s⚠️  %s%s\n' "$C_WARN" "$*" "$C_OFF"; }
die()  { printf '%s❌ %s%s\n' "$C_ERR" "$*" "$C_OFF" >&2; exit 1; }

# Run a mutating command (in --dry-run it is only printed)
run()  { if $DRY_RUN; then printf '%s[dry] %s%s\n' "$C_DIM" "$*" "$C_OFF"; else "$@"; fi; }

# ME-8: a failed schema setup is not just a warning — installing with a half-ready
# database dies on the first query. In dry-run no command is executed (run returns zero) so it cannot die.
db_setup_or_die() {
  local label="$1"; shift
  if ! run "$@"; then
    warn "  $label failed. If Prisma warned about dropping a column/table, take a backup first and run it manually on purpose:"
    warn "    $* --accept-data-loss"
    die "  The installation cannot be complete without a healthy schema (to skip this step: DB_SETUP=skip)."
  fi
}

# An option that takes a value must not die with "$2: unbound variable" when the value is missing (ME-5).
need_value() { [[ $# -ge 2 ]] || die "$1 requires a value (e.g. $1 <value>)"; }

# Escapes a value for the sed right-hand side: \  &  and the | separator (HI-7 is from the same family).
sed_esc() { local s="${1:-}"; s="${s//\\/\\\\}"; s="${s//&/\\&}"; s="${s//|/\\|}"; printf '%s' "$s"; }

# Normalizes a domain (protocol/path/port/whitespace/trailing dot) and strips the "*." prefix;
# the wildcard for the main domain is added automatically. --domain can appear several times
# or take several domains separated by commas/spaces.
norm_domain() {
  local d="${1:-}"
  d="${d,,}"; d="${d#*://}"; d="${d%%/*}"; d="${d%%:*}"; d="${d//[[:space:]]/}"
  d="${d#\*.}"; d="${d%.}"
  printf '%s' "$d"
}
add_domains() {
  local raw="${1:-}" part existing
  raw="${raw//,/ }"
  for part in $raw; do
    part="$(norm_domain "$part")"
    [[ -n "$part" ]] || continue
    for existing in "${DOMAINS[@]:-}"; do
      [[ "$existing" == "$part" ]] && continue 2
    done
    DOMAINS+=("$part")
  done
}

# ── Default values ─────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO_DIR"
DOMAIN=""
DOMAINS=()
PORT="3100"
SERVICE_USER="${SUDO_USER:-root}"
SKIP_BUILD=false
SKIP_NGINX=false
ENABLE_TLS=false
DEMO_SEED=false
DRY_RUN=false
DO_COPY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) need_value "$@"; add_domains "$2"; shift 2 ;;
    --domain=*) add_domains "${1#*=}"; shift ;;
    --port) need_value "$@"; PORT="$2"; shift 2 ;;
    --app-dir) need_value "$@"; APP_DIR="$2"; shift 2 ;;
    --user) need_value "$@"; SERVICE_USER="$2"; shift 2 ;;
    --copy) DO_COPY=true; shift ;;
    --skip-build) SKIP_BUILD=true; shift ;;
    --skip-nginx) SKIP_NGINX=true; shift ;;
    --tls) ENABLE_TLS=true; shift ;;
    --demo-seed) DEMO_SEED=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) awk 'NR>1 && /^#/ {sub(/^# ?/, ""); print; next} NR>1 {exit}' "$0"; exit 0 ;;
    *) die "Unknown option: $1 (see the option list with --help)" ;;
  esac
done

# ── 0) Pre-flight checks ───────────────────────────────────────────
[[ -f "$REPO_DIR/package.json" ]] || die "This script must be run inside the Nobino-nest repository."
[[ "$(id -u)" == "0" ]] || die "Run with sudo:  sudo bash deploy/install.sh --domain nobino.ir"
command -v apt-get >/dev/null 2>&1 || die "This installer is written for Ubuntu/Debian (apt)."

ENV_FILE="$APP_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  [[ -f "$REPO_DIR/.env" ]] && ENV_FILE="$REPO_DIR/.env"
fi
[[ -f "$ENV_FILE" ]] || die "The .env file is missing. Create a .env from deploy/env.production.example and fill in DATABASE_URL, JWT_SECRET and the domain."

# Read the value of a key from .env (without quotes and CR, supporting values containing =)
# Note: awk does not support the \`\\1\` backreference in gsub; so the opening/closing
# quotes are removed separately (the same pattern as update.sh).
read_env() {
  awk -v k="$1" 'BEGIN{FS="="} $1==k { v=substr($0, index($0,"=")+1); gsub(/\r$/,"",v); gsub(/^"/,"",v); gsub(/"$/,"",v); print v }' "$ENV_FILE" | tail -1
}

DB_URL="$(read_env DATABASE_URL)"; [[ -z "$DB_URL" ]] && DB_URL="${DATABASE_URL:-}"
[[ -n "$DB_URL" ]] || die "DATABASE_URL is empty in .env."
case "$DB_URL" in postgresql*://*) ;; *) die "DATABASE_URL must start with postgresql://." ;; esac

# ── Domains: --domain can appear several times; the first domain is the main one ──
ENV_ROOT="$(norm_domain "$(read_env ROOT_DOMAIN)")"
ENV_EXTRA="$(read_env EXTRA_DOMAINS)"
if [[ ${#DOMAINS[@]} -eq 0 ]]; then
  [[ -n "$ENV_ROOT" ]] && add_domains "$ENV_ROOT"
  [[ ${#DOMAINS[@]} -eq 0 ]] && add_domains "$(read_env SITE_URL)"
  add_domains "$ENV_EXTRA"
elif [[ -n "$ENV_ROOT" && "${DOMAINS[0]}" == "$ENV_ROOT" ]]; then
  # keep the alias domains stored in .env so the vhost can be rebuilt (e.g. ssl.sh/update)
  add_domains "$ENV_EXTRA"
fi
[[ ${#DOMAINS[@]} -gt 0 ]] || die "Provide the root domain with --domain (e.g. --domain nobino.ir)"
for d in "${DOMAINS[@]}"; do
  [[ "$d" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || die "Invalid domain: '$d'."
done
DOMAIN="${DOMAINS[0]}"
DOMAIN_ALIASES=()
[[ ${#DOMAINS[@]} -gt 1 ]] && DOMAIN_ALIASES=("${DOMAINS[@]:1}")
# nginx: root domain + wildcard for the hall subdomains + alias domains (without wildcard)
SERVER_NAMES="$DOMAIN *.$DOMAIN"
for d in "${DOMAIN_ALIASES[@]:-}"; do
  [[ -n "$d" ]] && SERVER_NAMES+=" $d"
done
SSL_DOMAIN_ARGS="--domain $DOMAIN"
for d in "${DOMAIN_ALIASES[@]:-}"; do
  [[ -n "$d" ]] && SSL_DOMAIN_ARGS+=" --domain $d"
done

ENV_PORT="$(read_env PORT)"; if [[ -n "$ENV_PORT" && "$PORT" == "3100" ]]; then PORT="$ENV_PORT"; fi
SITE_URL="$(read_env SITE_URL)"; [[ -z "$SITE_URL" ]] && SITE_URL="https://$DOMAIN"
if $ENABLE_TLS || [[ "$SITE_URL" == https* ]]; then SPA_PROTO="https"; else SPA_PROTO="http"; fi

ok "Pre-flight: domains=${DOMAINS[*]}  port=${PORT}  path=${APP_DIR}  .env=${ENV_FILE}"

# ── 0.1) .env security checks (the backend performs the same checks at production boot) ──
JWT_SECRET_VAL="$(read_env JWT_SECRET)"; [[ -z "$JWT_SECRET_VAL" ]] && JWT_SECRET_VAL="${JWT_SECRET:-}"
case "$JWT_SECRET_VAL" in
  ""|dev-secret-change-me|super-secret-key)
    die "JWT_SECRET in .env is empty or has a default value. Generate a secret with 'openssl rand -hex 32' and put it in .env." ;;
esac
[[ ${#JWT_SECRET_VAL} -ge 32 ]] || die "JWT_SECRET must be at least 32 characters (current: ${#JWT_SECRET_VAL})."

PLACEHOLDERS="$(grep -n "CHANGE_ME" "$ENV_FILE" 2>/dev/null || true)"
if [[ -n "$PLACEHOLDERS" ]]; then
  say "⚠ CHANGE_ME placeholders are still left in .env:"
  printf '%s\n' "$PLACEHOLDERS" | sed 's/^/    /'
  die "Complete the CHANGE_ME values and run again."
fi

PAYMENT_SANDBOX_VAL="$(read_env PAYMENT_SANDBOX)"
if [[ "${PAYMENT_SANDBOX_VAL,,}" == "true" ]]; then
  say "⚠ PAYMENT_SANDBOX=true — payments are simulated; for a real environment set it to false or leave it empty."
fi
if [[ "$SITE_URL" == *localhost* || "$SITE_URL" == *127.0.0.1* ]]; then
  say "⚠ SITE_URL points to a local address (${SITE_URL}) — the sitemap and SMS links will be wrong."
fi
if [[ -z "$(read_env CRON_SECRET)" ]]; then
  say "⚠ CRON_SECRET is not set; the internal crons (reminders/settlement/lock keeper) will not run."
fi

# ── 1) System dependencies (only what is needed) ──────────────────
say "— Checking system dependencies —"
NEEDS=()
for pkg in curl ca-certificates gnupg git rsync; do
  dpkg -s "$pkg" >/dev/null 2>&1 || NEEDS+=("$pkg")
done
if [[ ${#NEEDS[@]} -gt 0 ]]; then
  say "  Installing: ${NEEDS[*]}"
  run apt-get update -qq
  run env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${NEEDS[@]}"
fi

node_major() { command -v node >/dev/null 2>&1 && node -v | sed 's/^v\([0-9]*\).*/\1/' || echo 0; }
if [[ "$(node_major)" -lt 20 ]]; then
  say "  Node $(node -v 2>/dev/null || echo 'missing') is outdated/not installed → NodeSource 24"
  run curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup
  run bash /tmp/nodesource_setup
  run apt-get install -y -qq nodejs
else
  ok "  Node $(node -v) is suitable"
fi

if ! command -v nginx >/dev/null 2>&1; then
  say "  Installing nginx"
  run apt-get install -y -qq nginx
fi
if ! command -v pm2 >/dev/null 2>&1; then
  say "  Installing PM2"
  run npm install -g pm2@latest --no-audit --no-fund
fi
if ! command -v curl >/dev/null 2>&1; then
  die "curl is required (for the health check)"
fi
# PHP / MySQL / MariaDB and the other apps on this server are never touched
[[ -e /var/www/html ]] && warn "  /var/www/html exists; it is left untouched (the Nobino vhost is separate)"

# ── 2) Copy the repository to the install path (optional) ─────────
if $DO_COPY && [[ "$APP_DIR" != "$REPO_DIR" ]]; then
  say "— Copying the repository to ${APP_DIR} —"
  run mkdir -p "$APP_DIR"
  run rsync -a --exclude node_modules --exclude .pgdata --exclude .git \
      --exclude backend/dist --exclude frontend/dist --exclude public/uploads \
      "$REPO_DIR/" "$APP_DIR/"
  run cp -f "$ENV_FILE" "$APP_DIR/.env"
  ENV_FILE="$APP_DIR/.env"
fi

# ── 3) Install dependencies and build ─────────────────────────────
if ! $SKIP_BUILD; then
  say "— Installing dependencies (npm ci) —"
  for dir in "" "backend" "frontend"; do
    cwd="$APP_DIR"; [[ -n "$dir" ]] && cwd="$APP_DIR/$dir"
    if [[ -f "$cwd/package-lock.json" ]]; then
      run sh -c "cd '$cwd' && npm ci --no-audit --no-fund"
    else
      run sh -c "cd '$cwd' && npm install --no-audit --no-fund"
    fi
  done

  PRISMA_CLI="$APP_DIR/node_modules/prisma/build/index.js"
  [[ -f "$PRISMA_CLI" ]] || die "Prisma CLI not found; did npm ci succeed?"
  say "— Prisma generate —"
  run node "$PRISMA_CLI" generate --schema "$APP_DIR/prisma/schema.prisma"

  say "— Building the release (backend + SPA) —"
  run node "$APP_DIR/scripts/build-release.mjs" --skip-install --no-smoke
else
  warn "Build skipped (--skip-build)"
fi
# In --dry-run no build was performed and dist/ is not in git either; so this check only
# applies to the real path (HI-5: previously dry-run always died here and the
# "pre-flight test on a bare server" tool was effectively useless).
if $DRY_RUN; then
  warn "dry-run: the existence of backend/dist and frontend/dist was not checked (no build was performed)."
else
  [[ -f "$APP_DIR/backend/dist/main.js" ]] || die "backend/dist/main.js is missing; run without --skip-build."
  [[ -f "$APP_DIR/frontend/dist/index.html" ]] || die "frontend/dist/index.html is missing; the frontend build was not done."
  ok "Build output is ready"
fi

# ── 4) Prepare the database schema ────────────────────────────────
# DB_SETUP=auto (default) | push (always db push) | skip (don't touch at all)
PRISMA_CLI="${PRISMA_CLI:-$APP_DIR/node_modules/prisma/build/index.js}"
DB_SETUP="${DB_SETUP:-auto}"
say "— Preparing the database (DB_SETUP=$DB_SETUP) —"
if [[ ! -f "$PRISMA_CLI" ]]; then
  warn "  prisma CLI is missing; run the schema setup manually (npm run db:push)"
elif [[ "$DB_SETUP" == "skip" ]]; then
  warn "  DB_SETUP=skip → the database schema was not changed"
elif [[ "$DB_SETUP" == "push" ]]; then
  db_setup_or_die "db push" node "$PRISMA_CLI" db push --skip-generate --schema "$APP_DIR/prisma/schema.prisma"
elif [[ -d "$APP_DIR/prisma/migrations" ]]; then
  if ! run node "$PRISMA_CLI" migrate deploy --schema "$APP_DIR/prisma/schema.prisma"; then
    warn "  migrate deploy failed. If this database was previously created with db push,"
    warn "  the tables already exist and the baseline only needs to be marked (no data is dropped):"
    warn "    node $PRISMA_CLI migrate resolve --applied 0_init --schema $APP_DIR/prisma/schema.prisma"
    warn "  or for the previous behavior: DB_SETUP=push  and to leave the database alone: DB_SETUP=skip"
    die "  The installation cannot be complete without a healthy schema (an unprepared database = a 500 server on the first query)."
  fi
else
  warn "  prisma/migrations is missing → db push"
  db_setup_or_die "db push" node "$PRISMA_CLI" db push --skip-generate --schema "$APP_DIR/prisma/schema.prisma"
fi
if $DEMO_SEED; then
  warn "  Demo seed — run it only on an empty database"
  run node "$APP_DIR/prisma/seed.mjs" || warn "seed failed — under NODE_ENV=production the seed guard only opens with ALLOW_PROD_SEED=1"
fi

# ── 5) PM2 service ────────────────────────────────────────────────
say "— PM2 service —"
ECOSYSTEM="$APP_DIR/deploy/ecosystem.config.cjs"
TPL="$SCRIPT_DIR/ecosystem.config.cjs.template"
[[ -f "$TPL" ]] || die "PM2 template is missing: $TPL"
# Placeholder values are escaped for sed: the install path may contain `&` or `|`.
APP_DIR_X="$(sed_esc "$APP_DIR")"; PORT_X="$(sed_esc "$PORT")"; USER_X="$(sed_esc "$SERVICE_USER")"
if $DRY_RUN; then
  # in dry-run we don't change the disk; we write the output to a temp file and show it
  ECOSYSTEM="$(mktemp /tmp/nobino-ecosystem.XXXXXX.cjs)"
  sed -e "s|__APP_DIR__|$APP_DIR_X|g" -e "s|__PORT__|$PORT_X|g" -e "s|__USER__|$USER_X|g" "$TPL" > "$ECOSYSTEM"
  printf '%s[dry] pm2 start %s%s\n' "$C_DIM" "$ECOSYSTEM" "$C_OFF"
else
  mkdir -p "$APP_DIR/logs"
  sed -e "s|__APP_DIR__|$APP_DIR_X|g" -e "s|__PORT__|$PORT_X|g" -e "s|__USER__|$USER_X|g" "$TPL" > "$ECOSYSTEM"
  pm2 start "$ECOSYSTEM" --update-env
  pm2 save
  # HOME_DIR without breaking set -e: if the service user doesn't exist, fall back to the root daemon
  HOME_DIR="$(getent passwd "$SERVICE_USER" 2>/dev/null | cut -d: -f6 || true)"
  if [[ -z "$HOME_DIR" ]]; then
    warn "  User '$SERVICE_USER' does not exist on this server (or has no login shell) → autostart will be registered with the root daemon"
    SERVICE_USER="root"; HOME_DIR="/root"
  fi
  pm2 startup systemd -u "$SERVICE_USER" --hp "$HOME_DIR" >/dev/null 2>&1 \
    || warn "run pm2 startup manually so the service comes up after a server reboot"
  ok "PM2 service started (name: nobino-api, user: $SERVICE_USER)"
fi

# ── 6) nginx vhost ────────────────────────────────────────────────
if ! $SKIP_NGINX; then
  say "— Creating the nginx vhost —"
  NGINX_DIR="$SCRIPT_DIR/nginx"
  UP_PART="$NGINX_DIR/nobino.upstream.conf.part"
  TPL="$NGINX_DIR/nobino.conf.template"
  TLS_SNIPPET="$NGINX_DIR/nobino.tls.conf.snippet"
  [[ -f "$UP_PART" && -f "$TPL" ]] || die "nginx templates are missing: $UP_PART / $TPL"

  CRT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
  KEY="/etc/letsencrypt/live/$DOMAIN/privkey.pem"
  if $ENABLE_TLS && [[ -f "$CRT" && -f "$KEY" ]]; then
    BODY="$TLS_SNIPPET"
    [[ -f "$BODY" ]] || die "TLS template is missing: $BODY"
    say "  Configuring HTTPS (the 80 block only redirects)"
  elif $ENABLE_TLS; then
    BODY="$TPL"
    warn "  No certificate at $CRT; only HTTP will be installed. After issuing the certificate, run again with --tls."
  else
    BODY="$TPL"
  fi

  TMP_CONF="$(mktemp /tmp/nobino-vhost.XXXXXX.conf)"
  { cat "$UP_PART"; cat "$BODY"; } | sed -e "s|__SERVER_NAMES__|$(sed_esc "$SERVER_NAMES")|g" \
      -e "s|__DOMAIN__|$(sed_esc "$DOMAIN")|g" \
      -e "s|__PORT__|$(sed_esc "$PORT")|g" \
      -e "s|__SPA_DIST__|$(sed_esc "$APP_DIR/frontend/dist")|g" \
      -e "s|__UPLOADS__|$(sed_esc "$APP_DIR/public/uploads")|g" \
      -e "s|__VOICE__|$(sed_esc "$APP_DIR/public/voice")|g" \
      -e "s|__TLS_CRT__|$(sed_esc "$CRT")|g" \
      -e "s|__TLS_KEY__|$(sed_esc "$KEY")|g" > "$TMP_CONF"
  ok "  vhost created at $TMP_CONF"

  if $DRY_RUN; then
    printf '%s[dry] cp %s /etc/nginx/sites-available/nobino.conf && nginx -t && systemctl reload nginx%s\n' \
      "$C_DIM" "$TMP_CONF" "$C_OFF"
  else
    # HI-10: the previous version on disk is set aside before rewriting. If
    # nginx -t fails (even for a reason unrelated to Nobino) that same previous version
    # is restored and no reload happens — so the running process still has its own
    # healthy configuration in memory and the disk stays consistent with it.
    NG_AVAIL="/etc/nginx/sites-available/nobino.conf"
    NG_ENABLED="/etc/nginx/sites-enabled/nobino.conf"
    NG_BAK=""
    if [[ -f "$NG_AVAIL" ]]; then
      NG_BAK="$(mktemp /tmp/nobino-vhost-prev.XXXXXX.conf)"
      cp "$NG_AVAIL" "$NG_BAK"
    fi
    HAD_ENABLED=false
    if [[ -e "$NG_ENABLED" || -L "$NG_ENABLED" ]]; then
      HAD_ENABLED=true
      say "  The previous version of $NG_AVAIL was backed up; it will be restored on failure"
    fi
    cp "$TMP_CONF" "$NG_AVAIL"
    ln -sf "$NG_AVAIL" "$NG_ENABLED"
    if nginx -t 2>/tmp/nobino-nginx-test.log; then
      systemctl reload nginx
      ok "Nobino vhost enabled (other nginx installations are not touched)"
      if [[ -n "$NG_BAK" ]]; then rm -f "$NG_BAK"; fi
    else
      cat /tmp/nobino-nginx-test.log >&2 || true
      if [[ -n "$NG_BAK" ]]; then
        mv -f "$NG_BAK" "$NG_AVAIL"
      else
        rm -f "$NG_AVAIL"
      fi
      if ! $HAD_ENABLED; then
        # Nobino was not in sites-enabled before this run → the newly created symlink is removed
        rm -f "$NG_ENABLED"
      fi
      die "The vhost was invalid; the previous configuration was restored on disk and no reload happened. Check $TMP_CONF and run again — if the error belongs to another site's block, fix that one first."
    fi
  fi
else
  warn "nginx skipped (--skip-nginx)"
fi

# ── 7) Health check ───────────────────────────────────────────────
say "— Health check —"
HEALTH_URL="http://127.0.0.1:$PORT/api/health?db=1"
if $DRY_RUN; then
  printf '%s[dry] curl %s%s\n' "$C_DIM" "$HEALTH_URL" "$C_OFF"
else
  # HI-3: health is a gate, not a warning. (1) Retry for up to 90 seconds — the first boot with
  # prisma generate and db push takes much longer than 3 seconds; (2) the pid of the port
  # holder is matched against the pid of the target service so that a response from another
  # process on the same port does not make this install look "successful"; (3) failure → exit 1.
  EXPECT_PID=""
  if command -v pm2 >/dev/null 2>&1; then
    EXPECT_PID="$(pm2 pid nobino-api 2>/dev/null | tr -dc '0-9')"
  fi
  HEALTH=""
  waited=0
  while [[ -z "$HEALTH" && $waited -lt 90 ]]; do
    HEALTH="$(curl -fsS --max-time 10 "$HEALTH_URL" 2>/dev/null || true)"
    if [[ -z "$HEALTH" ]]; then sleep 3; waited=$((waited + 3)); fi
  done
  if [[ -z "$HEALTH" ]]; then
    say "   Service log: pm2 logs nobino-api --lines 60"
    say "   If the database is not up: fetch '$HEALTH_URL' manually and check DATABASE_URL."
    die "The service did not answer at $HEALTH_URL within 90 seconds; the installation is incomplete."
  fi
  OWNER=""
  if [[ -n "$EXPECT_PID" ]] && command -v ss >/dev/null 2>&1; then
    OWNER="$(ss -ltnp "sport = :$PORT" 2>/dev/null | grep -oE 'pid=[0-9]+' | head -1 | sed 's/pid=//')"
    if [[ -n "$OWNER" && "$OWNER" != "$EXPECT_PID" ]]; then
      die "Port $PORT was answered by process $OWNER, not nobino-api (pid $EXPECT_PID). Stop that process and run again; the new version is not being served."
    fi
  fi
  say "$HEALTH"
  if [[ -n "$OWNER" ]]; then ok "Server is healthy (pid $OWNER on port $PORT)"; else ok "Server responds on port $PORT"; fi
fi

say ""
say "${C_OK}Installation finished.${C_OFF} Remaining steps:"
say "  1) DNS: an A record for ${DOMAIN} and a CNAME/WILDCARD record for *.${DOMAIN} pointing to this server's IP"
if [[ ${#DOMAIN_ALIASES[@]} -gt 0 ]]; then
  say "     and A records for the alias domains: ${DOMAIN_ALIASES[*]}"
fi
say "     (we do not issue DNS records ourselves.)"
say "  2) HTTPS certificate (Let's Encrypt, wildcard for the subdomains; the DNS challenge is required):"
say "       sudo bash deploy/ssl.sh ${SSL_DOMAIN_ARGS} --email <email>"
say "     For the root domain non-interactively: --mode http (subdomains are not covered)"
say "  3) Set these in .env: SITE_URL=${SPA_PROTO}://${DOMAIN}  APP_URL=${SPA_PROTO}://${DOMAIN}  ROOT_DOMAIN=${DOMAIN}"
if [[ ${#DOMAIN_ALIASES[@]} -gt 0 ]]; then
  say "     and EXTRA_DOMAINS=\"$(IFS=,; printf '%s' "${DOMAIN_ALIASES[*]}")\" for the alias domains"
fi
say "  4) Next update:  sudo bash deploy/update.sh"
say "  5) If the database is new and empty, create the first super admin:"
say "       cd ${APP_DIR} && ADMIN_PHONE=09xxxxxxxxx ADMIN_PASSWORD='…' node scripts/create-admin.mjs   (password at least 8 characters)"
say "  Log: pm2 logs nobino-api — Status: pm2 status — Test: curl ${HEALTH_URL}"
