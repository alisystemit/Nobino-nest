#!/usr/bin/env bash
# =====================================================================
# Nobino — obtain an SSL certificate and enable HTTPS
#
#   sudo bash deploy/ssl.sh --domain nobino.ir --email you@example.com
#
# Default: a wildcard certificate for "domain + *.domain" with the DNS challenge (Let's Encrypt).
# Because the hall subdomains (mah.nobino.ir) must also be valid, a wildcard certificate
# is required, and the DNS challenge is the only way without access to each subdomain.
#
# Modes (--mode) — the certificate always comes from Let's Encrypt:
#   dns         wildcard certificate with the manual DNS challenge (interactive; no automatic renewal)
#   http        root domain only with the HTTP-01 challenge (subdomains are not covered)
#   cloudflare  optional — automatic wildcard with the Cloudflare DNS plugin (automatic renewal)
#
# Options:
#   --domain <domain>         root domain (default: ROOT_DOMAIN in .env)
#   --email <email>           ACME account email (for expiry warnings)
#   --app-dir <path>          install path (default: root of this repository)
#   --mode <dns|cloudflare|http>
#   --dns-credentials <path>  Cloudflare credentials file (cloudflare mode)
#   --staging                 use the Let's Encrypt staging environment (for testing)
#   --force                   reissue even if a certificate already exists
#   --skip-nginx              do not rebuild the nginx configuration
#   --dry-run                 only print the commands
#   -h, --help                this help
#
# Cloudflare credentials file (mode 600):
#   dns_cloudflare_api_token = <token with Zone.DNS:Edit access>
#
# Installing certbot: the official version is installed from snap (snap install --classic certbot)
# and the DNS plugins as separate snaps with snap connect. If snap is missing or its install
# fails, it falls back to the apt packages.
#
# After issuing, this same script rebuilds the vhost with the 443 block:
#   deploy/nginx/nobino.tls.conf.snippet  →  /etc/nginx/sites-available/nobino.conf
# =====================================================================
set -euo pipefail

C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✅ %s%s\n' "$C_OK" "$*" "$C_OFF"; }
warn() { printf '%s⚠️  %s%s\n' "$C_WARN" "$*" "$C_OFF"; }
die()  { printf '%s❌ %s%s\n' "$C_ERR" "$*" "$C_OFF" >&2; exit 1; }
run()  { if $DRY_RUN; then printf '%s[dry] %s%s\n' "$C_DIM" "$*" "$C_OFF"; else "$@"; fi; }
need_value() { [[ $# -ge 2 ]] || die "$1 requires a value (e.g. $1 <value>)"; }

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

usage() {
  cat <<'EOF'
Nobino — obtain an SSL certificate and enable HTTPS

  sudo bash deploy/ssl.sh --domain nobino.ir --email you@example.com

Modes (--mode) — in all modes the certificate is issued by Let's Encrypt:
  dns         wildcard with the manual DNS challenge (default, interactive, no automatic renewal)
  http        root domain only with HTTP-01 (subdomains are not covered)
  cloudflare  optional — automatic wildcard with the Cloudflare DNS plugin (automatic renewal)

Options:
  --domain <domain>         default: ROOT_DOMAIN in .env — for multiple domains (alias)
                            pass it several times or separate with commas; the first domain is the main one
  --email <email>           ACME account email
  --app-dir <path>          default: root of this repository
  --dns-credentials <path>  Cloudflare credentials file (cloudflare mode only)
  --staging                 Let's Encrypt staging environment (for testing)
  --force                   reissue the existing certificate
  --skip-nginx              skip rebuilding the vhost
  --dry-run                 only print the commands
  -h, --help                this help

Recommended example (wildcard, Let's Encrypt):
  sudo bash deploy/ssl.sh --domain nobino.ir --email you@example.com

Multiple domains example (the first domain is the main one, the rest are aliases of the same site):
  sudo bash deploy/ssl.sh --domain nobino.ir --domain nobino.com --email you@example.com

Optional Cloudflare example (automatic renewal):
  printf 'dns_cloudflare_api_token = %s\n' "$CF_TOKEN" | sudo tee /etc/letsencrypt/cloudflare.ini
  sudo chmod 600 /etc/letsencrypt/cloudflare.ini
  sudo bash deploy/ssl.sh --domain nobino.ir --email you@example.com \
       --mode cloudflare --dns-credentials /etc/letsencrypt/cloudflare.ini
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO_DIR"
DOMAIN=""; DOMAINS=(); EMAIL=""; MODE="dns"; DNS_CREDENTIALS=""
STAGING=false; FORCE=false; SKIP_NGINX=false; DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)          need_value "$@"; add_domains "$2"; shift 2 ;;
    --domain=*)        add_domains "${1#*=}"; shift ;;
    --email)           need_value "$@"; EMAIL="$2"; shift 2 ;;
    --email=*)         EMAIL="${1#*=}"; shift ;;
    --app-dir)         need_value "$@"; APP_DIR="$2"; shift 2 ;;
    --app-dir=*)       APP_DIR="${1#*=}"; shift ;;
    --mode)            need_value "$@"; MODE="$2"; shift 2 ;;
    --mode=*)          MODE="${1#*=}"; shift ;;
    --dns-credentials) need_value "$@"; DNS_CREDENTIALS="$2"; shift 2 ;;
    --dns-credentials=*) DNS_CREDENTIALS="${1#*=}"; shift ;;
    --staging)         STAGING=true; shift ;;
    --force)           FORCE=true; shift ;;
    --skip-nginx)      SKIP_NGINX=true; shift ;;
    --dry-run)         DRY_RUN=true; shift ;;
    -h|--help)         usage; exit 0 ;;
    *)                 die "Unknown option: $1 (see --help)" ;;
  esac
