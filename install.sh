#!/usr/bin/env bash
# =====================================================================
# Nobino — one-line installer (Ubuntu/Debian)
#
#   curl -fsSL https://raw.githubusercontent.com/alisystemit/Nobino-nest/master/install.sh \
#     | sudo bash -s -- --domain example.com
#
# This script fetches the repository into /opt/nobino and then runs
# deploy/bootstrap.sh: the full install (Node, PM2, PostgreSQL, .env,
# build, nginx, service, and super admin).
#
# Options:
#   --domain <domain>    required — primary domain (e.g. nobino.ir); for extra
#                        domains (aliases) repeat the flag or separate with commas
#   --app-dir <path>     install path (default /opt/nobino)
#   --branch <branch>    git branch (default master)
#   -h, --help           show this help
#
# All other options are passed straight to deploy/bootstrap.sh:
#   --port --pg-password --database-url --admin-phone --admin-password --admin-email
#   --no-admin --no-firewall --with-postgres --dry-run
#   --tls --email --ssl-mode --dns-credentials
#
# SSL: certificates always come from Let's Encrypt.
#   --ssl-mode dns        wildcard via manual DNS challenge (interactive; not usable in a pipe)
#   --ssl-mode http       root domains only via HTTP-01 (non-interactive)
#   --ssl-mode cloudflare optional — automatic wildcard renewal via the Cloudflare DNS plugin
#
# Environment variables:
#   ADMIN_PHONE / ADMIN_PASSWORD / ADMIN_EMAIL   create the initial super admin
#                                  (only when this script runs as root; sudo
#                                  usually clears them via env_reset — use the
#                                  flags instead)
#   NOBINO_REPO / NOBINO_BRANCH / NOBINO_APP_DIR
#
# Example with a predefined super admin and two domains:
#   curl -fsSL .../install.sh | sudo bash -s -- --domain example.com \
#     --domain example.org --admin-phone 09121110000 --admin-password 'YourStrong#Pass' \
#     --admin-email admin@example.com
# (flags are visible in `ps`; safer: install without them, then run
#  sudo env ADMIN_PHONE=... ADMIN_PASSWORD=... ADMIN_EMAIL=... node scripts/create-admin.mjs)
#
# Recommended SSL step after install, in a terminal (wildcard cert from Let's Encrypt):
#   sudo bash /opt/nobino/deploy/ssl.sh --domain example.com --email you@example.com
# =====================================================================
set -euo pipefail

C_OK=$'\033[32m'; C_ERR=$'\033[31m'; C_OFF=$'\033[0m'
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✅ %s%s\n' "$C_OK" "$*" "$C_OFF"; }
die()  { printf '%s❌ %s%s\n' "$C_ERR" "$*" "$C_OFF" >&2; exit 1; }
need_value() { [[ $# -ge 2 ]] || die "$1 requires a value (for example $1 <value>)"; }

usage() {
  cat <<'EOF'
Nobino — one-line installer (Ubuntu/Debian)

  curl -fsSL https://raw.githubusercontent.com/alisystemit/Nobino-nest/master/install.sh \
    | sudo bash -s -- --domain example.com

This script fetches the repository into /opt/nobino and then runs
deploy/bootstrap.sh: the full install (Node, PM2, PostgreSQL, .env,
build, nginx, service, and super admin).

Options:
  --domain <domain>    required — primary domain (e.g. nobino.ir); for extra
                       domains (aliases) repeat the flag or separate with commas
  --app-dir <path>     install path (default /opt/nobino)
  --branch <branch>    git branch (default master)
  -h, --help           show this help

All other options are passed straight to deploy/bootstrap.sh:
  --port --pg-password --database-url --admin-phone --admin-password --admin-email
  --no-admin --no-firewall --with-postgres --dry-run
  --tls --email --ssl-mode --dns-credentials

SSL (certificates always come from Let's Encrypt; use --tls --email):
  --ssl-mode dns         wildcard via manual DNS challenge (interactive; not in a pipe)
  --ssl-mode http        root domains only via HTTP-01 (non-interactive)
  --ssl-mode cloudflare  optional — automatic renewal via the Cloudflare DNS plugin

Environment variables:
  ADMIN_PHONE / ADMIN_PASSWORD / ADMIN_EMAIL   create the initial super admin (root only)
  NOBINO_REPO / NOBINO_BRANCH / NOBINO_APP_DIR

Example with a predefined super admin and two domains:
  curl -fsSL .../install.sh | sudo bash -s -- --domain example.com \
    --domain example.org --admin-phone 09121110000 --admin-password 'YourStrong#Pass' \
    --admin-email admin@example.com
(flags are visible in `ps`; safer: install without them, then run
 sudo env ADMIN_PHONE=... ADMIN_PASSWORD=... ADMIN_EMAIL=... node scripts/create-admin.mjs)

Recommended SSL step (after install, in a terminal):
  sudo bash /opt/nobino/deploy/ssl.sh --domain example.com --email you@example.com
EOF
}

REPO_URL="${NOBINO_REPO:-https://github.com/alisystemit/Nobino-nest.git}"
BRANCH="${NOBINO_BRANCH:-master}"
APP_DIR="${NOBINO_APP_DIR:-/opt/nobino}"
ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)     need_value "$@"; BRANCH="$2"; shift 2 ;;
    --branch=*)   BRANCH="${1#*=}"; shift ;;
    --app-dir)    need_value "$@"; APP_DIR="$2"; shift 2 ;;
    --app-dir=*)  APP_DIR="${1#*=}"; shift ;;
    -h|--help)    usage; exit 0 ;;
    *)            ARGS+=("$1"); shift ;;
  esac
done

HAS_DOMAIN=false
for ((i = 0; i < ${#ARGS[@]}; i++)); do
  case "${ARGS[$i]}" in
    --domain|--domain=*) HAS_DOMAIN=true ;;
  esac
done
$HAS_DOMAIN || die "A domain is required:  ... | sudo bash -s -- --domain example.com"

[[ "$(id -u)" == "0" ]] || die "Run with sudo (or as root)."
command -v apt-get >/dev/null 2>&1 || die "This installer is for Ubuntu/Debian (apt)."

# Make a relative path absolute so bootstrap and the PM2 service are not confused later.
case "$APP_DIR" in
  /*) ;;
  *) APP_DIR="$PWD/$APP_DIR" ;;
esac

# git is required to fetch the code and bootstrap installs it later; install it here
# if missing (curl/ca-certificates are also required for HTTPS).
if ! command -v git >/dev/null 2>&1; then
  say "— Installing prerequisites for fetching the code (git/curl/ca-certificates) —"
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates curl git
fi

say "— Fetching Nobino code —"
if [[ -d "$APP_DIR/.git" ]]; then
  ok "Code already exists in $APP_DIR; reusing it."
  say "   To update later:  sudo bash $APP_DIR/deploy/update.sh"
elif [[ -e "$APP_DIR" && -n "$(ls -A "$APP_DIR" 2>/dev/null || true)" ]]; then
  die "$APP_DIR exists but is not a git repository. Use an empty path via --app-dir or place the code there yourself."
else
  say "  $REPO_URL (branch: $BRANCH) → $APP_DIR"
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  ok "Code fetched."
fi

[[ -f "$APP_DIR/deploy/bootstrap.sh" ]] || die "deploy/bootstrap.sh not found in $APP_DIR; the code fetch is incomplete."

say "— Running the full install (deploy/bootstrap.sh) —"
exec bash "$APP_DIR/deploy/bootstrap.sh" --app-dir "$APP_DIR" "${ARGS[@]}"
