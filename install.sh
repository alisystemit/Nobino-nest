#!/usr/bin/env bash
# =====================================================================
# Nobino — نصب‌کنندهٔ تک‌خطی (Ubuntu/Debian)
#
#   curl -fsSL https://raw.githubusercontent.com/alisystemit/Nobino-nest/master/install.sh \
#     | sudo bash -s -- --domain example.com
#
# این اسکریپت مخزن را در /opt/nobino می‌گیرد و بعد deploy/bootstrap.sh را
# اجرا می‌کند؛ همان نصب کامل (Node، PM2، PostgreSQL، .env، بیلد، nginx،
# سرویس و سوپرادمین).
#
# گزینه‌ها:
#   --domain <دامنه>     اجباری — دامنهٔ سایت (مثلاً nobino.ir)
#   --app-dir <مسیر>     مسیر نصب (پیش‌فرض /opt/nobino)
#   --branch <شاخه>      شاخهٔ گیت (پیش‌فرض master)
#   -h, --help           همین راهنما
#
# بقیهٔ گزینه‌ها مستقیم به deploy/bootstrap.sh پاس می‌شوند:
#   --port --pg-password --database-url --admin-phone --admin-password
#   --no-admin --no-firewall --with-postgres --dry-run
#   --tls --email --ssl-mode --dns-credentials
#
# SSL: گواهی همیشه از Let's Encrypt گرفته می‌شود.
#   --ssl-mode dns        wildcard با چالش DNS دستی (تعاملی؛ در pipe کار نمی‌کند)
#   --ssl-mode http       فقط دامنهٔ ریشه با HTTP-01 (غیرتعاملی)
#   --ssl-mode cloudflare اختیاری — تمدید خودکار wildcard با پلاگین DNS کلادفلر
#
# متغیرهای محیطی:
#   ADMIN_PHONE / ADMIN_PASSWORD   ساخت سوپرادمین اولیه (وقتی خود اسکریپت با
#                                  root اجرا می‌شود؛ با sudo معمولاً env_reset
#                                  آن‌ها را حذف می‌کند — از پرچم‌ها استفاده کنید)
#   NOBINO_REPO / NOBINO_BRANCH / NOBINO_APP_DIR
#
# مثال با سوپرادمین از پیش تعیین‌شده:
#   curl -fsSL .../install.sh | sudo bash -s -- --domain example.com \
#     --admin-phone 09121110000 --admin-password 'YourStrong#Pass'
# (پرچم‌ها در `ps` دیده می‌شوند؛ امن‌تر: نصب بدون آن‌ها و بعد
#  sudo env ADMIN_PHONE=... ADMIN_PASSWORD=... node scripts/create-admin.mjs)
#
# SSL پیشنهادی: بعد از نصب، در ترمینال (گواهی wildcard از Let's Encrypt):
#   sudo bash /opt/nobino/deploy/ssl.sh --domain example.com --email you@example.com
# =====================================================================
set -euo pipefail

