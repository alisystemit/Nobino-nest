#!/usr/bin/env bash
# =====================================================================
# Nobino (NestJS edition) — one-command bootstrap for a completely fresh VPS
#
#   sudo bash deploy/bootstrap.sh --domain nobino.ir
#
# From an Ubuntu/Debian install with "nothing" on it, it does everything automatically:
#   1) OS prerequisites (curl/ca-certificates/gnupg/git/rsync)
#   2) Create swap if RAM is under 2 GB (so the vite/Prisma build is not killed)
#   3) Node.js 24 from NodeSource + PM2
#   4) Server PostgreSQL + `nobino` user/database with a random password
#      — if the server Postgres already has data, it is left alone unless --with-postgres
#   5) Automatic .env from deploy/env.production.example with
#      DATABASE_URL/JWT_SECRET/CRON_SECRET/domains filled in (no CHANGE_ME)
#      — if .env already exists, it is left untouched
#   6) ufw: only SSH + 80 + 443 + 8443 are opened (enables ufw if it is not active;
#      with --no-firewall it is not touched at all)
#   7) At the end it runs deploy/install.sh in full (build + PM2 + nginx + health)
#   7.5) With --tls, deploy/ssl.sh obtains a Let's Encrypt certificate and
#      enables the HTTPS block in nginx (wildcard with DNS challenge by default)
#   8) Create the first superadmin with any mobile/password/email (if the database is
#      empty; with --admin-phone/--admin-password/--admin-email without prompts, otherwise it asks automatically at the end)
#
# Options:
#   --domain <domain>     required (e.g. nobino.ir) — the main domain; for multiple domains (alias)
#                         pass it multiple times or separate with commas (e.g. --domain nobino.ir --domain nobino.com)
#   --repo <git-url>      git URL of the repository; cloned if the current directory is not this repo
#   --app-dir <path>      install path (default /opt/nobino; cloned/copied there if the current repo is not already there)
#   --port <port>         internal port (default 3100)
#   --pg-password <pass>  database user password (default: random; shown in .env and the final message)
#   --database-url <url>  ready-made database URL; for when Postgres is already on this server and
#                        you do not want a prompt (CI and curl|bash should use this option)
#   --admin-phone <phone>   initial superadmin number (same format as admin login, 11 digits starting with 0)
#   --admin-password <pass>   initial superadmin password (at least 8 characters)
#   --admin-email <email>    superadmin profile email (optional; or the ADMIN_EMAIL variable)
#                        — if possible, pass the environment variables
#                          ADMIN_PHONE/ADMIN_PASSWORD/ADMIN_EMAIL instead of these flags so the
#                          password does not stay in `ps` and shell history
#   --no-admin            do not create the superadmin (later manually: scripts/create-admin.mjs)
#   --no-firewall         do not touch ufw
#   --with-postgres       even if Postgres exists, create the nobino user/database (without reinstalling)
#   --tls                 obtain SSL after install and enable HTTPS (requires --email)
#   --email <email>       ACME account email for Let's Encrypt
#   --ssl-mode <mode>     dns (default, interactive wildcard) | http | cloudflare (optional)
#   --dns-credentials <path>  Cloudflare credentials file (only ssl-mode=cloudflare)
#   --dry-run             commands that change things are only printed
#
# Security: no data is sent anywhere. Passwords stay only on this server
# (.env file with mode 600). PHP/MySQL/apps and existing other
# credentials are not touched.
# =====================================================================
set -euo pipefail

