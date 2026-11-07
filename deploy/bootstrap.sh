#!/usr/bin/env bash
# =====================================================================
# Nobino (نسخهٔ NestJS) — bootstrap یک‌فرمانی برای VPS کاملاً خام
#
#   sudo bash deploy/bootstrap.sh --domain nobino.ir
#
# از یک Ubuntu/Debian که «هیچ چیز» نصب ندارد، همه‌کار را اتوماتیک می‌کند:
#   ۱) پیش‌نیازهای OS (curl/ca-certificates/gnupg/git/rsync)
#   ۲) ساخت swap اگر رمز کمتر از ۲ گیگ است (بیلد vite/Prisma خاموش نشود)
#   ۳) Node.js 24 از NodeSource + PM2
#   ۴) PostgreSQL سروری + یوزر/دیتابیس `nobino` با رمز تصادفی
#      — اگر روی سرور Postgres از قبل داده دارد، دست نمی‌زند مگر --with-postgres
#   ۵) ساخت خودکار .env از deploy/env.production.example با
#      DATABASE_URL/JWT_SECRET/CRON_SECRET/دامنه‌های پرشده (بدون CHANGE_ME)
#      — اگر .env موجود باشد، بی‌آن کار نمی‌کند
#   ۶) ufw: فقط SSH + 80 + 443 + 8443 باز می‌شود (اگر ufw فعال نیست، فعال می‌کند؛
#      با --no-firewall کلاً دست نمی‌زند)
#   ۷) در پایان deploy/install.sh را کامل اجرا می‌کند (بیلد + PM2 + nginx + سلامت)
#   ۷.۵) اگر --tls بدهید، deploy/ssl.sh گواهی Let's Encrypt می‌گیرد و
#      بلوک HTTPS را در nginx فعال می‌کند (wildcard با DNS یا Cloudflare)
#   ۸) ساخت اولین سوپرادمین با موبایل/رمز دلخواه (اگر دیتابیس خالی باشد؛
#      با --admin-phone/--admin-password بدون پرسش، یا در پایان خودکار می‌پرسد)
#
# گزینه‌ها:
#   --domain <دامنه>      ضروری (مثلاً nobino.ir) — دامنه‌ای که سرویس رویش بالا می‌آید
#   --repo <git-url>      آدرس git مخزن؛ اگر مخزن این اسکریپت نیست کلون می‌شود
#   --app-dir <مسیر>      مسیر نصب (پیش‌فرض /opt/nobino؛ اگر مخزن جاری همان جا نیست کلون/کپی می‌شود)
#   --port <پورت>         پورت داخلی (پیش‌فرض 3100)
#   --pg-password <رمز>   رمز یوزر دیتابیس (پیش‌فرض: تصادفی؛ در .env و پیام پایانی می‌بینید)
#   --database-url <نشانی>  نشانی دیتابیس آماده؛ وقتی Postgres همین سرور هست و
#                        نمی‌خواهید سؤال بپرسد (CI و curl|bash از این گزینه استفاده کنند)
#   --admin-phone <موبایل>   شمارهٔ سوپرادمین اولیه (هم‌شکل ورود مدیران، ۱۱ رقم با 0)
#   --admin-password <رمز>   رمز سوپرادمین اولیه (حداقل ۸ کاراکتر)
#                        — اگر تا می‌توانید به‌جای این دو پرچم، متغیرهای محیطی
#                          ADMIN_PHONE و ADMIN_PASSWORD را بدهید تا رمز در `ps`
#                          و تاریخچهٔ shell نماند
#   --no-admin            ساخت سوپرادمین را انجام نده (بعداً دستی: scripts/create-admin.mjs)
#   --no-firewall         ufw را لمس نکن
#   --with-postgres       حتی اگر Postgres هست، یوزر/دیتابیس nobino بساز (بدون نصب دوباره)
#   --tls                 بعد از نصب SSL بگیر و HTTPS را فعال کن (نیازمند --email)
#   --email <ایمیل>       ایمیل حساب ACME برای Let's Encrypt
#   --ssl-mode <حالت>     dns (پیش‌فرض، wildcard تعاملی) | cloudflare | http
#   --dns-credentials <مسیر>  فایل اعتبارنامهٔ Cloudflare (برای ssl-mode=cloudflare)
#   --dry-run             فرمان‌های تغییردهنده فقط چاپ می‌شوند
#
# امنیت: هیچ داده‌ای به بیرون ارسال نمی‌شود. رمزها فقط در همین سرور
# (فایل .env با مجوز 600) می‌مانند. به PHP/MySQL/برنامه‌ها و اعتبارنامه‌های
# موجود دیگر دست زده نمی‌شود.
# =====================================================================
set -euo pipefail