C_OK=$'\033[32m'; C_ERR=$'\033[31m'; C_OFF=$'\033[0m'
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✅ %s%s\n' "$C_OK" "$*" "$C_OFF"; }
die()  { printf '%s❌ %s%s\n' "$C_ERR" "$*" "$C_OFF" >&2; exit 1; }
need_value() { [[ $# -ge 2 ]] || die "$1 به یک مقدار نیاز دارد (مثلاً $1 <مقدار>)"; }

usage() {
  cat <<'EOF'
Nobino — نصب‌کنندهٔ تک‌خطی (Ubuntu/Debian)

  curl -fsSL https://raw.githubusercontent.com/alisystemit/Nobino-nest/master/install.sh \
    | sudo bash -s -- --domain example.com

این اسکریپت مخزن را در /opt/nobino می‌گیرد و بعد deploy/bootstrap.sh را
اجرا می‌کند؛ همان نصب کامل (Node، PM2، PostgreSQL، .env، بیلد، nginx،
سرویس و سوپرادمین).

گزینه‌ها:
  --domain <دامنه>     اجباری — دامنهٔ سایت (مثلاً nobino.ir)
  --app-dir <مسیر>     مسیر نصب (پیش‌فرض /opt/nobino)
  --branch <شاخه>      شاخهٔ گیت (پیش‌فرض master)
  -h, --help           همین راهنما

بقیهٔ گزینه‌ها مستقیم به deploy/bootstrap.sh پاس می‌شوند:
  --port --pg-password --database-url --admin-phone --admin-password
  --no-admin --no-firewall --with-postgres --dry-run
  --tls --email --ssl-mode --dns-credentials

SSL (گواهی همیشه از Let's Encrypt؛ با --tls --email):
  --ssl-mode dns         wildcard با چالش DNS دستی (تعاملی؛ در pipe نه)
  --ssl-mode http        فقط دامنهٔ ریشه با HTTP-01 (غیرتعاملی)
  --ssl-mode cloudflare  اختیاری — تمدید خودکار با پلاگین DNS کلادفلر

متغیرهای محیطی:
  ADMIN_PHONE / ADMIN_PASSWORD   ساخت سوپرادمین اولیه (وقتی با root اجرا شود)
  NOBINO_REPO / NOBINO_BRANCH / NOBINO_APP_DIR

مثال با سوپرادمین از پیش تعیین‌شده:
  curl -fsSL .../install.sh | sudo bash -s -- --domain example.com \
    --admin-phone 09121110000 --admin-password 'YourStrong#Pass'
(پرچم‌ها در `ps` دیده می‌شوند؛ امن‌تر: نصب بدون آن‌ها و بعد
 sudo env ADMIN_PHONE=... ADMIN_PASSWORD=... node scripts/create-admin.mjs)

SSL پیشنهادی (بعد از نصب، در ترمینال):
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
$HAS_DOMAIN || die "دامنه لازم است:  ... | sudo bash -s -- --domain example.com"

[[ "$(id -u)" == "0" ]] || die "با sudo اجرا کنید (یا با کاربر root)."
command -v apt-get >/dev/null 2>&1 || die "این نصب‌کننده برای Ubuntu/Debian (apt) است."

# مسیر نسبی را مطلق کن تا bootstrap و سرویس PM2 بعداً گیج نشوند.
case "$APP_DIR" in
  /*) ;;
  *) APP_DIR="$PWD/$APP_DIR" ;;
esac

# git برای دریافت کد لازم است و bootstrap آن را دیرتر نصب می‌کند؛ پس همین‌جا
# اگر نبود نصبش می‌کنیم (curl/ca-certificates هم برای HTTPS ضروری‌اند).
if ! command -v git >/dev/null 2>&1; then
  say "— نصب پیش‌نیازهای دریافت کد (git/curl/ca-certificates) —"
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates curl git
fi

say "— دریافت کد Nobino —"
if [[ -d "$APP_DIR/.git" ]]; then
  ok "کد از قبل در $APP_DIR هست؛ همان استفاده می‌شود."
  say "   برای به‌روزرسانی بعدی:  sudo bash $APP_DIR/deploy/update.sh"
elif [[ -e "$APP_DIR" && -n "$(ls -A "$APP_DIR" 2>/dev/null || true)" ]]; then
  die "$APP_DIR وجود دارد ولی مخزن گیت نیست. یک مسیر خالی با --app-dir بدهید یا خودتان کد را آنجا بگذارید."
else
  say "  $REPO_URL (شاخه: $BRANCH) → $APP_DIR"
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  ok "کد دریافت شد."
fi

[[ -f "$APP_DIR/deploy/bootstrap.sh" ]] || die "deploy/bootstrap.sh در $APP_DIR پیدا نشد؛ دریافت کد ناتمام است."

say "— اجرای نصب کامل (deploy/bootstrap.sh) —"
exec bash "$APP_DIR/deploy/bootstrap.sh" --app-dir "$APP_DIR" "${ARGS[@]}"