C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✅ %s%s\n' "$C_OK" "$*" "$C_OFF"; }
warn() { printf '%s⚠️  %s%s\n' "$C_WARN" "$*" "$C_OFF"; }
die()  { printf '%s❌ %s%s\n' "$C_ERR" "$*" "$C_OFF" >&2; exit 1; }
run()  { if $DRY_RUN; then printf '%s[dry] %s%s\n' "$C_DIM" "$*" "$C_OFF"; else "$@"; fi; }
# runsh: run the command through a subshell (for pipes/redirects/append)
runsh() { if $DRY_RUN; then printf '%s[dry] %s%s\n' "$C_DIM" "$*" "$C_OFF"; else bash -c "$*"; fi; }
# A value-taking option with no value must not die with "$2: unbound variable" (ME-5).
need_value() { [[ $# -ge 2 ]] || die "$1 needs a value (e.g. $1 <value>)"; }

# Normalizes the domain (protocol/path/port/spaces/trailing dot) and strips the
# "*." prefix; the wildcard for the main domain is added automatically. --domain can be
# given multiple times or take several domains separated by commas/spaces.
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
read_env() {
  [[ -f "$APP_DIR/.env" ]] || return 0
  awk -v k="$1" 'BEGIN{FS="="} $1==k { v=substr($0, index($0,"=")+1); gsub(/\r$/,"",v); gsub(/^"/,"",v); gsub(/"$/,"",v); print v }' "$APP_DIR/.env" | tail -1
}

DOMAINS=()
DOMAIN="" REPO_URL="" APP_DIR="/opt/nobino" PORT="3100" PG_PASSWORD=""
# The superadmin password/number/email is also accepted from the environment so it does not
# stay on argv (in `ps`) and in shell history (HG-2).
ADMIN_PHONE="${ADMIN_PHONE:-}" ADMIN_PASSWORD="${ADMIN_PASSWORD:-}" ADMIN_EMAIL="${ADMIN_EMAIL:-}"
DBURL_CLI="" NO_ADMIN=false
ADMIN_SET=false ADMIN_HINT=false
NO_FIREWALL=false FORCE_PG=false DRY_RUN=false
ENABLE_TLS=false SSL_EMAIL="" SSL_MODE="dns" DNS_CREDENTIALS=""
TLS_READY=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) need_value "$@"; add_domains "$2"; shift 2 ;;
    --domain=*) add_domains "${1#*=}"; shift ;;
    --repo) need_value "$@"; REPO_URL="$2"; shift 2 ;;
    --app-dir) need_value "$@"; APP_DIR="$2"; shift 2 ;;
    --port) need_value "$@"; PORT="$2"; shift 2 ;;
    --pg-password) need_value "$@"; PG_PASSWORD="$2"; shift 2 ;;
    --database-url) need_value "$@"; DBURL_CLI="$2"; shift 2 ;;
    --admin-phone) need_value "$@"; ADMIN_PHONE="$2"; shift 2 ;;
    --admin-password) need_value "$@"; ADMIN_PASSWORD="$2"; shift 2 ;;
    --admin-email) need_value "$@"; ADMIN_EMAIL="$2"; shift 2 ;;
    --admin-email=*) ADMIN_EMAIL="${1#*=}"; shift ;;
    --no-admin) NO_ADMIN=true; shift ;;
    --no-firewall) NO_FIREWALL=true; shift ;;
    --with-postgres) FORCE_PG=true; shift ;;
    --tls) ENABLE_TLS=true; shift ;;
    --email) need_value "$@"; SSL_EMAIL="$2"; shift 2 ;;
    --ssl-mode) need_value "$@"; SSL_MODE="$2"; shift 2 ;;
    --dns-credentials) need_value "$@"; DNS_CREDENTIALS="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) awk 'NR>1 && /^#/ {sub(/^# ?/, ""); print; next} NR>1 {exit}' "$0"; exit 0 ;;
    *) die "Unknown option: $1 (see --help)" ;;
  esac
done