C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✅ %s%s\n' "$C_OK" "$*" "$C_OFF"; }
warn() { printf '%s⚠️  %s%s\n' "$C_WARN" "$*" "$C_OFF"; }
die()  { printf '%s❌ %s%s\n' "$C_ERR" "$*" "$C_OFF" >&2; exit 1; }
run()  { if $DRY_RUN; then printf '%s[dry] %s%s\n' "$C_DIM" "$*" "$C_OFF"; else "$@"; fi; }
# runsh: اجرای فرمان با پوستهٔ فرعی (برای پایپ/ریدایرکت/append)
runsh() { if $DRY_RUN; then printf '%s[dry] %s%s\n' "$C_DIM" "$*" "$C_OFF"; else bash -c "$*"; fi; }
# گزینهٔ مقداردار بدون مقدار نباید با «$2: unbound variable» بمیرد (ME-5).
need_value() { [[ $# -ge 2 ]] || die "$1 به یک مقدار نیاز دارد (مثلاً $1 <مقدار>)"; }

DOMAIN="" REPO_URL="" APP_DIR="/opt/nobino" PORT="3100" PG_PASSWORD=""
# رمز/شمارهٔ سوپرادمین از محیط هم پذیرفته می‌شود تا روی argv (در `ps`) و در
# تاریخچهٔ shell نماند (HG-2).
ADMIN_PHONE="${ADMIN_PHONE:-}" ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
DBURL_CLI="" NO_ADMIN=false
ADMIN_SET=false ADMIN_HINT=false
NO_FIREWALL=false FORCE_PG=false DRY_RUN=false
ENABLE_TLS=false SSL_EMAIL="" SSL_MODE="dns" DNS_CREDENTIALS=""
TLS_READY=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) need_value "$@"; DOMAIN="$2"; shift 2 ;;
    --repo) need_value "$@"; REPO_URL="$2"; shift 2 ;;
    --app-dir) need_value "$@"; APP_DIR="$2"; shift 2 ;;
    --port) need_value "$@"; PORT="$2"; shift 2 ;;
    --pg-password) need_value "$@"; PG_PASSWORD="$2"; shift 2 ;;
    --database-url) need_value "$@"; DBURL_CLI="$2"; shift 2 ;;
    --admin-phone) need_value "$@"; ADMIN_PHONE="$2"; shift 2 ;;
    --admin-password) need_value "$@"; ADMIN_PASSWORD="$2"; shift 2 ;;
    --no-admin) NO_ADMIN=true; shift ;;
    --no-firewall) NO_FIREWALL=true; shift ;;
    --with-postgres) FORCE_PG=true; shift ;;
    --tls) ENABLE_TLS=true; shift ;;
    --email) need_value "$@"; SSL_EMAIL="$2"; shift 2 ;;
    --ssl-mode) need_value "$@"; SSL_MODE="$2"; shift 2 ;;
    --dns-credentials) need_value "$@"; DNS_CREDENTIALS="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) awk 'NR>1 && /^#/ {sub(/^# ?/, ""); print; next} NR>1 {exit}' "$0"; exit 0 ;;
    *) die "گزینهٔ ناشناخته: $1 (--help را ببینید)" ;;
  esac
done

[[ -n "$DOMAIN" ]] || die "دامنه لازم است:  sudo bash deploy/bootstrap.sh --domain nobino.ir"
# HI-7: دامنه همان چیزی است که در .env نوشته می‌شود، پس پیش از هر جای‌گزینی
# نرمال و اعتبارسنجی می‌شود (پیش‌فرض install.sh هم همین برش است).
DOMAIN="${DOMAIN#*://}"; DOMAIN="${DOMAIN%%/*}"; DOMAIN="${DOMAIN%%:*}"
[[ "$DOMAIN" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || die "دامنه معتبر نیست: «$DOMAIN» — فقط حروف/عدد/نقطه/خط تیره (مثلاً nobino.ir)."
[[ "$PORT" =~ ^[0-9]+$ ]] && (( PORT >= 1024 && PORT <= 65535 )) || die "--port یک عدد بین 1024 و 65535 است (دادید: $PORT)."
case "$SSL_MODE" in dns|cloudflare|http) ;; *) die "--ssl-mode باید dns یا cloudflare یا http باشد (دادید: $SSL_MODE)." ;; esac
if $ENABLE_TLS && [[ "$SSL_MODE" == "cloudflare" && -z "$DNS_CREDENTIALS" ]]; then
  die "برای --tls --ssl-mode cloudflare باید --dns-credentials <مسیر فایل> هم بدهید."