done

[[ "$(id -u)" == "0" ]] || die "Run with sudo:  sudo bash deploy/ssl.sh --domain nobino.ir --email you@example.com"
command -v apt-get >/dev/null 2>&1 || die "This script is for Ubuntu/Debian (apt)."

read_env() {
  [[ -f "$APP_DIR/.env" ]] || return 0
  awk -v k="$1" 'BEGIN{FS="="} $1==k { v=substr($0, index($0,"=")+1); gsub(/\r$/,"",v); gsub(/^"/,"",v); gsub(/"$/,"",v); print v }' "$APP_DIR/.env" | tail -1
}

# ── Domains: --domain several times/with commas; the first domain is the main one ──
if [[ ${#DOMAINS[@]} -eq 0 ]]; then
  add_domains "$(read_env ROOT_DOMAIN)"
  [[ ${#DOMAINS[@]} -eq 0 ]] && add_domains "$(read_env SITE_URL)"
  add_domains "$(read_env EXTRA_DOMAINS)"
elif [[ "${DOMAINS[0]}" == "$(norm_domain "$(read_env ROOT_DOMAIN)")" ]]; then
  add_domains "$(read_env EXTRA_DOMAINS)"
fi
[[ ${#DOMAINS[@]} -gt 0 ]] || die "A domain is required:  --domain nobino.ir"
for d in "${DOMAINS[@]}"; do
  [[ "$d" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || die "Invalid domain: '$d'."
done
DOMAIN="${DOMAINS[0]}"
DOMAIN_ALIASES=()
[[ ${#DOMAINS[@]} -gt 1 ]] && DOMAIN_ALIASES=("${DOMAINS[@]:1}")

case "$MODE" in dns|cloudflare|http) ;; *) die "--mode must be dns, cloudflare or http (got: $MODE)." ;; esac

CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
CERT_CRT="$CERT_DIR/fullchain.pem"
CERT_KEY="$CERT_DIR/privkey.pem"

# Does the existing certificate cover all current domains? (adding a new alias = reissue)
cert_covers_domains() {
  [[ -f "$CERT_CRT" ]] || return 1
  command -v openssl >/dev/null 2>&1 || return 1
  local san d
  san="$(openssl x509 -in "$CERT_CRT" -noout -text 2>/dev/null \
    | awk '/Subject Alternative Name/{getline; print; exit}' \
    | tr ',' '\n' | sed -e 's/^[[:space:]]*//' -e 's/^DNS://')"
  [[ -n "$san" ]] || return 1
  for d in "${DOMAINS[@]}"; do
    if [[ "$d" == "$DOMAIN" && "$MODE" != "http" ]]; then
      grep -qxF "$d" <<<"$san" || return 1
      grep -qxF "*.$d" <<<"$san" || return 1
    else
      grep -qxF "$d" <<<"$san" || return 1
    fi
  done
  return 0
}

# Should the certificate be issued? (if it exists and covers all domains, only nginx is rebuilt)
ISSUE=true
if [[ -f "$CERT_CRT" ]] && ! $FORCE; then
  if cert_covers_domains; then
    ISSUE=false
    ok "A certificate already exists: $CERT_CRT"
    say "   For a forced reissue: --force"
  else
    warn "The existing certificate does not cover all current domains (${DOMAINS[*]}); it will be issued again."
  fi
fi

# ── certbot: snap (official version) with fallback to apt ──────────
CERTBOT_BIN="$(command -v certbot 2>/dev/null || true)"
IS_SNAP_CERTBOT=false
if [[ -n "$CERTBOT_BIN" ]]; then
  RESOLVED_BIN="$(readlink -f "$CERTBOT_BIN" 2>/dev/null || printf '%s' "$CERTBOT_BIN")"
  [[ "$RESOLVED_BIN" == /snap/* ]] && IS_SNAP_CERTBOT=true
fi

certbot_has_plugin() {
  [[ -n "$CERTBOT_BIN" && -x "$CERTBOT_BIN" ]] || return 1
  "$CERTBOT_BIN" plugins --text 2>/dev/null | grep -qi -- "$1"
}

install_certbot_snap() {
  run snap install core || true
  run snap refresh core || true
  run snap install --classic certbot || return 1
  # symlink so that `certbot` in PATH takes precedence over the apt version
  if ! $DRY_RUN && [[ ! -e /usr/local/bin/certbot ]]; then
    ln -sfn /snap/bin/certbot /usr/local/bin/certbot
  fi
  CERTBOT_BIN=/snap/bin/certbot
  IS_SNAP_CERTBOT=true
}

# ── cloudflare mode checks ──────────────────────────────────────────
if [[ "$MODE" == "cloudflare" ]]; then
  [[ -n "$DNS_CREDENTIALS" ]] || die "For --mode cloudflare you must provide --dns-credentials <file path>."
  [[ -f "$DNS_CREDENTIALS" ]] || die "Credentials file not found: $DNS_CREDENTIALS"
  PERM="$(stat -c '%a' "$DNS_CREDENTIALS" 2>/dev/null || echo '')"
  if [[ -n "$PERM" && "$PERM" != "600" && "$PERM" != "400" ]]; then
    warn "The permissions of $DNS_CREDENTIALS are $PERM; 600 is better:  sudo chmod 600 $DNS_CREDENTIALS"
  fi
fi

# ── manual dns mode only needs interactive input when issuing ───────
if $ISSUE && [[ "$MODE" == "dns" ]] && ! $DRY_RUN && [[ ! -t 0 ]]; then
  die "Manual DNS mode is interactive and stdin is not a terminal. Run this script directly in a terminal, or use --mode cloudflare (automatic) / --mode http."
fi

# ── installing certbot: snap (official) → apt on error ─────────────
if $ISSUE; then
  if ! $IS_SNAP_CERTBOT && command -v snap >/dev/null 2>&1; then
    say "— Installing certbot from snap (official Let's Encrypt version) —"
    if install_certbot_snap; then
      ok "certbot from snap is ready: $CERTBOT_BIN"
    else
      warn "The snap installation failed; apt is used instead."
      IS_SNAP_CERTBOT=false
      CERTBOT_BIN="$(command -v certbot 2>/dev/null || true)"
    fi
  fi

  if $IS_SNAP_CERTBOT; then
    if [[ "$MODE" == "cloudflare" ]] && ! certbot_has_plugin dns-cloudflare; then
      say "— Installing the snap plugin: certbot-dns-cloudflare —"
      run snap install certbot-dns-cloudflare \
        || die "The snap plugin was not installed; use --mode dns or --mode http."
      run snap set certbot trust-plugin-with-root=ok || true
      run snap connect certbot:plugin certbot-dns-cloudflare \
        || die "Plugin connection failed: sudo snap connect certbot:plugin certbot-dns-cloudflare"
    fi
  else
    PKGS=()
    [[ -n "$CERTBOT_BIN" ]] || PKGS+=(certbot)
    case "$MODE" in
      http)       certbot_has_plugin nginx          || PKGS+=(python3-certbot-nginx) ;;
      cloudflare) certbot_has_plugin dns-cloudflare || PKGS+=(python3-certbot-dns-cloudflare) ;;
    esac
    if [[ ${#PKGS[@]} -gt 0 ]]; then
      say "— Installing with apt: ${PKGS[*]} —"
      run apt-get update -qq
      run env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${PKGS[@]}"
    fi
    [[ -n "$CERTBOT_BIN" ]] || CERTBOT_BIN="$(command -v certbot 2>/dev/null || true)"
    if ! $DRY_RUN && [[ -z "$CERTBOT_BIN" ]]; then
      die "certbot was not installed; run 'sudo snap install --classic certbot' manually."
    fi
  fi
fi

# ── issuing the certificate ────────────────────────────────────────
if $ISSUE; then
  say "— Requesting a certificate from Let's Encrypt (mode=$MODE) —"
  CERTBOT=("${CERTBOT_BIN:-certbot}" certonly --cert-name "$DOMAIN" --agree-tos)
  if [[ -n "$EMAIL" ]]; then
    CERTBOT+=(--email "$EMAIL" --no-eff-email)
  else
    CERTBOT+=(--register-unsafely-without-email)
    warn "Registering without --email; you will not receive expiry warnings."
  fi
  $STAGING && CERTBOT+=(--staging)
  $FORCE && CERTBOT+=(--force-renewal)
  # certificate: main domain + wildcard for the subdomains; alias domains only themselves
  CERT_DOMAIN_ARGS=()
  if [[ "$MODE" == "http" ]]; then
    for d in "${DOMAINS[@]}"; do CERT_DOMAIN_ARGS+=(-d "$d"); done
  else
    for d in "${DOMAINS[@]}"; do
      if [[ "$d" == "$DOMAIN" ]]; then
        CERT_DOMAIN_ARGS+=(-d "$d" -d "*.$d")
      else
        CERT_DOMAIN_ARGS+=(-d "$d")
      fi
    done
  fi
  case "$MODE" in
    dns)
      CERTBOT+=(--manual --preferred-challenges dns "${CERT_DOMAIN_ARGS[@]}")
      say "   certbot will ask for TXT record(s) on _acme-challenge for each domain;"
      say "   add all the values together and wait for DNS propagation."
      ;;
    http)
      CERTBOT+=(--nginx -n "${CERT_DOMAIN_ARGS[@]}")
      warn "http mode only covers the root domains; the hall subdomains have no valid certificate."
      ;;
    cloudflare)
      CERTBOT+=(--dns-cloudflare --dns-cloudflare-credentials "$DNS_CREDENTIALS" -n "${CERT_DOMAIN_ARGS[@]}")
      ;;
  esac
  if $DRY_RUN; then
    printf '%s[dry] %s%s\n' "$C_DIM" "${CERTBOT[*]}" "$C_OFF"
  else
    "${CERTBOT[@]}"
    ok "Certificate issued: $CERT_CRT"
  fi
fi

# ── renewal hook: reload nginx after each successful renewal ────────
if ! $DRY_RUN; then
  HOOK_DIR="/etc/letsencrypt/renewal-hooks/deploy"
  install -d -m 755 "$HOOK_DIR"
  cat >"$HOOK_DIR/reload-nginx.sh" <<'EOS'
#!/bin/sh
systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || true
EOS
  chmod 755 "$HOOK_DIR/reload-nginx.sh"
  ok "Renewal hook installed: $HOOK_DIR/reload-nginx.sh"
fi

# ── renewal timer ───────────────────────────────────────────────────
if [[ "$MODE" == "dns" ]]; then
  warn "A manual DNS certificate has no automatic renewal; run this same command again every ~90 days."
  warn "For automatic renewal use a DNS plugin (e.g. --mode cloudflare)."
elif ! $DRY_RUN; then
  if $IS_SNAP_CERTBOT; then
    if systemctl is-active --quiet snap.certbot.renew.timer 2>/dev/null; then
      ok "The snap automatic renewal timer is active (snap.certbot.renew.timer)"
    else
      warn "The snap.certbot.renew.timer is not active; check 'sudo systemctl start snap.certbot.renew.timer'."
    fi
  elif systemctl list-unit-files 2>/dev/null | grep -q '^certbot.timer'; then
    run systemctl enable --now certbot.timer
    ok "certbot.timer enabled (automatic renewal)"
  else
    warn "No renewal timer found; check the status with 'systemctl list-timers | grep certbot' or set up a daily cron 'certbot renew --quiet'."
  fi
fi

# ── rebuilding the vhost with the HTTPS block ───────────────────────
if ! $SKIP_NGINX; then
  if [[ -f "$APP_DIR/deploy/install.sh" && -f "$APP_DIR/.env" ]]; then
    say "— Rebuilding the vhost with the 443 block (deploy/install.sh --tls) —"
    REBUILD_ARGS=(--app-dir "$APP_DIR" --tls --skip-build)
    for d in "${DOMAINS[@]}"; do REBUILD_ARGS+=(--domain "$d"); done
    $DRY_RUN && REBUILD_ARGS+=(--dry-run)
    run env DB_SETUP=skip bash "$APP_DIR/deploy/install.sh" "${REBUILD_ARGS[@]}"
  else
    warn "install.sh or .env not found; build the HTTPS block manually from deploy/nginx/nobino.tls.conf.snippet."
  fi
fi

# ── final check ─────────────────────────────────────────────────────
SITE_URL="$(read_env SITE_URL)"
if [[ -n "$SITE_URL" && "$SITE_URL" != https://* ]]; then
  warn "SITE_URL in .env is still not https ($SITE_URL); set it to https://$DOMAIN and restart the service."
fi

if ! $DRY_RUN && [[ -f "$CERT_CRT" ]] && command -v openssl >/dev/null 2>&1; then
  openssl x509 -in "$CERT_CRT" -noout -subject -dates 2>/dev/null | sed 's/^/   /' || true
fi

say ""
say "${C_OK}The SSL step is complete.${C_OFF} Check:"
say "  nginx -t && systemctl reload nginx"
say "  curl -sI https://$DOMAIN | head -3"
say "  curl -s https://$DOMAIN/api/health?db=1"
say "  openssl s_client -connect $DOMAIN:443 -servername $DOMAIN </dev/null 2>/dev/null | openssl x509 -noout -dates -subject"