# ── Domains: --domain multiple times/with commas; the first domain is the main one ──────────
if [[ ${#DOMAINS[@]} -eq 0 ]]; then
  add_domains "$(read_env ROOT_DOMAIN)"
fi
if [[ ${#DOMAINS[@]} -eq 0 ]]; then
  die "A domain is required:  sudo bash deploy/bootstrap.sh --domain nobino.ir"
fi
if [[ -n "$(read_env ROOT_DOMAIN)" && "${DOMAINS[0]}" == "$(norm_domain "$(read_env ROOT_DOMAIN)")" ]]; then
  # keep alias domains stored in .env so the vhost can be rebuilt
  add_domains "$(read_env EXTRA_DOMAINS)"
fi
for d in "${DOMAINS[@]}"; do
  [[ "$d" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || die "Invalid domain: '$d' — only letters/digits/dot/hyphen (e.g. nobino.ir)."
done
DOMAIN="${DOMAINS[0]}"
DOMAIN_ALIASES=()
[[ ${#DOMAINS[@]} -gt 1 ]] && DOMAIN_ALIASES=("${DOMAINS[@]:1}")
EXTRA_DOMAINS="$(IFS=,; printf '%s' "${DOMAIN_ALIASES[*]:-}")"
if [[ -n "$ADMIN_EMAIL" && ! "$ADMIN_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then
  die "Invalid superadmin email: '$ADMIN_EMAIL' (e.g. admin@example.com)."
fi
[[ "$PORT" =~ ^[0-9]+$ ]] && (( PORT >= 1024 && PORT <= 65535 )) || die "--port must be a number between 1024 and 65535 (you gave: $PORT)."
case "$SSL_MODE" in dns|cloudflare|http) ;; *) die "--ssl-mode must be dns or cloudflare or http (you gave: $SSL_MODE)." ;; esac
if $ENABLE_TLS && [[ "$SSL_MODE" == "cloudflare" && -z "$DNS_CREDENTIALS" ]]; then
  die "For --tls --ssl-mode cloudflare you must also pass --dns-credentials <file path>."
fi
[[ "$(id -u)" == "0" ]] || die "Run with sudo."
command -v apt-get >/dev/null 2>&1 || die "This script is for Ubuntu/Debian (apt)."
command -v systemctl >/dev/null 2>&1 || die "systemctl is required (not possible on old LXC/WSL)."

# HI-8: no trailing `|| true` — if neither of the two paths produced a value, the function
# returns failure and the caller stops with die (an empty secret in .env is not allowed).
rand_secret() {
  local s
  s="$(openssl rand -hex 32 2>/dev/null || true)"
  [[ -n "$s" ]] || s="$(head -c 48 /dev/urandom 2>/dev/null | od -An -tx1 | tr -d ' \n' || true)"
  [[ ${#s} -ge 64 ]] || return 1
  printf '%s' "$s"
}
rand_pg() {
  local s
  s="$(head -c 96 /dev/urandom 2>/dev/null | tr -dc 'A-Za-z0-9' | head -c 24 || true)"
  [[ ${#s} -ge 24 ]] || return 1
  printf '%s' "$s"
}
# Minimal images may not have sudo — runuser (util-linux) is the substitute
if command -v sudo >/dev/null 2>&1; then PGRUN="sudo -u postgres"; else PGRUN="runuser -u postgres --"; fi
[[ -z "$PG_PASSWORD" || "$PG_PASSWORD" =~ ^[A-Za-z0-9]+$ ]] || die "--pg-password can only contain Latin letters/digits (no special characters)."

# ── 1) project code in the install path ──────────────────────────────────────────
say "— 1) Preparing the code in $APP_DIR —"
if [[ -f "$APP_DIR/package.json" && -f "$APP_DIR/deploy/install.sh" ]]; then
  ok "  The repo is already in $APP_DIR (using it as-is)"
elif [[ -n "$REPO_URL" ]]; then
  if [[ ! -d "$APP_DIR" ]]; then
    run git clone "$REPO_URL" "$APP_DIR"
  else
    warn "  $APP_DIR exists but is not the repo; not cloning. Change the path with --app-dir."
    die "  package.json/deploy/install.sh not found in $APP_DIR."
  fi
elif [[ -f "$REPO_DIR/deploy/install.sh" && "$REPO_DIR" != "$APP_DIR" ]]; then
  say "  --repo not given; copying the current repo (this script lives inside it) to $APP_DIR"
  run mkdir -p "$APP_DIR"
  run rsync -a --exclude node_modules --exclude .pgdata --exclude .git --exclude backend/dist \
      --exclude frontend/dist --exclude public/uploads --exclude public/voice "$REPO_DIR/" "$APP_DIR/"
else
  die "  There is no code in $APP_DIR and --repo was not given. Move the repo to this path (git clone or scp/tar) and run again."
fi
[[ -f "$APP_DIR/deploy/install.sh" ]] || { $DRY_RUN && warn "  (dry-run) deploy/install.sh is not in $APP_DIR because the copy/clone did not run" || die "deploy/install.sh not found in $APP_DIR."; }

# ── 2) OS prerequisites ───────────────────────────────────────────────
say "— 2) System prerequisites (apt) —"
NEEDS=()
for pkg in curl ca-certificates gnupg git rsync openssl locales; do
  dpkg -s "$pkg" >/dev/null 2>&1 || NEEDS+=("$pkg")
done
if [[ ${#NEEDS[@]} -gt 0 ]]; then
  say "  Installing: ${NEEDS[*]}"
  run apt-get update -qq
  run env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${NEEDS[@]}"
else
  ok "  All prerequisites are present"
fi

# ── 3) swap if RAM is low ────────────────────────────────────────
MEM_MB="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || true)"; MEM_MB="${MEM_MB:-4096}"
if [[ "$MEM_MB" -lt 2048 ]] && ! swapon --show 2>/dev/null | grep -q '^/'; then
  say "— 3) RAM ${MEM_MB}MB → creating a 2 GB swapfile (for build stability) —"
  if [[ ! -f /swapfile ]]; then
    run fallocate -l 2G /swapfile || run dd if=/dev/zero of=/swapfile bs=1M count=2048
    run chmod 600 /swapfile
    run mkswap /swapfile
    run swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || runsh "echo '/swapfile none swap sw 0 0' >> /etc/fstab"
    ok "  swap enabled"
  else
    run swapon /swapfile || true
  fi
else
  say "— 3) swap: not needed (RAM ${MEM_MB}MB or swap already active) —"
fi

# ── 4) Node.js + PM2 ────────────────────────────────────────────────
say "— 4) Node.js and PM2 —"
node_major() { command -v node >/dev/null 2>&1 && node -v | sed 's/^v\([0-9]*\).*/\1/' || echo 0; }
if [[ "$(node_major)" -lt 20 ]]; then
  say "  Node $(node -v 2>/dev/null || echo 'none') → installing NodeSource 24"
  run curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup
  run bash /tmp/nodesource_setup
  run env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
fi
ok "  Node $(node -v)"
if ! command -v npm >/dev/null 2>&1; then die "  npm not found after installing Node."; fi
if ! command -v pm2 >/dev/null 2>&1; then
  say "  Installing PM2"
  run npm install -g pm2@latest --no-audit --no-fund
fi
command -v openssl >/dev/null 2>&1 || die "openssl is required (to generate secrets)."

# ── 5) PostgreSQL ───────────────────────────────────────────────────
say "— 5) PostgreSQL —"
PG_EXISTS=false
if pg_isready -q 2>/dev/null || systemctl is-active --quiet postgresql 2>/dev/null; then
  PG_EXISTS=true
fi
if $PG_EXISTS && ! $FORCE_PG; then
  ok "  Postgres is already running; nothing is installed/changed."
  warn "  .env must have its own DATABASE_URL; bootstrap does not create it (unless --with-postgres)."
  PG_MODE="external"
else
  if ! $PG_EXISTS; then
    say "  Installing the postgresql server"
    run apt-get install -y -qq postgresql postgresql-contrib
  fi
  run systemctl enable --now postgresql
  PG_MODE="local"
  [[ -n "$PG_PASSWORD" ]] || PG_PASSWORD="$(rand_pg)" || die "  Could not generate a random database password (/dev/urandom unavailable); pass --pg-password <password>."
  # Dedicated user/database (idempotent — if it exists, the password is not set again)
  runsh "$PGRUN psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='nobino'\" | grep -q 1 || $PGRUN psql -qc \"CREATE ROLE nobino LOGIN PASSWORD '$PG_PASSWORD'\""
  runsh "$PGRUN psql -tAc \"SELECT 1 FROM pg_database WHERE datname='nobino'\" | grep -q 1 || $PGRUN psql -qc \"CREATE DATABASE nobino OWNER nobino\""
  # listens locally for the TCP connection from the app (no other setting changed)
  # we find the real conf path (Ubuntu: /etc/postgresql/<ver>/main; Debian: /etc/postgresql/<ver>/main; RHEL-family: /var/lib/pgsql)
  PGCONF=""
  for c in /etc/postgresql/*/main/postgresql.conf /usr/etc/postgresql/main/postgresql.conf /etc/postgresql/1*/main/postgresql.conf /var/lib/pgsql/data/postgresql.conf /etc/postgresql/9*/main/postgresql.conf; do
    [[ -f "$c" ]] && { PGCONF="$c"; break; }
  done
  # if no conf was found, we ask Postgres itself (run as the postgres user)
  if [[ -z "$PGCONF" ]]; then
    PGCONF="$($PGRUN psql -tAc 'show config_file' 2>/dev/null | tr -d '\r' | head -1 || true)"
  fi
  if [[ -n "$PGCONF" && -f "$PGCONF" ]] && ! grep -q "^listen_addresses" "$PGCONF" 2>/dev/null; then
    if $DRY_RUN; then
      printf '%s[dry] append listen_addresses=localhost → %s + reload%s\n' "$C_DIM" "$PGCONF" "$C_OFF"
    else
      printf "listen_addresses = 'localhost'\n" >> "$PGCONF" && run systemctl reload postgresql
    fi
  fi
  if $DRY_RUN; then
    printf '%s[dry] psycopg2 check skipped%s\n' "$C_DIM" "$C_OFF"
  else
    PGPASSWORD="$PG_PASSWORD" psql "host=127.0.0.1 user=nobino dbname=nobino" -tAc "select 'db-ok'" | grep -q db-ok || die "Could not connect nobino to the database; check pg_hba."
  fi
  ok "  Database 'nobino' with user 'nobino' is ready"
fi

# ── 6) automatic .env generation ─────────────────────────────────────────────
say "— 6) The .env file —"
ENVF="$APP_DIR/.env"
if [[ -f "$ENVF" ]]; then
  ok "  .env already exists; leaving it alone."
else
  [[ -f "$APP_DIR/deploy/env.production.example" ]] || die "  The env.production.example template is missing."
  # HI-8: if generating a random secret fails, we must stop — otherwise .env is
  # written with JWT_SECRET="", the CHANGE_ME gate passes and the service ends up in a crash loop on boot.
  JWT="$(rand_secret)" || die "  Could not generate a random JWT (both openssl and /dev/urandom failed); create .env manually."
  CS="$(rand_secret)"  || die "  Could not generate a random CRON_SECRET; create .env manually."
  if [[ "$PG_MODE" == "local" ]]; then
    DBURL="postgresql://nobino:${PG_PASSWORD}@localhost:5432/nobino?schema=public"
  elif [[ -n "$DBURL_CLI" ]]; then
    DBURL="$DBURL_CLI"
  elif $DRY_RUN; then
    # HI-6: dry-run must never wait for input (CI and `curl | bash` have a
    # non-interactive stdin); a placeholder URL is enough because nothing is written.
    DBURL="postgresql://USER:PASS@localhost:5432/nobino"
    warn "  dry-run: pass --database-url to see the real address in the plan."
  else
    printf '  Enter the existing DATABASE_URL for this server: '
    read -r DBURL_IN || true
    DBURL="${DBURL_IN:-}"
    [[ -n "$DBURL" ]] || die "  For an existing server Postgres, DATABASE_URL must be given (--database-url, or --with-postgres to create the nobino user/database)."
  fi
  case "$DBURL" in postgresql*://*) ;; *) die "  DATABASE_URL must start with postgresql://: '${DBURL:0:24}…'" ;; esac
  [[ "$DBURL" != *'"'* ]] || die "  DATABASE_URL cannot contain a quote character; the value is written into .env inside quotes."
  if [[ "$PG_MODE" != "local" ]]; then
    say "  (Server Postgres: POSTGRES_PASSWORD stays empty in .env — only docker-compose needs it.)"
  fi

  # HI-7: replacement is line by line and key based — not sed (where `&`, `|` and `\`
  # are special inside the value) and not `${line//token/value}` (which in bash ≥5.2 does
  # the same thing with `&`). Each key writes its own value completely, so no character
  # from a domain/URL can corrupt the line. Writing is also atomic: the whole file is built
  # in .env.new and then mv'd; if anything breaks, no half-written (or zero-byte) .env is
  # left behind for the next run to say ".env exists, leaving it alone".
  gen_env() {
    local src="$1" dst="$2" line key
    while IFS= read -r line || [[ -n "$line" ]]; do
      line="${line%$'\r'}"
      key="${line%%=*}"
      case "$key" in
        DATABASE_URL)      line="DATABASE_URL=\"$DBURL\"" ;;
        JWT_SECRET)        line="JWT_SECRET=\"$JWT\"" ;;
        CRON_SECRET)       line="CRON_SECRET=\"$CS\"" ;;
        POSTGRES_PASSWORD) line="POSTGRES_PASSWORD=\"${PG_PASSWORD:-}\"" ;;
        APP_URL | SITE_URL | AUTOMATION_BASE_URL | VITE_SITE_URL | VITE_APP_URL)
          line="$key=\"https://$DOMAIN\"" ;;
        ROOT_DOMAIN | VITE_ROOT_DOMAIN) line="$key=\"$DOMAIN\"" ;;
        EXTRA_DOMAINS)     line="EXTRA_DOMAINS=\"$EXTRA_DOMAINS\"" ;;
        PAYMENT_CALLBACK_BASE) line="PAYMENT_CALLBACK_BASE=\"https://$DOMAIN/api/payments/callback\"" ;;
        PORT)   line="PORT=$PORT" ;;
        SMS_PROVIDER | VOICE_PROVIDER) line="$key=\"mock\"" ;;
      esac
      printf '%s\n' "$line"
    done <"$src" >"$dst"
  }

  if $DRY_RUN; then
    printf '%s[dry] generate .env from the example template (domain=%s, port=%s, random secrets, DATABASE_URL from %s)%s\n' \
      "$C_DIM" "$DOMAIN" "$PORT" "$([[ "$PG_MODE" == "local" ]] && echo "local postgres" || echo "--database-url/prompt")" "$C_OFF"
  else
    ENV_TMP="$(mktemp "$APP_DIR/.env.new.XXXXXX")"
    if gen_env "$APP_DIR/deploy/env.production.example" "$ENV_TMP"; then
      chmod 600 "$ENV_TMP"
      mv -f "$ENV_TMP" "$ENVF"
      grep -q "CHANGE_ME" "$ENVF" && die "  CHANGE_ME is still present in .env — the env.example template changed; fill it in manually."
      ok "  .env created (random secrets, domain $DOMAIN, port $PORT) — mode 600"
    else
      rm -f "$ENV_TMP"
      die "  .env generation was incomplete; $ENVF was not written (so the next run has no reason to count it as existing)."
    fi
  fi
fi
# SMS/payment/STT are intentionally left empty; they are filled in later from the superadmin panel.

# ── 7) Firewall ──────────────────────────────────────────────────────
say "— 7) Firewall —"
if $NO_FIREWALL || ! command -v ufw >/dev/null 2>&1; then
  say "  Firewall left unchanged (ufw not installed or --no-firewall)"
else
  SSH_PORT="$(sshd -T 2>/dev/null | awk '$1=="port"{print $2; exit}' || true)"; SSH_PORT="${SSH_PORT:-22}"
  run ufw allow "$SSH_PORT"/tcp comment 'nobino-bootstrap-ssh'
  run ufw allow 80/tcp
  run ufw allow 443/tcp
  run ufw allow 8443/tcp
  if ! $DRY_RUN && ! ufw status | grep -qi "Status: active"; then
    say "  Enabling ufw (default policy deny incoming)"
    runsh "yes | ufw --force enable"
  fi
  ok "  Ports $SSH_PORT/80/443/8443 open, the rest behind ufw"
fi

# ── 8) full install.sh ──────────────────────────────────────────────
say "— 8) Running deploy/install.sh (build + PM2 + nginx + health) —"
INSTALL_ARGS=(--port "$PORT" --app-dir "$APP_DIR")
for d in "${DOMAINS[@]}"; do INSTALL_ARGS+=(--domain "$d"); done
$DRY_RUN && INSTALL_ARGS+=(--dry-run)
run bash "$APP_DIR/deploy/install.sh" "${INSTALL_ARGS[@]}"

# ── 8.5) SSL / HTTPS ────────────────────────────────────────────────
if $ENABLE_TLS; then
  if [[ "$SSL_MODE" == "dns" ]] && ! $DRY_RUN && [[ ! -t 0 ]]; then
    warn "  DNS mode is interactive and does not work in a pipe run (curl | bash); SSL step skipped."
    warn "  After install, run in a terminal: sudo bash $APP_DIR/deploy/ssl.sh --domain $DOMAIN --email <email>"
    warn "  or, for the root domain only and non-interactively: --ssl-mode http"
  else
    say "— 8.5) Obtaining the SSL certificate and enabling HTTPS (Let's Encrypt) —"
    if [[ -z "$SSL_EMAIL" ]]; then
      warn "  --email not given; continuing, but certificate expiry warnings will not reach you."
    fi
    SSL_ARGS=(--app-dir "$APP_DIR" --mode "$SSL_MODE")
    for d in "${DOMAINS[@]}"; do SSL_ARGS+=(--domain "$d"); done
    [[ -n "$SSL_EMAIL" ]] && SSL_ARGS+=(--email "$SSL_EMAIL")
    [[ -n "$DNS_CREDENTIALS" ]] && SSL_ARGS+=(--dns-credentials "$DNS_CREDENTIALS")
    $DRY_RUN && SSL_ARGS+=(--dry-run)
    if bash "$APP_DIR/deploy/ssl.sh" "${SSL_ARGS[@]}"; then
      TLS_READY=true
    else
      warn "  SSL acquisition failed; the site is running over HTTP."
      warn "  Later, in a terminal: sudo bash $APP_DIR/deploy/ssl.sh --domain $DOMAIN --email <email>"
    fi
  fi
fi

# ── 9) the first superadmin ──────────────────────────────────────────────
# It runs after install.sh because that step creates node_modules + Prisma client + the
# database schema. If there is already another ADMIN, it is idempotent.
say "— 9) Creating the first superadmin —"
if $NO_ADMIN; then
  say "  --no-admin → skipping this step."
elif $DRY_RUN; then
  printf '%s[dry] node scripts/create-admin.mjs with ADMIN_PHONE/ADMIN_PASSWORD/ADMIN_EMAIL from the environment%s\n' "$C_DIM" "$C_OFF"
else
  AP="$ADMIN_PHONE"; AW="$ADMIN_PASSWORD"; AE="$ADMIN_EMAIL"
  if [[ -z "$AP" ]] && [[ -t 0 ]]; then
    printf '  Superadmin mobile number (11 digits starting with 0; empty = do it manually later): '
    read -r AP || true
  fi
  if [[ -n "$AP" ]] && [[ -z "$AW" ]] && [[ -t 0 ]]; then
    printf '  Superadmin password (at least 8 characters, input hidden): '
    read -rs AW || true; printf '\n'
  fi
  if [[ -n "$AP" ]] && [[ -z "$AE" ]] && [[ -t 0 ]]; then
    printf '  Superadmin email (optional; empty = no email): '
    read -r AE || true
  fi
  AP="$(tr -d ' \r' <<< "$AP")"
  AE="$(tr -d ' \r' <<< "$AE")"
  if [[ -n "$AE" && ! "$AE" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then
    ADMIN_HINT=true
    warn "  Email '$AE' is invalid — superadmin step skipped. Fix it later with --admin-email."
    AP=""
  fi
  if [[ -z "$AP" ]]; then
    ADMIN_HINT=true
    warn "  Superadmin was not created; run this whenever you want:"
    say "    cd $APP_DIR && ADMIN_PHONE=09xxxxxxxxx ADMIN_PASSWORD='…' ADMIN_EMAIL='…' node scripts/create-admin.mjs"
  elif [[ ${#AW} -lt 8 ]]; then
    ADMIN_HINT=true
    warn "  Password missing/too short — superadmin step skipped. Later: node scripts/create-admin.mjs (inside $APP_DIR)"
  else
    # On non-interactive SSH servers (exec without a TTY) read does not work; a flag is required.
    # HG-2: credentials go through the environment, not argv — they do not stay in `ps` and shell history.
    if (cd "$APP_DIR" && APP_DIR="$APP_DIR" ADMIN_PHONE="$AP" ADMIN_PASSWORD="$AW" ADMIN_EMAIL="$AE" node scripts/create-admin.mjs); then
      ok "  Admin login: https://$DOMAIN with $AP"
      ADMIN_SET=true
    else
      ADMIN_HINT=true
      warn "  create-admin failed (check the database/Prisma); run it manually later."
    fi
  fi
  unset AW AE
fi

say ""
ok "${C_OK}bootstrap finished.${C_OFF}"
if $TLS_READY; then SCHEME="https"; else SCHEME="http"; fi
say "  Domain:   $SCHEME://$DOMAIN  (salon subdomains: <slug>.$DOMAIN)"
if [[ ${#DOMAIN_ALIASES[@]} -gt 0 ]]; then
  say "  alias:    ${DOMAIN_ALIASES[*]} (same site, without the salon subdomain)"
fi
say "  Status:   pm2 status — logs: pm2 logs nobino-api"
say "  Health:   curl \"http://127.0.0.1:$PORT/api/health?db=1\""
say "  .env:    $APP_DIR/.env (secrets are here; if PG was just created, the database password is in DATABASE_URL)"
if $ADMIN_SET; then
  say "  Admin login: $SCHEME://$DOMAIN with $AP (the password you supplied)"
elif $ADMIN_HINT; then
  say "  Admin login: no superadmin yet — cd $APP_DIR && ADMIN_PHONE=09xxxxxxxxx ADMIN_PASSWORD='…' node scripts/create-admin.mjs"
fi
say ""
say "  Remaining manual steps (optional):"
say "    1) DNS: A record for $DOMAIN and *.${DOMAIN} to this server's IP"
if [[ ${#DOMAIN_ALIASES[@]} -gt 0 ]]; then
  say "       and A records for the alias domains: ${DOMAIN_ALIASES[*]}"
fi
if $TLS_READY; then
  say "    2) HTTPS is enabled (Let's Encrypt). Check renewal: sudo certbot renew --dry-run"
  say "        (Automatic wildcard renewal is optional and requires the DNS plugin.)"
else
  SSL_HINT="sudo bash $APP_DIR/deploy/ssl.sh"
  for d in "${DOMAINS[@]}"; do SSL_HINT+=" --domain $d"; done
  say "    2) HTTPS: $SSL_HINT --email <email>"
  say "        default: wildcard via the Let's Encrypt DNS challenge | http: root domain only"
fi
say "    3) Superadmin panel: check /api/health, then complete the payment gateway/SMS/keys under 'System settings'"
say "        (SMS, payment and smart voice are intentionally empty so the install comes up even without keys.)"
say "    4) Next update: sudo bash deploy/update.sh"