fi
[[ "$(id -u)" == "0" ]] || die "با sudo اجرا کنید."
command -v apt-get >/dev/null 2>&1 || die "این اسکریپت برای Ubuntu/Debian (apt) است."
command -v systemctl >/dev/null 2>&1 || die "systemctl لازم است (روی LXC قدیمی/WSL ممکن نیست)."

# HI-8: بدون `|| true` پایانی — اگر هیچ‌یک از دو مسیر مقداری نساخت، تابع
# ناموفق برمی‌گردد و caller با die می‌ایستد (رمز خالی در .env مجاز نیست).
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
# در ایمیج‌های مینیمال ممکن است sudo نباشد — runuser (util-linux) جایگزین است
if command -v sudo >/dev/null 2>&1; then PGRUN="sudo -u postgres"; else PGRUN="runuser -u postgres --"; fi
[[ -z "$PG_PASSWORD" || "$PG_PASSWORD" =~ ^[A-Za-z0-9]+$ ]] || die "رمز --pg-password فقط می‌تواند حروف لاتین/عدد باشد (بدون علامت خاص)."

# ── ۱) کد پروژه در مسیر نصب ──────────────────────────────────────────
say "— ۱) آماده‌سازی کد در $APP_DIR —"
if [[ -f "$APP_DIR/package.json" && -f "$APP_DIR/deploy/install.sh" ]]; then
  ok "  مخزن از قبل در $APP_DIR است (همین‌جا استفاده می‌شود)"
elif [[ -n "$REPO_URL" ]]; then
  if [[ ! -d "$APP_DIR" ]]; then
    run git clone "$REPO_URL" "$APP_DIR"
  else
    warn "  $APP_DIR وجود دارد اما مخزن نیست؛ کلون نمی‌شود. مسیر را با --app-dir عوض کنید."
    die "  در $APP_DIR فایل package.json/deploy/install.sh نیست."
  fi
elif [[ -f "$REPO_DIR/deploy/install.sh" && "$REPO_DIR" != "$APP_DIR" ]]; then
  say "  --repo داده نشد؛ کپی مخزن جاری (این اسکریپت داخل مخزن است) به $APP_DIR"
  run mkdir -p "$APP_DIR"
  run rsync -a --exclude node_modules --exclude .pgdata --exclude .git --exclude backend/dist \
      --exclude frontend/dist --exclude public/uploads --exclude public/voice "$REPO_DIR/" "$APP_DIR/"
else
  die "  نه کدی در $APP_DIR هست و نه --repo داده‌اید. مخزن را به این مسیر ببرید (git clone یا scp/tar) و دوباره اجرا کنید."
fi
[[ -f "$APP_DIR/deploy/install.sh" ]] || { $DRY_RUN && warn "  (dry-run) deploy/install.sh در $APP_DIR نیست چون کپی/کلون اجرا نشد" || die "deploy/install.sh در $APP_DIR پیدا نشد."; }

# ── ۲) پیش‌نیازهای OS ───────────────────────────────────────────────
say "— ۲) پیش‌نیازهای سیستم (apt) —"
NEEDS=()
for pkg in curl ca-certificates gnupg git rsync openssl locales; do
  dpkg -s "$pkg" >/dev/null 2>&1 || NEEDS+=("$pkg")
