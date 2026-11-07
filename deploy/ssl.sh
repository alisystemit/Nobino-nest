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
# حالت‌ها (--mode):
#   dns         گواهی wildcard با چالش DNS دستی (تعاملی؛ تمدید خودکار ندارد)
#   cloudflare  گواهی wildcard خودکار با API توکن Cloudflare (تمدید خودکار)
#   http        فقط دامنهٔ ریشه با چالش HTTP-01 (ساب‌دامین‌ها پوشش داده نمی‌شوند)
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

usage() {
  cat <<'EOF'
Nobino — دریافت گواهی SSL و فعال‌سازی HTTPS

  sudo bash deploy/ssl.sh --domain nobino.ir --email you@example.com

حالت‌ها (--mode):
  dns         wildcard با چالش DNS دستی (پیش‌فرض، تعاملی)
  cloudflare  wildcard خودکار با API توکن Cloudflare (تمدید خودکار)
  http        فقط دامنهٔ ریشه با HTTP-01 (ساب‌دامین‌ها پوشش داده نمی‌شوند)

گزینه‌ها:
  --domain <دامنه>          پیش‌فرض: ROOT_DOMAIN در .env
  --email <ایمیل>           ایمیل حساب ACME
  --app-dir <مسیر>          پیش‌فرض: ریشهٔ همین مخزن
  --dns-credentials <مسیر>  فایل اعتبارنامهٔ Cloudflare
  --staging                 محیط staging لتس‌انکریپت (برای تست)
  --force                   صدور مجدد گواهی موجود
  --skip-nginx              بازسازی vhost را رد کن
  --dry-run                 فقط چاپ فرمان‌ها
  -h, --help                همین راهنما

نمونهٔ Cloudflare:
  printf 'dns_cloudflare_api_token = %s\n' "$CF_TOKEN" | sudo tee /etc/letsencrypt/cloudflare.ini
  sudo chmod 600 /etc/letsencrypt/cloudflare.ini
  sudo bash deploy/ssl.sh --domain nobino.ir --email you@example.com \
       --mode cloudflare --dns-credentials /etc/letsencrypt/cloudflare.ini
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO_DIR"
DOMAIN=""; EMAIL=""; MODE="dns"; DNS_CREDENTIALS=""
STAGING=false; FORCE=false; SKIP_NGINX=false; DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)          need_value "$@"; DOMAIN="$2"; shift 2 ;;
    --domain=*)        DOMAIN="${1#*=}"; shift ;;
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

# دامنه را از .env بگیر و مثل install.sh نرمال کن (بدون پروتکل/مسیر/پورت)
if [[ -z "$DOMAIN" ]]; then
  DOMAIN="$(read_env ROOT_DOMAIN)"
  [[ -n "$DOMAIN" ]] || DOMAIN="$(read_env SITE_URL)"
fi
DOMAIN="${DOMAIN#*://}"; DOMAIN="${DOMAIN%%/*}"; DOMAIN="${DOMAIN%%:*}"
[[ -n "$DOMAIN" ]] || die "دامنه لازم است:  --domain nobino.ir"
[[ "$DOMAIN" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || die "دامنه معتبر نیست: «$DOMAIN»."

case "$MODE" in dns|cloudflare|http) ;; *) die "--mode باید dns یا cloudflare یا http باشد (دادید: $MODE)." ;; esac

CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
CERT_CRT="$CERT_DIR/fullchain.pem"
CERT_KEY="$CERT_DIR/privkey.pem"

# آیا گواهی صادر شود؟ (اگر موجود است و --force نبوده، فقط nginx بازسازی می‌شود)
ISSUE=true
if [[ -f "$CERT_CRT" ]] && ! $FORCE; then
  ISSUE=false
  ok "گواهی از قبل موجود است: $CERT_CRT"
  say "   برای صدور مجدد اجباری: --force"
fi

# ── انتخاب بسته‌های certbot ─────────────────────────────────────────
PKGS=(certbot)
case "$MODE" in
  http)       PKGS+=(python3-certbot-nginx) ;;
  cloudflare) PKGS+=(python3-certbot-dns-cloudflare) ;;
esac

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

# ── نصب certbot (فقط اگر لازم است) ──────────────────────────────────
MISSING=()
for p in "${PKGS[@]}"; do
  dpkg -s "$p" >/dev/null 2>&1 || MISSING+=("$p")
done
if [[ ${#MISSING[@]} -gt 0 ]]; then
  say "— نصب: ${MISSING[*]} —"
  run apt-get update -qq
  run env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${MISSING[@]}"
fi

if $ISSUE && ! $DRY_RUN && ! command -v certbot >/dev/null 2>&1; then
  die "certbot نصب نشد؛ دستی «apt-get install -y certbot python3-certbot-nginx» را اجرا کنید."
fi

# ── صدور گواهی ──────────────────────────────────────────────────────
if $ISSUE; then
  say "— درخواست گواهی از Let's Encrypt (mode=$MODE) —"
  CERTBOT=(certbot certonly --cert-name "$DOMAIN" --agree-tos)
  if [[ -n "$EMAIL" ]]; then
    CERTBOT+=(--email "$EMAIL" --no-eff-email)
  else
    CERTBOT+=(--register-unsafely-without-email)
    warn "بدون --email ثبت می‌شود؛ هشدار انقضا به دستتان نمی‌رسد."
  fi
  $STAGING && CERTBOT+=(--staging)
  $FORCE && CERTBOT+=(--force-renewal)
  case "$MODE" in
    dns)
      CERTBOT+=(--manual --preferred-challenges dns -d "$DOMAIN" -d "*.$DOMAIN")
      say "   certbot دو رکورد TXT برای _acme-challenge.$DOMAIN می‌خواهد؛"
      say "   هر دو مقدار را با هم ثبت کنید و تا انتشار DNS صبر کنید."
      ;;
    http)
      CERTBOT+=(--nginx -n -d "$DOMAIN")
      warn "حالت http فقط «$DOMAIN» را پوشش می‌دهد؛ ساب‌دامین سالن‌ها گواهی معتبر ندارند."
      ;;
    cloudflare)
      CERTBOT+=(--dns-cloudflare --dns-cloudflare-credentials "$DNS_CREDENTIALS" -n -d "$DOMAIN" -d "*.$DOMAIN")
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
  warn "برای تمدید خودکار از --mode cloudflare (یا DNS plugin دیگر) استفاده کنید."
elif ! $DRY_RUN; then
  if systemctl list-unit-files 2>/dev/null | grep -q '^certbot.timer'; then
    run systemctl enable --now certbot.timer
    ok "certbot.timer فعال شد (تمدید خودکار)"
  else
    warn "certbot.timer پیدا نشد؛ تمدید را با cron روزانه «certbot renew --quiet» تنظیم کنید."
  fi
fi

# ── بازسازی vhost با بلوک HTTPS ─────────────────────────────────────
if ! $SKIP_NGINX; then
  if [[ -f "$APP_DIR/deploy/install.sh" && -f "$APP_DIR/.env" ]]; then
    say "— بازسازی vhost با بلوک ۴۴۳ (deploy/install.sh --tls) —"
    REBUILD_ARGS=(--domain "$DOMAIN" --app-dir "$APP_DIR" --tls --skip-build)
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
