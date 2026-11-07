#!/usr/bin/env bash
# =====================================================================
# Nobino — دریافت گواهی SSL و فعال‌سازی HTTPS
#
#   sudo bash deploy/ssl.sh --domain nobino.ir --email you@example.com
#
# پیش‌فرض: گواهی wildcard برای «دامنه + *.دامنه» با چالش DNS (Let's Encrypt).
# چون ساب‌دامین سالن‌ها (mah.nobino.ir) هم باید معتبر باشند، گواهی wildcard
# لازم است و چالش DNS تنها راه بدون دسترسی به هر ساب‌دامین است.
#
# حالت‌ها (--mode) — گواهی همیشه از Let's Encrypt گرفته می‌شود:
#   dns         گواهی wildcard با چالش DNS دستی (تعاملی؛ تمدید خودکار ندارد)
#   http        فقط دامنهٔ ریشه با چالش HTTP-01 (ساب‌دامین‌ها پوشش داده نمی‌شوند)
#   cloudflare  اختیاری — wildcard خودکار با پلاگین DNS کلادفلر (تمدید خودکار)
#
# گزینه‌ها:
#   --domain <دامنه>          دامنهٔ ریشه (پیش‌فرض: ROOT_DOMAIN در .env)
#   --email <ایمیل>           ایمیل حساب ACME (برای هشدار انقضا)
#   --app-dir <مسیر>          مسیر نصب (پیش‌فرض: ریشهٔ همین مخزن)
#   --mode <dns|cloudflare|http>
#   --dns-credentials <مسیر>  فایل اعتبارنامهٔ Cloudflare (حالت cloudflare)
#   --staging                 استفاده از محیط staging لتس‌انکریپت (برای تست)
#   --force                   صدور مجدد حتی اگر گواهی موجود باشد
#   --skip-nginx              پیکربندی nginx را بازسازی نکن
#   --dry-run                 فقط فرمان‌ها را چاپ کن
#   -h, --help                همین راهنما
#
# فایل اعتبارنامهٔ Cloudflare (مجوز 600):
#   dns_cloudflare_api_token = <token با دسترسی Zone.DNS:Edit>
#
# نصب certbot: نسخهٔ رسمی از snap نصب می‌شود (snap install --classic certbot)
# و پلاگین‌های DNS هم به‌صورت snap جدا و snap connect. اگر snap نبود یا نصبش
# شکست خورد، به بسته‌های apt برمی‌گردد.
#
# بعد از صدور، همین اسکریپت vhost را با بلوک ۴۴۳ بازسازی می‌کند:
#   deploy/nginx/nobino.tls.conf.snippet  →  /etc/nginx/sites-available/nobino.conf
# =====================================================================
set -euo pipefail