done
if [[ ${#NEEDS[@]} -gt 0 ]]; then
  say "  نصب: ${NEEDS[*]}"
  run apt-get update -qq
  run env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${NEEDS[@]}"
else
  ok "  همهٔ پیش‌نیازها موجود است"
fi

# ── ۳) swap اگر رم پایین است ────────────────────────────────────────
MEM_MB="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || true)"; MEM_MB="${MEM_MB:-4096}"
if [[ "$MEM_MB" -lt 2048 ]] && ! swapon --show 2>/dev/null | grep -q '^/'; then
  say "— ۳) رم ${MEM_MB}MB → ساخت swapfile ۲ گیگ (برای پایداری بیلد) —"
  if [[ ! -f /swapfile ]]; then
    run fallocate -l 2G /swapfile || run dd if=/dev/zero of=/swapfile bs=1M count=2048
    run chmod 600 /swapfile
    run mkswap /swapfile
    run swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || runsh "echo '/swapfile none swap sw 0 0' >> /etc/fstab"
    ok "  swap فعال شد"
  else
    run swapon /swapfile || true
  fi
else
  say "— ۳) swap: نیاز نبود (رم ${MEM_MB}MB یا swap فعال) —"
fi

# ── ۴) Node.js + PM2 ────────────────────────────────────────────────
say "— ۴) Node.js و PM2 —"
node_major() { command -v node >/dev/null 2>&1 && node -v | sed 's/^v\([0-9]*\).*/\1/' || echo 0; }
if [[ "$(node_major)" -lt 20 ]]; then
  say "  Node $(node -v 2>/dev/null || echo 'ندارد') → نصب NodeSource 24"
  run curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup
  run bash /tmp/nodesource_setup
  run env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
fi
ok "  Node $(node -v)"
if ! command -v npm >/dev/null 2>&1; then die "  npm بعد از نصب Node پیدا نشد."; fi
if ! command -v pm2 >/dev/null 2>&1; then
  say "  نصب PM2"
  run npm install -g pm2@latest --no-audit --no-fund
fi
command -v openssl >/dev/null 2>&1 || die "openssl لازم است (ساخت رمز)."

# ── ۵) PostgreSQL ───────────────────────────────────────────────────
say "— ۵) PostgreSQL —"
PG_EXISTS=false
if pg_isready -q 2>/dev/null || systemctl is-active --quiet postgresql 2>/dev/null; then
  PG_EXISTS=true
fi
if $PG_EXISTS && ! $FORCE_PG; then
  ok "  Postgres از قبل اجراست؛ چیزی نصب/تغییر نمی‌کند."
  warn "  .env باید DATABASE_URL خودش را داشته باشد؛ bootstrap آن را نمی‌سازد (مگر --with-postgres)."
  PG_MODE="external"
else
  if ! $PG_EXISTS; then
    say "  نصب postgresql سروری"
    run apt-get install -y -qq postgresql postgresql-contrib
  fi
  run systemctl enable --now postgresql
  PG_MODE="local"
  [[ -n "$PG_PASSWORD" ]] || PG_PASSWORD="$(rand_pg)" || die "  رمز تصادفی دیتابیس ساخته نشد (/dev/urandom در دسترس نیست)؛ با --pg-password <رمز> بدهید."
  # یوزر/دیتابیس اختصاصی (idempotent — اگر هست، فقط رمز را ست نمی‌کند دوباره)
  runsh "$PGRUN psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='nobino'\" | grep -q 1 || $PGRUN psql -qc \"CREATE ROLE nobino LOGIN PASSWORD '$PG_PASSWORD'\""
  runsh "$PGRUN psql -tAc \"SELECT 1 FROM pg_database WHERE datname='nobino'\" | grep -q 1 || $PGRUN psql -qc \"CREATE DATABASE nobino OWNER nobino\""
  # listens محلی برای اتصال TCP از اپ (بدون تغییر دیگر تنظیمات)
  # مسیر conf را واقعی پیدا می‌کنیم (Ubuntu: /etc/postgresql/<ver>/main؛ Debian: /etc/postgresql/<ver>/main؛ RHEL-family: /var/lib/pgsql)
  PGCONF=""
  for c in /etc/postgresql/*/main/postgresql.conf /usr/etc/postgresql/main/postgresql.conf /etc/postgresql/1*/main/postgresql.conf /var/lib/pgsql/data/postgresql.conf /etc/postgresql/9*/main/postgresql.conf; do
    [[ -f "$c" ]] && { PGCONF="$c"; break; }
  done
  # اگر هیچ conf پیدا نشد، از خودِ Postgres می‌پرسیم (اجرا به‌عنوان یوزر postgres)
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
    PGPASSWORD="$PG_PASSWORD" psql "host=127.0.0.1 user=nobino dbname=nobino" -tAc "select 'db-ok'" | grep -q db-ok || die "اتصال nobino به دیتابیس برقرار نشد؛ pg_hba را بررسی کنید."
  fi
  ok "  دیتابیس «nobino» با یوزر «nobino» آماده است"
fi

# ── ۶) ساخت خودکار .env ─────────────────────────────────────────────
say "— ۶) فایل .env —"
ENVF="$APP_DIR/.env"
if [[ -f "$ENVF" ]]; then
  ok "  .env از قبل وجود دارد؛ دست نمی‌زنیم."
else
  [[ -f "$APP_DIR/deploy/env.production.example" ]] || die "  قالب env.production.example نیست."
  # HI-8: اگر ساخت رمز تصادفی نشد، باید ایستاد — وگرنه .env با JWT_SECRET=""
  # نوشته می‌شود، گیت CHANGE_ME رد می‌شود و سرویس در boot کرش‌لوپ می‌گیرد.
  JWT="$(rand_secret)" || die "  JWT تصادفی ساخته نشد (openssl و /dev/urandom هر دو ناموفق)؛ .env را دستی بسازید."
  CS="$(rand_secret)"  || die "  CRON_SECRET تصادفی ساخته نشد؛ .env را دستی بسازید."
  if [[ "$PG_MODE" == "local" ]]; then
    DBURL="postgresql://nobino:${PG_PASSWORD}@localhost:5432/nobino?schema=public"
  elif [[ -n "$DBURL_CLI" ]]; then
    DBURL="$DBURL_CLI"
  elif $DRY_RUN; then
    # HI-6: dry-run هرگز نباید منتظر ورودی بماند (CI و `curl | bash` stdin
    # غیرتعاملی دارند)؛ نشانی نمایشی کافی است چون چیزی نوشته نمی‌شود.
    DBURL="postgresql://USER:PASS@localhost:5432/nobino"
    warn "  dry-run: برای دیدن نشانی واقعی در نقشه، --database-url بدهید."
  else
    printf '  DATABASE_URL موجود این سرور را وارد کنید: '
    read -r DBURL_IN || true
    DBURL="${DBURL_IN:-}"
    [[ -n "$DBURL" ]] || die "  برای Postgres موجود سرور باید DATABASE_URL داده شود (--database-url یا --with-postgres برای ساخت یوزر/دیتابیس nobino)."
  fi
  case "$DBURL" in postgresql*://*) ;; *) die "  DATABASE_URL باید با postgresql:// شروع شود: «${DBURL:0:24}…»" ;; esac
  [[ "$DBURL" != *'"'* ]] || die "  DATABASE_URL نمی‌تواند کاراکتر نقل‌قول («) داشته باشد؛ مقدار در .env داخل کووت نوشته می‌شود."
  if [[ "$PG_MODE" != "local" ]]; then
    say "  (Postgres همین سرور: POSTGRES_PASSWORD در .env خالی می‌ماند — فقط docker-compose به آن نیاز دارد.)"
  fi

  # HI-7: خط‌به‌خط و بر پایهٔ کلید جای‌گزینی می‌شود — نه sed (که `&` و `|` و `\`
  # در مقدار معنای ویژه دارند) و نه `${line//توکن/مقدار}` (که در bash ≥5.2 همان
  # کار `&` را می‌کند). هر کلید، مقدار خودشان را کامل می‌نویسد، پس هیچ کاراکتری
  # از دامنه/نشانی نمی‌تواند خط را خراب کند. نوشتن هم اتمی است: فایل کامل در
  # .env.new ساخته و بعد mv می‌شود؛ اگر چیزی می‌شکست .env نیمه‌کاره (یا صفر
  # بایت) باقی نمی‌ماند که اجرای بعدی بگوید «.env هست، دست نمی‌زنیم».
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
        PAYMENT_CALLBACK_BASE) line="PAYMENT_CALLBACK_BASE=\"https://$DOMAIN/api/payments/callback\"" ;;
        PORT)   line="PORT=$PORT" ;;
        SMS_PROVIDER | VOICE_PROVIDER) line="$key=\"mock\"" ;;
      esac
      printf '%s\n' "$line"
    done <"$src" >"$dst"
  }

  if $DRY_RUN; then
    printf '%s[dry] generate .env از قالب example (domain=%s, port=%s, رمزهای تصادفی, DATABASE_URL از %s)%s\n' \
      "$C_DIM" "$DOMAIN" "$PORT" "$([[ "$PG_MODE" == "local" ]] && echo "postgres محلی" || echo "--database-url/پرسش")" "$C_OFF"
  else
    ENV_TMP="$(mktemp "$APP_DIR/.env.new.XXXXXX")"
    if gen_env "$APP_DIR/deploy/env.production.example" "$ENV_TMP"; then
      chmod 600 "$ENV_TMP"
      mv -f "$ENV_TMP" "$ENVF"
      grep -q "CHANGE_ME" "$ENVF" && die "  هنوز CHANGE_ME در .env هست — الگوی env.example عوض شده؛ دستی پر کنید."
      ok "  .env ساخته شد (رمزهای تصادفی، دامنهٔ $DOMAIN، پورت $PORT) — مجوز 600"
    else
      rm -f "$ENV_TMP"
      die "  ساخت .env ناتمام ماند؛ $ENVF نوشته نشد (دلیلی نبود که اجرای بعدی آن را «موجود» حساب کند)."
    fi
  fi
