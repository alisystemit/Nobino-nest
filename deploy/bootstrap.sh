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
#   ۸) ساخت اولین سوپرادمین با موبایل/رمز دلخواه (اگر دیتابیس خالی باشد؛
#      با --admin-phone/--admin-password بدون پرسش، یا در پایان خودکار می‌پرسد)
#
# گزینه‌ها:
#   --domain <دامنه>      ضروری (مثلاً nobino.ir) — دامنه‌ای که سرویس رویش بالا می‌آید
#   --repo <git-url>      آدرس git مخزن؛ اگر مخزن این اسکریپت نیست کلون می‌شود
#   --app-dir <مسیر>      مسیر نصب (پیش‌فرض /opt/nobino؛ اگر مخزن جاری همان جا نیست کلون/کپی می‌شود)
#   --port <پورت>         پورت داخلی (پیش‌فرض 3100)
#   --pg-password <رمز>   رمز یوزر دیتابیس (پیش‌فرض: تصادفی؛ در .env و پیام پایانی می‌بینید)
#   --admin-phone <موبایل>   شمارهٔ سوپرادمین اولیه (هم‌شکل ورود مدیران، ۱۱ رقم با 0)
#   --admin-password <رمز>   رمز سوپرادمین اولیه (حداقل ۸ کاراکتر)
#   --no-admin            ساخت سوپرادمین را انجام نده (بعداً دستی: scripts/create-admin.mjs)
#   --no-firewall         ufw را لمس نکن
#   --with-postgres       حتی اگر Postgres هست، یوزر/دیتابیس nobino بساز (بدون نصب دوباره)
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

DOMAIN="" REPO_URL="" APP_DIR="/opt/nobino" PORT="3100" PG_PASSWORD=""
ADMIN_PHONE="" ADMIN_PASSWORD="" NO_ADMIN=false
ADMIN_SET=false ADMIN_HINT=false
NO_FIREWALL=false FORCE_PG=false DRY_RUN=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --repo) REPO_URL="$2"; shift 2 ;;
    --app-dir) APP_DIR="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --pg-password) PG_PASSWORD="$2"; shift 2 ;;
    --admin-phone) ADMIN_PHONE="$2"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
    --no-admin) NO_ADMIN=true; shift ;;
    --no-firewall) NO_FIREWALL=true; shift ;;
    --with-postgres) FORCE_PG=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) sed -n '1,40p' "$0"; exit 0 ;;
    *) die "گزینهٔ ناشناخته: $1 (--help را ببینید)" ;;
  esac
done

[[ -n "$DOMAIN" ]] || die "دامنه لازم است:  sudo bash deploy/bootstrap.sh --domain nobino.ir"
[[ "$(id -u)" == "0" ]] || die "با sudo اجرا کنید."
command -v apt-get >/dev/null 2>&1 || die "این اسکریپت برای Ubuntu/Debian (apt) است."
command -v systemctl >/dev/null 2>&1 || die "systemctl لازم است (روی LXC قدیمی/WSL ممکن نیست)."

rand_secret() { openssl rand -hex 32 2>/dev/null || { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; } || true; }
# توجه: pipefail + head روی /dev/urandom سیگنال SIGPIPE به tr می‌دهد؛ `|| true` لازم است
rand_pg()     { { tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 24; } || true; }
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
  [[ -n "$PG_PASSWORD" ]] || PG_PASSWORD="$(rand_pg)"
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
  JWT="$(rand_secret)"; CS="$(rand_secret)"
  if [[ "$PG_MODE" == "local" ]]; then
    DBURL="postgresql://nobino:${PG_PASSWORD}@localhost:5432/nobino?schema=public"
  else
    printf '  DATABASE_URL موجود این سرور را وارد کنید: '
    read -r DBURL_IN || true
    DBURL="${DBURL_IN:-}"
    [[ -n "$DBURL" ]] || die "  برای Postgres موجود سرور باید DATABASE_URL داده شود (یا --with-postgres برای ساخت یوزر/دیتابیس nobino)."
  fi
  if $DRY_RUN; then
    printf '%s[dry] generate .env from example (domain=%s, secrets=random)%s\n' "$C_DIM" "$DOMAIN" "$C_OFF"
  else
    sed -e "s|CHANGE_ME_openssl_rand_base64_32|$JWT|" \
        -e "s|CHANGE_ME_another_random_secret|$CS|" \
        -e "s|CHANGE_ME_strong_password|$PG_PASSWORD|" \
        -e "s|^DATABASE_URL=.*|DATABASE_URL=\"$DBURL\"|" \
        -e "s|^APP_URL=.*|APP_URL=\"https://$DOMAIN\"|" \
        -e "s|^SITE_URL=.*|SITE_URL=\"https://$DOMAIN\"|" \
        -e "s|^ROOT_DOMAIN=.*|ROOT_DOMAIN=\"$DOMAIN\"|" \
        -e "s|^AUTOMATION_BASE_URL=.*|AUTOMATION_BASE_URL=\"https://$DOMAIN\"|" \
        -e "s|^PAYMENT_CALLBACK_BASE=.*|PAYMENT_CALLBACK_BASE=\"https://$DOMAIN/api/payments/callback\"|" \
        -e "s|^VITE_ROOT_DOMAIN=.*|VITE_ROOT_DOMAIN=\"$DOMAIN\"|" \
        -e "s|^VITE_SITE_URL=.*|VITE_SITE_URL=\"https://$DOMAIN\"|" \
        -e "s|^VITE_APP_URL=.*|VITE_APP_URL=\"https://$DOMAIN\"|" \
        -e "s|^PORT=.*|PORT=$PORT|" \
        -e "s|^SMS_PROVIDER=.*|SMS_PROVIDER=\"mock\"|" \
        -e "s|^VOICE_PROVIDER=.*|VOICE_PROVIDER=\"mock\"|" \
        "$APP_DIR/deploy/env.production.example" > "$ENVF"
    chmod 600 "$ENVF"
    grep -q "CHANGE_ME" "$ENVF" && die "  هنوز CHANGE_ME در .env هست — الگوی env.example عوض شده؛ دستی پر کنید."
    ok "  .env ساخته شد (رمزهای تصادفی، دامنهٔ $DOMAIN، پورت $PORT) — مجوز 600"
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