C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✅ %s%s\n' "$C_OK" "$*" "$C_OFF"; }
warn() { printf '%s⚠️  %s%s\n' "$C_WARN" "$*" "$C_OFF"; }
die()  { printf '%s❌ %s%s\n' "$C_ERR" "$*" "$C_OFF" >&2; exit 1; }
run()  { if $DRY_RUN; then printf '%s[dry] %s%s\n' "$C_DIM" "$*" "$C_OFF"; else "$@"; fi; }
need_value() { [[ $# -ge 2 ]] || die "$1 به یک مقدار نیاز دارد (مثلاً $1 <مقدار>)"; }

# دامنه را نرمال می‌کند (پروتکل/مسیر/پورت/فاصله) و به فهرست اضافه می‌کند.
# --domain می‌تواند چند بار بیاید یا با کاما/فاصله چند دامنه بگیرد.
norm_domain() {
  local d="${1:-}"
  d="${d,,}"; d="${d#*://}"; d="${d%%/*}"; d="${d%%:*}"; d="${d//[[:space:]]/}"
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
Nobino — دریافت گواهی SSL و فعال‌سازی HTTPS

  sudo bash deploy/ssl.sh --domain nobino.ir --email you@example.com

حالت‌ها (--mode) — گواهی در همهٔ حالت‌ها از Let's Encrypt صادر می‌شود:
  dns         wildcard با چالش DNS دستی (پیش‌فرض، تعاملی، بدون تمدید خودکار)
  http        فقط دامنهٔ ریشه با HTTP-01 (ساب‌دامین‌ها پوشش داده نمی‌شوند)
  cloudflare  اختیاری — wildcard خودکار با پلاگین DNS کلادفلر (تمدید خودکار)

گزینه‌ها:
  --domain <دامنه>          پیش‌فرض: ROOT_DOMAIN در .env — برای چند دامنه (alias)
                            چند بار بدهید یا با کاما جدا کنید؛ دامنهٔ اول اصلی است
  --email <ایمیل>           ایمیل حساب ACME
  --app-dir <مسیر>          پیش‌فرض: ریشهٔ همین مخزن
  --dns-credentials <مسیر>  فایل اعتبارنامهٔ Cloudflare (فقط حالت cloudflare)
  --staging                 محیط staging لتس‌انکریپت (برای تست)
  --force                   صدور مجدد گواهی موجود
  --skip-nginx              بازسازی vhost را رد کن
  --dry-run                 فقط چاپ فرمان‌ها
  -h, --help                همین راهنما

نمونهٔ پیشنهادی (wildcard، Let's Encrypt):
  sudo bash deploy/ssl.sh --domain nobino.ir --email you@example.com

نمونهٔ چند دامنه (دامنهٔ اول اصلی، بقیه alias همان سایت):
  sudo bash deploy/ssl.sh --domain nobino.ir --domain nobino.com --email you@example.com

نمونهٔ اختیاری Cloudflare (تمدید خودکار):
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
    *)                 die "گزینهٔ ناشناخته: $1 (--help را ببینید)" ;;
  esac
done

[[ "$(id -u)" == "0" ]] || die "با sudo اجرا کنید:  sudo bash deploy/ssl.sh --domain nobino.ir --email you@example.com"
command -v apt-get >/dev/null 2>&1 || die "این اسکریپت برای Ubuntu/Debian (apt) است."

read_env() {
  [[ -f "$APP_DIR/.env" ]] || return 0
  awk -v k="$1" 'BEGIN{FS="="} $1==k { v=substr($0, index($0,"=")+1); gsub(/\r$/,"",v); gsub(/^"/,"",v); gsub(/"$/,"",v); print v }' "$APP_DIR/.env" | tail -1
}

# ── دامنه‌ها: --domain چند بار/با کاما؛ دامنهٔ اول اصلی است ──────────
if [[ ${#DOMAINS[@]} -eq 0 ]]; then
  add_domains "$(read_env ROOT_DOMAIN)"
  [[ ${#DOMAINS[@]} -eq 0 ]] && add_domains "$(read_env SITE_URL)"
  add_domains "$(read_env EXTRA_DOMAINS)"
elif [[ "${DOMAINS[0]}" == "$(norm_domain "$(read_env ROOT_DOMAIN)")" ]]; then
  add_domains "$(read_env EXTRA_DOMAINS)"
fi
[[ ${#DOMAINS[@]} -gt 0 ]] || die "دامنه لازم است:  --domain nobino.ir"
for d in "${DOMAINS[@]}"; do
  [[ "$d" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || die "دامنه معتبر نیست: «$d»."
done
DOMAIN="${DOMAINS[0]}"
DOMAIN_ALIASES=()
[[ ${#DOMAINS[@]} -gt 1 ]] && DOMAIN_ALIASES=("${DOMAINS[@]:1}")

case "$MODE" in dns|cloudflare|http) ;; *) die "--mode باید dns یا cloudflare یا http باشد (دادید: $MODE)." ;; esac

CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
CERT_CRT="$CERT_DIR/fullchain.pem"
CERT_KEY="$CERT_DIR/privkey.pem"

# آیا گواهی موجود همهٔ دامنه‌های فعلی را پوشش می‌دهد؟ (افزودن alias تازه = صدور مجدد)
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

# آیا گواهی صادر شود؟ (اگر موجود و پوشش‌دهندهٔ همهٔ دامنه‌ها بود، فقط nginx بازسازی می‌شود)
ISSUE=true
if [[ -f "$CERT_CRT" ]] && ! $FORCE; then
  if cert_covers_domains; then
    ISSUE=false
    ok "گواهی از قبل موجود است: $CERT_CRT"
    say "   برای صدور مجدد اجباری: --force"
  else
    warn "گواهی موجود همهٔ دامنه‌های فعلی (${DOMAINS[*]}) را پوشش نمی‌دهد؛ دوباره صادر می‌شود."
  fi
fi

# ── certbot: snap (نسخهٔ رسمی) با fallback به apt ───────────────────
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
  # symlink تا `certbot` در PATH مقدم بر نسخهٔ apt باشد
  if ! $DRY_RUN && [[ ! -e /usr/local/bin/certbot ]]; then
    ln -sfn /snap/bin/certbot /usr/local/bin/certbot
  fi
  CERTBOT_BIN=/snap/bin/certbot
  IS_SNAP_CERTBOT=true
}

# ── بررسی حالت cloudflare ───────────────────────────────────────────
if [[ "$MODE" == "cloudflare" ]]; then
  [[ -n "$DNS_CREDENTIALS" ]] || die "برای --mode cloudflare باید --dns-credentials <مسیر فایل> بدهید."
  [[ -f "$DNS_CREDENTIALS" ]] || die "فایل اعتبارنامه پیدا نشد: $DNS_CREDENTIALS"
  PERM="$(stat -c '%a' "$DNS_CREDENTIALS" 2>/dev/null || echo '')"
  if [[ -n "$PERM" && "$PERM" != "600" && "$PERM" != "400" ]]; then
    warn "مجوز $DNS_CREDENTIALS برابر $PERM است؛ بهتر است 600 باشد:  sudo chmod 600 $DNS_CREDENTIALS"
  fi
fi

# ── حالت dns دستی فقط هنگام صدور به ورودی تعاملی نیاز دارد ──────────
if $ISSUE && [[ "$MODE" == "dns" ]] && ! $DRY_RUN && [[ ! -t 0 ]]; then
  die "حالت DNS دستی تعاملی است و stdin ترمینال نیست. این اسکریپت را مستقیم در ترمینال اجرا کنید، یا از --mode cloudflare (خودکار) / --mode http استفاده کنید."
fi

# ── نصب certbot: snap (رسمی) → در صورت خطا apt ──────────────────────
if $ISSUE; then
  if ! $IS_SNAP_CERTBOT && command -v snap >/dev/null 2>&1; then
    say "— نصب certbot از snap (نسخهٔ رسمی Let's Encrypt) —"
    if install_certbot_snap; then
      ok "certbot از snap آماده است: $CERTBOT_BIN"
    else
      warn "نصب snap ناموفق بود؛ از apt استفاده می‌شود."
      IS_SNAP_CERTBOT=false
      CERTBOT_BIN="$(command -v certbot 2>/dev/null || true)"
    fi
  fi

  if $IS_SNAP_CERTBOT; then
    if [[ "$MODE" == "cloudflare" ]] && ! certbot_has_plugin dns-cloudflare; then
      say "— نصب پلاگین snap: certbot-dns-cloudflare —"
      run snap install certbot-dns-cloudflare \
        || die "پلاگین snap نصب نشد؛ از --mode dns یا --mode http استفاده کنید."
      run snap set certbot trust-plugin-with-root=ok || true
      run snap connect certbot:plugin certbot-dns-cloudflare \
        || die "اتصال پلاگین انجام نشد: sudo snap connect certbot:plugin certbot-dns-cloudflare"
    fi
  else
    PKGS=()
    [[ -n "$CERTBOT_BIN" ]] || PKGS+=(certbot)
    case "$MODE" in
      http)       certbot_has_plugin nginx          || PKGS+=(python3-certbot-nginx) ;;
      cloudflare) certbot_has_plugin dns-cloudflare || PKGS+=(python3-certbot-dns-cloudflare) ;;
    esac
    if [[ ${#PKGS[@]} -gt 0 ]]; then
      say "— نصب با apt: ${PKGS[*]} —"
      run apt-get update -qq
      run env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${PKGS[@]}"
    fi
    [[ -n "$CERTBOT_BIN" ]] || CERTBOT_BIN="$(command -v certbot 2>/dev/null || true)"
    if ! $DRY_RUN && [[ -z "$CERTBOT_BIN" ]]; then
      die "certbot نصب نشد؛ دستی «sudo snap install --classic certbot» را اجرا کنید."
    fi
  fi
fi

# ── صدور گواهی ──────────────────────────────────────────────────────
if $ISSUE; then
  say "— درخواست گواهی از Let's Encrypt (mode=$MODE) —"
  CERTBOT=("${CERTBOT_BIN:-certbot}" certonly --cert-name "$DOMAIN" --agree-tos)
  if [[ -n "$EMAIL" ]]; then
    CERTBOT+=(--email "$EMAIL" --no-eff-email)
  else
    CERTBOT+=(--register-unsafely-without-email)
    warn "بدون --email ثبت می‌شود؛ هشدار انقضا به دستتان نمی‌رسد."
  fi
  $STAGING && CERTBOT+=(--staging)
  $FORCE && CERTBOT+=(--force-renewal)
  # گواهی: دامنهٔ اصلی + wildcard ساب‌دامین‌ها؛ دامنه‌های alias فقط خودشان
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
      say "   certbot برای هر دامنه رکورد(های) TXT روی _acme-challenge می‌خواهد؛"
      say "   همهٔ مقادیر را با هم ثبت کنید و تا انتشار DNS صبر کنید."
      ;;
    http)
      CERTBOT+=(--nginx -n "${CERT_DOMAIN_ARGS[@]}")
      warn "حالت http فقط دامنه‌های ریشه را پوشش می‌دهد؛ ساب‌دامین سالن‌ها گواهی معتبر ندارند."
      ;;
    cloudflare)
      CERTBOT+=(--dns-cloudflare --dns-cloudflare-credentials "$DNS_CREDENTIALS" -n "${CERT_DOMAIN_ARGS[@]}")
      ;;
  esac
  if $DRY_RUN; then
    printf '%s[dry] %s%s\n' "$C_DIM" "${CERTBOT[*]}" "$C_OFF"
  else
    "${CERTBOT[@]}"
    ok "گواهی صادر شد: $CERT_CRT"
  fi
fi

# ── هوک تمدید: بعد از هر تمدید موفق nginx ری‌لود شود ─────────────────
if ! $DRY_RUN; then
  HOOK_DIR="/etc/letsencrypt/renewal-hooks/deploy"
  install -d -m 755 "$HOOK_DIR"
  cat >"$HOOK_DIR/reload-nginx.sh" <<'EOS'
#!/bin/sh
systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || true
EOS
  chmod 755 "$HOOK_DIR/reload-nginx.sh"
  ok "هوک تمدید نصب شد: $HOOK_DIR/reload-nginx.sh"
fi

# ── زمان‌بند تمدید ──────────────────────────────────────────────────
if [[ "$MODE" == "dns" ]]; then
  warn "گواهی DNS دستی تمدید خودکار ندارد؛ هر ~۹۰ روز همین فرمان را دوباره اجرا کنید."
  warn "برای تمدید خودکار از یک پلاگین DNS (مثلاً --mode cloudflare) استفاده کنید."
elif ! $DRY_RUN; then
  if $IS_SNAP_CERTBOT; then
    if systemctl is-active --quiet snap.certbot.renew.timer 2>/dev/null; then
      ok "زمان‌بند تمدید خودکار snap فعال است (snap.certbot.renew.timer)"
    else
      warn "زمان‌بند snap.certbot.renew.timer فعال نیست؛ «sudo systemctl start snap.certbot.renew.timer» را بررسی کنید."
    fi
  elif systemctl list-unit-files 2>/dev/null | grep -q '^certbot.timer'; then
    run systemctl enable --now certbot.timer
    ok "certbot.timer فعال شد (تمدید خودکار)"
  else
    warn "زمان‌بند تمدید پیدا نشد؛ وضعیت را با «systemctl list-timers | grep certbot» ببینید یا cron روزانه «certbot renew --quiet» بگذارید."
  fi
fi

# ── بازسازی vhost با بلوک HTTPS ─────────────────────────────────────
if ! $SKIP_NGINX; then
  if [[ -f "$APP_DIR/deploy/install.sh" && -f "$APP_DIR/.env" ]]; then
    say "— بازسازی vhost با بلوک ۴۴۳ (deploy/install.sh --tls) —"
    REBUILD_ARGS=(--app-dir "$APP_DIR" --tls --skip-build)
    for d in "${DOMAINS[@]}"; do REBUILD_ARGS+=(--domain "$d"); done
    $DRY_RUN && REBUILD_ARGS+=(--dry-run)
    run env DB_SETUP=skip bash "$APP_DIR/deploy/install.sh" "${REBUILD_ARGS[@]}"
  else
    warn "install.sh یا .env پیدا نشد؛ بلوک HTTPS را از deploy/nginx/nobino.tls.conf.snippet دستی بسازید."
  fi
fi

# ── بررسی نهایی ─────────────────────────────────────────────────────
SITE_URL="$(read_env SITE_URL)"
if [[ -n "$SITE_URL" && "$SITE_URL" != https://* ]]; then
  warn "SITE_URL در .env هنوز https نیست ($SITE_URL)؛ آن را https://$DOMAIN بگذارید و سرویس را restart کنید."
fi

if ! $DRY_RUN && [[ -f "$CERT_CRT" ]] && command -v openssl >/dev/null 2>&1; then
  openssl x509 -in "$CERT_CRT" -noout -subject -dates 2>/dev/null | sed 's/^/   /' || true
fi

say ""
say "${C_OK}مرحلهٔ SSL تمام شد.${C_OFF} بررسی کنید:"
say "  nginx -t && systemctl reload nginx"
say "  curl -sI https://$DOMAIN | head -3"
say "  curl -s https://$DOMAIN/api/health?db=1"
say "  openssl s_client -connect $DOMAIN:443 -servername $DOMAIN </dev/null 2>/dev/null | openssl x509 -noout -dates -subject"