fi
# SMS/پرداخت/STT عمداً خالی می‌مانند؛ بعداً از پنل سوپرادمین پر می‌شوند.

# ── ۷) فایروال ──────────────────────────────────────────────────────
say "— ۷) فایروال —"
if $NO_FIREWALL || ! command -v ufw >/dev/null 2>&1; then
  say "  بدون تغییر فایروال (ufw نصب نیست یا --no-firewall)"
else
  SSH_PORT="$(sshd -T 2>/dev/null | awk '$1=="port"{print $2; exit}' || true)"; SSH_PORT="${SSH_PORT:-22}"
  run ufw allow "$SSH_PORT"/tcp comment 'nobino-bootstrap-ssh'
  run ufw allow 80/tcp
  run ufw allow 443/tcp
  run ufw allow 8443/tcp
  if ! $DRY_RUN && ! ufw status | grep -qi "Status: active"; then
    say "  فعال‌سازی ufw (قاعدهٔ پیش‌فرض deny incoming)"
    runsh "yes | ufw --force enable"
  fi
  ok "  پورت‌های $SSH_PORT/80/443/8443 باز، بقیه پشت ufw"
fi

# ── ۸) install.sh کامل ──────────────────────────────────────────────
say "— ۸) اجرای deploy/install.sh (بیلد + PM2 + nginx + سلامت) —"
INSTALL_ARGS=(--domain "$DOMAIN" --port "$PORT" --app-dir "$APP_DIR")
$DRY_RUN && INSTALL_ARGS+=(--dry-run)
run bash "$APP_DIR/deploy/install.sh" "${INSTALL_ARGS[@]}"