# ── ۹) اولین سوپرادمین ──────────────────────────────────────────────
# بعد از install.sh اجرا می‌شود چون node_modules + Prisma client + schema
# دیتابیس را همان مرحله می‌سازد. اگر ADMIN دیگری باشد، idempotent است.
say "— ۹) ساخت اولین سوپرادمین —"
if $NO_ADMIN; then
  say "  --no-admin → از این مرحله رد می‌شود."
elif $DRY_RUN; then
  printf '%s[dry] node scripts/create-admin.mjs --phone <موبایل> --password <رمز>%s\n' "$C_DIM" "$C_OFF"
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
    say "    cd $APP_DIR && node scripts/create-admin.mjs --phone 09xxxxxxxxx --password '…'"
  elif [[ ${#AW} -lt 8 ]]; then
    ADMIN_HINT=true
    warn "  رمز داده‌نشده/کوتاه است — مرحلهٔ سوپرادمین رد شد. بعداً: node scripts/create-admin.mjs (داخل $APP_DIR)"
  else
    # در سرورهای SSHِ غیرتعاملی (exec بدون TTY) read کار نمی‌کند؛ flag لازم است.
    if (cd "$APP_DIR" && APP_DIR="$APP_DIR" node scripts/create-admin.mjs --phone "$AP" --password "$AW"); then
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
say "  دامنه:   https://$DOMAIN  (ساب‌دامین سالن‌ها: <slug>.$DOMAIN)"
say "  وضعیت:   pm2 status — لاگ: pm2 logs nobino-api"
say "  سلامت:   curl \"http://127.0.0.1:$PORT/api/health?db=1\""
say "  .env:    $APP_DIR/.env (رمزها همین‌جا؛ اگر PG تازه ساخت شد، رمز دیتابیس در DATABASE_URL است)"
if $ADMIN_SET; then
  say "  ورود مدیران: https://$DOMAIN با $AP (رمزی که دادید)"
elif $ADMIN_HINT; then
  say "  ورود مدیران: هنوز سوپرادمین ندارید — cd $APP_DIR && node scripts/create-admin.mjs --phone 09xxxxxxxxx --password '…'"
fi
say ""
say "  باقی‌ماندهٔ دستی (اختیاری):"
say "    ۱) DNS: A برای $DOMAIN و *.${DOMAIN} به IP همین سرور"
say "    ۲) HTTPS: sudo apt-get install -y certbot python3-certbot-nginx &&"
say "        sudo certbot certonly --manual --preferred-challenges dns -d $DOMAIN -d '*.$DOMAIN' &&"
say "        sudo bash deploy/install.sh --domain $DOMAIN --tls"
say "    ۳) پنل سوپرادمین: /api/health را چک، سپس در «تنظیمات سیستم» درگاه پرداخت/پیامک/کلیدها را کامل کنید"
say "        (SMS، پرداخت و صدای هوشمند عمداً خالی‌اند تا نصب بدون کلید هم بالا بیاید.)"
say "    ۴) به‌روزرسانی بعدی: sudo bash deploy/update.sh"