# ── ۸.۵) SSL / HTTPS ────────────────────────────────────────────────
if $ENABLE_TLS; then
  say "— ۸.۵) دریافت گواهی SSL و فعال‌سازی HTTPS —"
  if [[ -z "$SSL_EMAIL" ]]; then
    warn "  --email داده نشده؛ ادامه می‌دهیم ولی هشدار انقضای گواهی به شما نمی‌رسد."
  fi
  SSL_ARGS=(--domain "$DOMAIN" --app-dir "$APP_DIR" --mode "$SSL_MODE")
  [[ -n "$SSL_EMAIL" ]] && SSL_ARGS+=(--email "$SSL_EMAIL")
  [[ -n "$DNS_CREDENTIALS" ]] && SSL_ARGS+=(--dns-credentials "$DNS_CREDENTIALS")
  $DRY_RUN && SSL_ARGS+=(--dry-run)
  if bash "$APP_DIR/deploy/ssl.sh" "${SSL_ARGS[@]}"; then
    TLS_READY=true
  else
    warn "  دریافت SSL ناموفق بود؛ سایت روی HTTP بالا است."
    warn "  بعداً در ترمینال: sudo bash $APP_DIR/deploy/ssl.sh --domain $DOMAIN --email <ایمیل>"
  fi
fi

# ── ۹) اولین سوپرادمین ──────────────────────────────────────────────
# بعد از install.sh اجرا می‌شود چون node_modules + Prisma client + schema
# دیتابیس را همان مرحله می‌سازد. اگر ADMIN دیگری باشد، idempotent است.
say "— ۹) ساخت اولین سوپرادمین —"
if $NO_ADMIN; then
  say "  --no-admin → از این مرحله رد می‌شود."
elif $DRY_RUN; then
  printf '%s[dry] node scripts/create-admin.mjs با ADMIN_PHONE/ADMIN_PASSWORD از محیط%s\n' "$C_DIM" "$C_OFF"
else
  AP="$ADMIN_PHONE"; AW="$ADMIN_PASSWORD"
  if [[ -z "$AP" ]] && [[ -t 0 ]]; then
    printf '  شماره موبایل سوپرادمین (۱۱ رقم با 0؛ خالی = بعداً دستی): '
    read -r AP || true
  fi
  if [[ -n "$AP" ]] && [[ -z "$AW" ]] && [[ -t 0 ]]; then
    printf '  رمز سوپرادمین (حداقل ۸ کاراکتر، نمایش مخفی): '
    read -rs AW || true; printf '\n'
  fi
  AP="$(tr -d ' \r' <<< "$AP")"
  if [[ -z "$AP" ]]; then
    ADMIN_HINT=true
    warn "  سوپرادمین ساخته نشد؛ هر وقت خواستید اجرا کنید:"
    say "    cd $APP_DIR && ADMIN_PHONE=09xxxxxxxxx ADMIN_PASSWORD='…' node scripts/create-admin.mjs"
  elif [[ ${#AW} -lt 8 ]]; then
    ADMIN_HINT=true
    warn "  رمز داده‌نشده/کوتاه است — مرحلهٔ سوپرادمین رد شد. بعداً: node scripts/create-admin.mjs (داخل $APP_DIR)"
  else
    # در سرورهای SSHِ غیرتعاملی (exec بدون TTY) read کار نمی‌کند؛ flag لازم است.
    # HG-2: اعتبارنامه‌ها از محیط می‌روند، نه argv — در `ps` و تاریخچهٔ shell نمی‌مانند.
    if (cd "$APP_DIR" && APP_DIR="$APP_DIR" ADMIN_PHONE="$AP" ADMIN_PASSWORD="$AW" node scripts/create-admin.mjs); then
      ok "  ورود مدیران: https://$DOMAIN با $AP"
      ADMIN_SET=true
    else
      ADMIN_HINT=true
      warn "  create-admin ناموفق بود (دیتابیس/پریزما را بررسی کنید)؛ بعداً دستی اجرا کنید."
    fi
  fi
  unset AW
fi

say ""
ok "${C_OK}bootstrap تمام شد.${C_OFF}"
if $TLS_READY; then SCHEME="https"; else SCHEME="http"; fi
say "  دامنه:   $SCHEME://$DOMAIN  (ساب‌دامین سالن‌ها: <slug>.$DOMAIN)"
say "  وضعیت:   pm2 status — لاگ: pm2 logs nobino-api"
say "  سلامت:   curl \"http://127.0.0.1:$PORT/api/health?db=1\""
say "  .env:    $APP_DIR/.env (رمزها همین‌جا؛ اگر PG تازه ساخت شد، رمز دیتابیس در DATABASE_URL است)"
if $ADMIN_SET; then
  say "  ورود مدیران: $SCHEME://$DOMAIN با $AP (رمزی که دادید)"
elif $ADMIN_HINT; then
  say "  ورود مدیران: هنوز سوپرادمین ندارید — cd $APP_DIR && ADMIN_PHONE=09xxxxxxxxx ADMIN_PASSWORD='…' node scripts/create-admin.mjs"
fi
say ""
say "  باقی‌ماندهٔ دستی (اختیاری):"
say "    ۱) DNS: A برای $DOMAIN و *.${DOMAIN} به IP همین سرور"
if $TLS_READY; then
  say "    ۲) HTTPS فعال شد. بررسی تمدید: sudo certbot renew --dry-run"
  say "        (برای تمدید خودکار wildcard از --ssl-mode cloudflare استفاده کنید.)"
else
  say "    ۲) HTTPS: sudo bash $APP_DIR/deploy/ssl.sh --domain $DOMAIN --email <ایمیل>"
  say "        حالت‌ها: dns (wildcard تعاملی) | cloudflare (خودکار) | http (فقط دامنهٔ ریشه)"
fi
say "    ۳) پنل سوپرادمین: /api/health را چک، سپس در «تنظیمات سیستم» درگاه پرداخت/پیامک/کلیدها را کامل کنید"
say "        (SMS، پرداخت و صدای هوشمند عمداً خالی‌اند تا نصب بدون کلید هم بالا بیاید.)"
say "    ۴) به‌روزرسانی بعدی: sudo bash deploy/update.sh"
