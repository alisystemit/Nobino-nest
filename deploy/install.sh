#!/usr/bin/env bash
# =====================================================================
# Nobino (نسخهٔ NestJS) — نصب‌کنندهٔ تک‌فرمان روی سرور Ubuntu/Debian
#
#   sudo bash deploy/install.sh --domain nobino.ir
#
# چه کار می‌کند (به ترتیب):
#   ۱) پیش‌بررسی: روت/سودو، فایل .env، DATABASE_URL معتبر
#   ۲) نصب فقط وابستگی‌های واقعی: Node.js ≥ 20، nginx، PM2 (اگر نباشند)
#      — به PHP، MySQL/MariaDB، دامنه‌ها یا اعتبارنامهٔ دیتابیس‌های موجود دست نمی‌زند
#   ۳) npm ci + prisma generate + بیلد بک‌اند و SPA (scripts/build-release.mjs)
#   ۴) آماده‌سازی schema دیتابیس (DB_SETUP=auto→migrate deploy؛ push→db push؛ skip→دست نمی‌زند)
#   ۵) سرویس PM2 + autostart
#   ۶) vhost اِج‌انجی‌اِکس با ساب‌دامین‌های وایلدکارد (mah.nobino.ir و ...)
#
# گزینه‌ها:
#   --domain <دامنه-ریشه>   دامنهٔ اصلی؛ برای چند دامنه (alias) چند بار بدهید یا
#                           با کاما جدا کنید (پیش‌فرض: ROOT_DOMAIN و EXTRA_DOMAINS در .env)
#   --port <پورت>           پورت داخلی API/SPA (پیش‌فرض: 3100)
#   --app-dir <مسیر>        مسیر نصب (پیش‌فرض: همین مخزن)
#   --copy                  کپی مخزن به --app-dir قبل از بیلد
#   --user <کاربر>          کاربر سرویس PM2 برای autostart (پیش‌فرض: root)
#   --skip-build            بیلد را انجام نده (فقط سرویس و nginx)
#   --skip-nginx            vhost نساز
#   --tls                   اگر گواهی SSL آماده است، بلوک HTTPS را فعال کن
#   --demo-seed             دیموی توسعه بذر بزن (فقط سرور خالی)
#   --dry-run               فرمان‌های تغییردهنده را فقط چاپ کند
#
# چیزی به بیرون ارسال نمی‌شود؛ همهٔ تغییرات روی همین سرور می‌ماند.
# =====================================================================
set -euo pipefail

C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✅ %s%s\n' "$C_OK" "$*" "$C_OFF"; }
warn() { printf '%s⚠️  %s%s\n' "$C_WARN" "$*" "$C_OFF"; }
die()  { printf '%s❌ %s%s\n' "$C_ERR" "$*" "$C_OFF" >&2; exit 1; }

# اجرای فرمانِ تغییردهنده (در --dry-run فقط چاپ می‌شود)
run()  { if $DRY_RUN; then printf '%s[dry] %s%s\n' "$C_DIM" "$*" "$C_OFF"; else "$@"; fi; }

# ME-8: شکست آماده‌سازی schema فقط هشدار نیست — نصب با دیتابیس نیمه‌آماده در اولین
# کوئری می‌میرد. در dry-run هیچ فرمانی اجرا نمی‌شود (run صفر برمی‌گرداند) پس نمی‌تواند بمیرد.
db_setup_or_die() {
  local label="$1"; shift
  if ! run "$@"; then
    warn "  $label ناموفق بود. اگر پریزما روی حذف ستون/جدول اخطار داده، اول بکاپ بگیرید و آگاهانه دستی اجرا کنید:"
    warn "    $* --accept-data-loss"
    die "  بدون schema سالم نصب کامل نمی‌شود (برای رد شدن از این مرحله: DB_SETUP=skip)."
  fi
}

# گزینهٔ مقداردار بدون مقدار نباید با «$2: unbound variable» بمیرد (ME-5).
need_value() { [[ $# -ge 2 ]] || die "$1 به یک مقدار نیاز دارد (مثلاً $1 <مقدار>)"; }

# مقدار را برای سمتِ راست sed فرار می‌کند: \  &  و جداکنندهٔ | (HI-7 از همین خانواده).
sed_esc() { local s="${1:-}"; s="${s//\\/\\\\}"; s="${s//&/\\&}"; s="${s//|/\\|}"; printf '%s' "$s"; }

# دامنه را نرمال می‌کند (پروتکل/مسیر/پورت/فاصله را می‌گیرد) و به فهرست اضافه می‌کند.
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

# ── مقادیر پیش‌فرض ─────────────────────────────────────────────────
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
    *) die "گزینهٔ ناشناخته: $1 (با --help لیست گزینه‌ها را ببینید)" ;;
  esac
done

# ── ۰) پیش‌بررسی ───────────────────────────────────────────────────
[[ -f "$REPO_DIR/package.json" ]] || die "این اسکریپت باید داخل مخزن Nobino-nest اجرا شود."
[[ "$(id -u)" == "0" ]] || die "با sudo اجرا کنید:  sudo bash deploy/install.sh --domain nobino.ir"
command -v apt-get >/dev/null 2>&1 || die "این نصب‌کننده برای Ubuntu/Debian (apt) نوشته شده است."

ENV_FILE="$APP_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  [[ -f "$REPO_DIR/.env" ]] && ENV_FILE="$REPO_DIR/.env"
fi
[[ -f "$ENV_FILE" ]] || die "فایل .env نیست. از روى deploy/env.production.example یک .env بسازید و DATABASE_URL، JWT_SECRET و دامنه را پر کنید."

# خواندن مقدار یک کلید از .env (بدون نقل‌قول و CR، با پشتیبانی از مقدار دارای =)
# نکته: awk در gsub بازگشت \`\\1\` را پشتیبانی نمی‌کند؛ پس نقل‌قول باز/بسته
# جداگانه حذف می‌شود (الگوی همسان update.sh).
read_env() {
  awk -v k="$1" 'BEGIN{FS="="} $1==k { v=substr($0, index($0,"=")+1); gsub(/\r$/,"",v); gsub(/^"/,"",v); gsub(/"$/,"",v); print v }' "$ENV_FILE" | tail -1
}

DB_URL="$(read_env DATABASE_URL)"; [[ -z "$DB_URL" ]] && DB_URL="${DATABASE_URL:-}"
[[ -n "$DB_URL" ]] || die "DATABASE_URL در .env خالی است."
case "$DB_URL" in postgresql*://*) ;; *) die "DATABASE_URL باید با postgresql:// شروع شود." ;; esac

# ── دامنه‌ها: --domain می‌تواند چند بار بیاید؛ دامنهٔ اول اصلی است ──
ENV_ROOT="$(norm_domain "$(read_env ROOT_DOMAIN)")"
ENV_EXTRA="$(read_env EXTRA_DOMAINS)"
if [[ ${#DOMAINS[@]} -eq 0 ]]; then
  [[ -n "$ENV_ROOT" ]] && add_domains "$ENV_ROOT"
  [[ ${#DOMAINS[@]} -eq 0 ]] && add_domains "$(read_env SITE_URL)"
  add_domains "$ENV_EXTRA"
elif [[ -n "$ENV_ROOT" && "${DOMAINS[0]}" == "$ENV_ROOT" ]]; then
  # دامنهٔ alias ذخیره‌شده در .env برای بازسازی vhost (مثلاً ssl.sh/update) حفظ شود
  add_domains "$ENV_EXTRA"
fi
[[ ${#DOMAINS[@]} -gt 0 ]] || die "دامنهٔ ریشه را با --domain بدهید (مثلاً --domain nobino.ir)"
for d in "${DOMAINS[@]}"; do
  [[ "$d" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || die "دامنه معتبر نیست: «$d»."
done
DOMAIN="${DOMAINS[0]}"
DOMAIN_ALIASES=()
[[ ${#DOMAINS[@]} -gt 1 ]] && DOMAIN_ALIASES=("${DOMAINS[@]:1}")
# nginx: دامنهٔ ریشه + wildcard ساب‌دامین‌های سالن + دامنه‌های alias (بدون wildcard)
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

ok "پیش‌بررسی: دامنه‌ها=${DOMAINS[*]}  پورت=${PORT}  مسیر=${APP_DIR}  .env=${ENV_FILE}"

# ── ۰.۱) بررسی امنیتی .env (بک‌اند همین بررسی‌ها را در بوت production هم دارد) ──
JWT_SECRET_VAL="$(read_env JWT_SECRET)"; [[ -z "$JWT_SECRET_VAL" ]] && JWT_SECRET_VAL="${JWT_SECRET:-}"
case "$JWT_SECRET_VAL" in
  ""|dev-secret-change-me|super-secret-key)
    die "JWT_SECRET در .env مقدار پیش‌فرض/خالی دارد. با «openssl rand -hex 32» یک رمز بسازید و در .env بگذارید." ;;
esac
[[ ${#JWT_SECRET_VAL} -ge 32 ]] || die "JWT_SECRET باید حداقل ۳۲ کاراکتر باشد (قدیمیش: ${#JWT_SECRET_VAL})."

PLACEHOLDERS="$(grep -n "CHANGE_ME" "$ENV_FILE" 2>/dev/null || true)"
if [[ -n "$PLACEHOLDERS" ]]; then
  say "⚠ placeholderهای CHANGE_ME در .env باقی مانده‌اند:"
  printf '%s\n' "$PLACEHOLDERS" | sed 's/^/    /'
  die "مقادیر CHANGE_ME را کامل کنید و دوباره اجرا کنید."
fi

PAYMENT_SANDBOX_VAL="$(read_env PAYMENT_SANDBOX)"
if [[ "${PAYMENT_SANDBOX_VAL,,}" == "true" ]]; then
  say "⚠ PAYMENT_SANDBOX=true — پرداخت‌ها شبیه‌سازی می‌شوند؛ برای محیط واقعی آن را false یا خالی بگذارید."
fi
if [[ "$SITE_URL" == *localhost* || "$SITE_URL" == *127.0.0.1* ]]; then
  say "⚠ SITE_URL به آدرس لوکال اشاره می‌کند (${SITE_URL}) — sitemap و لینک‌های پیامک غلط خواهند بود."
fi
if [[ -z "$(read_env CRON_SECRET)" ]]; then
  say "⚠ CRON_SECRET تنظیم نشده؛ کران‌های داخلی (یادآوری/تسویه/نگهدارندهٔ قفل) اجرا نمی‌شوند."
fi

# ── ۱) وابستگی‌های سیستم (فقط آنچه لازم است) ──────────────────────
say "— بررسی وابستگی‌های سیستم —"
NEEDS=()
for pkg in curl ca-certificates gnupg git rsync; do
  dpkg -s "$pkg" >/dev/null 2>&1 || NEEDS+=("$pkg")
done
if [[ ${#NEEDS[@]} -gt 0 ]]; then
  say "  نصب: ${NEEDS[*]}"
  run apt-get update -qq
  run env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${NEEDS[@]}"
fi

node_major() { command -v node >/dev/null 2>&1 && node -v | sed 's/^v\([0-9]*\).*/\1/' || echo 0; }
if [[ "$(node_major)" -lt 20 ]]; then
  say "  Node $(node -v 2>/dev/null || echo 'ندارد') قدیمی/نصب‌نشده است → NodeSource 24"
  run curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup
  run bash /tmp/nodesource_setup
  run apt-get install -y -qq nodejs
else
  ok "  Node $(node -v) مناسب است"
fi

if ! command -v nginx >/dev/null 2>&1; then
  say "  نصب nginx"
  run apt-get install -y -qq nginx
fi
if ! command -v pm2 >/dev/null 2>&1; then
  say "  نصب PM2"
  run npm install -g pm2@latest --no-audit --no-fund
fi
if ! command -v curl >/dev/null 2>&1; then
  die "curl لازم است (برای بررسی سلامت)"
fi
# PHP / MySQL / MariaDB و اپ‌های دیگر این سرور هرگز دست نمی‌خورند
[[ -e /var/www/html ]] && warn "  /var/www/html موجود است؛ دست‌نخورده می‌ماند (vhost نوبینو جداست)"

# ── ۲) کپی مخزن به مسیر نصب (اختیاری) ─────────────────────────────
if $DO_COPY && [[ "$APP_DIR" != "$REPO_DIR" ]]; then
  say "— کپی مخزن به ${APP_DIR} —"
  run mkdir -p "$APP_DIR"
  run rsync -a --exclude node_modules --exclude .pgdata --exclude .git \
      --exclude backend/dist --exclude frontend/dist --exclude public/uploads \
      "$REPO_DIR/" "$APP_DIR/"
  run cp -f "$ENV_FILE" "$APP_DIR/.env"
  ENV_FILE="$APP_DIR/.env"
fi

# ── ۳) نصب وابستگی‌ها و بیلد ───────────────────────────────────────
if ! $SKIP_BUILD; then
  say "— نصب وابستگی‌ها (npm ci) —"
  for dir in "" "backend" "frontend"; do
    cwd="$APP_DIR"; [[ -n "$dir" ]] && cwd="$APP_DIR/$dir"
    if [[ -f "$cwd/package-lock.json" ]]; then
      run sh -c "cd '$cwd' && npm ci --no-audit --no-fund"
    else
      run sh -c "cd '$cwd' && npm install --no-audit --no-fund"
    fi
  done

  PRISMA_CLI="$APP_DIR/node_modules/prisma/build/index.js"
  [[ -f "$PRISMA_CLI" ]] || die "CLI پریزما پیدا نشد؛ npm ci موفق نبود؟"
  say "— Prisma generate —"
  run node "$PRISMA_CLI" generate --schema "$APP_DIR/prisma/schema.prisma"

  say "— بیلد release (بک‌اند + SPA) —"
  run node "$APP_DIR/scripts/build-release.mjs" --skip-install --no-smoke
else
  warn "بیلد رد شد (--skip-build)"
fi
# در --dry-run هیچ بیلدی انجام نشده و dist/ هم در گیت نیست؛ پس این بررسی فقط
# مسیر واقعی را می‌سنجد (HI-5: پیش‌تر dry-run همیشه همین‌جا می‌مرد و ابزار
# «پیش‌آزمون روی سرور خام» عملاً بی‌استفاده بود).
if $DRY_RUN; then
  warn "dry-run: وجود backend/dist و frontend/dist بررسی نشد (بیلدی انجام نشده)."
else
  [[ -f "$APP_DIR/backend/dist/main.js" ]] || die "backend/dist/main.js نیست؛ بدون --skip-build اجرا کنید."
  [[ -f "$APP_DIR/frontend/dist/index.html" ]] || die "frontend/dist/index.html نیست؛ بیلد فرانت انجام نشده."
  ok "خروجی بیلد آماده است"
fi

# ── ۴) آماده‌سازی schema دیتابیس ───────────────────────────────────
# DB_SETUP=auto (پیش‌فرض) | push (همیشه db push) | skip (اصلاً دست نزن)
PRISMA_CLI="${PRISMA_CLI:-$APP_DIR/node_modules/prisma/build/index.js}"
DB_SETUP="${DB_SETUP:-auto}"
say "— آماده‌سازی دیتابیس (DB_SETUP=$DB_SETUP) —"
if [[ ! -f "$PRISMA_CLI" ]]; then
  warn "  prisma CLI نیست؛ آماده‌سازی schema را دستی اجرا کنید (npm run db:push)"
elif [[ "$DB_SETUP" == "skip" ]]; then
  warn "  DB_SETUP=skip → schema دیتابیس تغییر نکرد"
elif [[ "$DB_SETUP" == "push" ]]; then
  db_setup_or_die "db push" node "$PRISMA_CLI" db push --skip-generate --schema "$APP_DIR/prisma/schema.prisma"
elif [[ -d "$APP_DIR/prisma/migrations" ]]; then
  if ! run node "$PRISMA_CLI" migrate deploy --schema "$APP_DIR/prisma/schema.prisma"; then
    warn "  migrate deploy ناموفق بود. اگر این دیتابیس قبلاً با db push ساخته شده،"
    warn "  جدول‌ها از قبل موجودند و baseline فقط باید علامت بزند (داده نمی‌پرد):"
    warn "    node $PRISMA_CLI migrate resolve --applied 0_init --schema $APP_DIR/prisma/schema.prisma"
    warn "  یا برای رفتار سابق: DB_SETUP=push  و برای دست نزدن به دیتابیس: DB_SETUP=skip"
    die "  بدون schema سالم نصب کامل نمی‌شود (دیتابیسِ آماده‌نشده = سرور ۵۰۰ در اولین کوئری)."
  fi
else
  warn "  prisma/migrations نیست → db push"
  db_setup_or_die "db push" node "$PRISMA_CLI" db push --skip-generate --schema "$APP_DIR/prisma/schema.prisma"
fi
if $DEMO_SEED; then
  warn "  بذر دیمو — فقط روی دیتابیس خالی اجراش کنید"
  run node "$APP_DIR/prisma/seed.mjs" || warn "seed ناموفق بود — روی NODE_ENV=production گارد seed فقط با ALLOW_PROD_SEED=1 باز می‌شود"
fi

# ── ۵) سرویس PM2 ───────────────────────────────────────────────────
say "— سرویس PM2 —"
ECOSYSTEM="$APP_DIR/deploy/ecosystem.config.cjs"
TPL="$SCRIPT_DIR/ecosystem.config.cjs.template"
[[ -f "$TPL" ]] || die "قالب PM2 نیست: $TPL"
# مقادیر جای‌گزین‌شونده در sed فرار می‌شوند: مسیر نصب می‌تواند `&` یا `|` داشته باشد.
APP_DIR_X="$(sed_esc "$APP_DIR")"; PORT_X="$(sed_esc "$PORT")"; USER_X="$(sed_esc "$SERVICE_USER")"
if $DRY_RUN; then
  # در dry-run دیسک را تغییر نمی‌دهیم؛ خروجی را به فایل موقت می‌نویسیم و نشان می‌دهیم
  ECOSYSTEM="$(mktemp /tmp/nobino-ecosystem.XXXXXX.cjs)"
  sed -e "s|__APP_DIR__|$APP_DIR_X|g" -e "s|__PORT__|$PORT_X|g" -e "s|__USER__|$USER_X|g" "$TPL" > "$ECOSYSTEM"
  printf '%s[dry] pm2 start %s%s\n' "$C_DIM" "$ECOSYSTEM" "$C_OFF"
else
  mkdir -p "$APP_DIR/logs"
  sed -e "s|__APP_DIR__|$APP_DIR_X|g" -e "s|__PORT__|$PORT_X|g" -e "s|__USER__|$USER_X|g" "$TPL" > "$ECOSYSTEM"
  pm2 start "$ECOSYSTEM" --update-env
  pm2 save
  # HOME_DIR بدون set -e را بشکند: اگر کاربر سرویس موجود نیست، به daemon ریشه برگرد
  HOME_DIR="$(getent passwd "$SERVICE_USER" 2>/dev/null | cut -d: -f6 || true)"
  if [[ -z "$HOME_DIR" ]]; then
    warn "  کاربر «$SERVICE_USER» در این سرور نیست (یا shell ورودی ندارد) → autostart با daemon ریشه ثبت می‌شود"
    SERVICE_USER="root"; HOME_DIR="/root"
  fi
  pm2 startup systemd -u "$SERVICE_USER" --hp "$HOME_DIR" >/dev/null 2>&1 \
    || warn "pm2 startup را دستی اجرا کنید تا سرویس بعد از ریستارت سرور بالا بیاید"
  ok "سرویس PM2 بالا آمد (نام: nobino-api، کاربر: $SERVICE_USER)"
fi

# ── ۶) vhost nginx ─────────────────────────────────────────────────
if ! $SKIP_NGINX; then
  say "— ساخت vhost اِج‌انجی‌اِکس —"
  NGINX_DIR="$SCRIPT_DIR/nginx"
  UP_PART="$NGINX_DIR/nobino.upstream.conf.part"
  TPL="$NGINX_DIR/nobino.conf.template"
  TLS_SNIPPET="$NGINX_DIR/nobino.tls.conf.snippet"
  [[ -f "$UP_PART" && -f "$TPL" ]] || die "قالب‌های nginx نیستند: $UP_PART / $TPL"

  CRT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
  KEY="/etc/letsencrypt/live/$DOMAIN/privkey.pem"
  if $ENABLE_TLS && [[ -f "$CRT" && -f "$KEY" ]]; then
    BODY="$TLS_SNIPPET"
    [[ -f "$BODY" ]] || die "قالب TLS نیست: $BODY"
    say "  پیکربندی HTTPS (بلوک ۸۰ فقط ریدایرکت می‌کند)"
  elif $ENABLE_TLS; then
    BODY="$TPL"
    warn "  گواهی در $CRT نیست؛ فقط HTTP نصب می‌شود. بعد از صدور گواهی، دوباره با --tls اجرا کنید."
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
  ok "  vhost در $TMP_CONF ساخته شد"

  if $DRY_RUN; then
    printf '%s[dry] cp %s /etc/nginx/sites-available/nobino.conf && nginx -t && systemctl reload nginx%s\n' \
      "$C_DIM" "$TMP_CONF" "$C_OFF"
  else
    # HI-10: نسخهٔ قبلی روی دیسک قبل از بازنویستی کنار گذاشته می‌شود. اگر
    # nginx -t خطا بدهد (حتا به دلیلی که به نوبینو ربط ندارد) همان نسخهٔ قبلی
    # برمی‌گردد و reload انجام نمی‌شود — پس پروسهٔ در حال اجرا هنوز پیکربندی
    # سالمِ خودش را در حافظه دارد و دیسک هم با آن هم‌خوان می‌شود.
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
      say "  نسخهٔ قبلی $NG_AVAIL پشتیبان گرفته شد؛ در شکست همان بازمی‌گردد"
    fi
    cp "$TMP_CONF" "$NG_AVAIL"
    ln -sf "$NG_AVAIL" "$NG_ENABLED"
    if nginx -t 2>/tmp/nobino-nginx-test.log; then
      systemctl reload nginx
      ok "vhost نوبینو فعال شد (نصب‌های دیگر nginx دست نمی‌خورند)"
      if [[ -n "$NG_BAK" ]]; then rm -f "$NG_BAK"; fi
    else
      cat /tmp/nobino-nginx-test.log >&2 || true
      if [[ -n "$NG_BAK" ]]; then
        mv -f "$NG_BAK" "$NG_AVAIL"
      else
        rm -f "$NG_AVAIL"
      fi
      if ! $HAD_ENABLED; then
        # پیش از این اجرا نوبینو در sites-enabled نبود → symlink تازه‌ساخته پاک می‌شود
        rm -f "$NG_ENABLED"
      fi
      die "vhost نامعتبر بود؛ پیکربندی قبلی روی دیسک بازیابی شد و reload انجام نشد. $TMP_CONF را بررسی و دوباره اجرا کنید — اگر خطا به بلوک سایت دیگری مربوط است، اول همان را درست کنید."
    fi
  fi
else
  warn "nginx رد شد (--skip-nginx)"
fi

# ── ۷) بررسی سلامت ─────────────────────────────────────────────────
say "— بررسی سلامت —"
HEALTH_URL="http://127.0.0.1:$PORT/api/health?db=1"
if $DRY_RUN; then
  printf '%s[dry] curl %s%s\n' "$C_DIM" "$HEALTH_URL" "$C_OFF"
else
  # HI-3: سلامت دروازه است، نه هشدار. (۱) تا ۹۰ ثانیه تلاش مجدد — اولین بوت با
  # prisma generate و db push از ۳ ثانیه خیلی طولانی‌تر است؛ (۲) pidِ نگه‌دارندهٔ
  # پورت با pid سرویس مقصد تطبیق داده می‌شود تا پاسخِ یک پروسهٔ دیگر روی همان
  # پورت این نصب را «موفق» نشان ندهد؛ (۳) شکست → خروج ۱.
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
    say "   لاگ سرویس: pm2 logs nobino-api --lines 60"
    say "   اگر دیتابیس بالا نیست: «$HEALTH_URL» را دستی بگیرید و DATABASE_URL را بررسی کنید."
    die "سرویس در ۹۰ ثانیه به $HEALTH_URL پاسخ نداد؛ نصب ناتمام است."
  fi
  OWNER=""
  if [[ -n "$EXPECT_PID" ]] && command -v ss >/dev/null 2>&1; then
    OWNER="$(ss -ltnp "sport = :$PORT" 2>/dev/null | grep -oE 'pid=[0-9]+' | head -1 | sed 's/pid=//')"
    if [[ -n "$OWNER" && "$OWNER" != "$EXPECT_PID" ]]; then
      die "پورت $PORT را پروسهٔ $OWNER پاسخ داد، نه nobino-api (pid $EXPECT_PID). آن پروسه را متوقف کنید و دوباره اجرا کنید؛ نسخهٔ تازه در حال سرو نیست."
    fi
  fi
  say "$HEALTH"
  if [[ -n "$OWNER" ]]; then ok "سرور سالم است (pid $OWNER روی پورت $PORT)"; else ok "سرور روی پورت $PORT پاسخ می‌دهد"; fi
fi

say ""
say "${C_OK}نصب پایان یافت.${C_OFF} مراحل باقی‌مانده:"
say "  ۱) DNS: رکورد A برای ${DOMAIN} و یک رکورد CNAME/WILDCARD برای *.${DOMAIN} به IP همین سرور"
if [[ ${#DOMAIN_ALIASES[@]} -gt 0 ]]; then
  say "     و رکورد A برای دامنه‌های alias: ${DOMAIN_ALIASES[*]}"
fi
say "     (صدور DNS را خودمان انجام نمی‌دهیم.)"
say "  ۲) گواهی HTTPS (Let's Encrypt، wildcard برای ساب‌دامین‌ها؛ چالش DNS لازم است):"
say "       sudo bash deploy/ssl.sh ${SSL_DOMAIN_ARGS} --email <ایمیل>"
say "     برای دامنهٔ ریشه به‌صورت غیرتعاملی: --mode http (ساب‌دامین‌ها پوشش داده نمی‌شوند)"
say "  ۳) در .env این‌ها را تنظیم کنید: SITE_URL=${SPA_PROTO}://${DOMAIN}  APP_URL=${SPA_PROTO}://${DOMAIN}  ROOT_DOMAIN=${DOMAIN}"
if [[ ${#DOMAIN_ALIASES[@]} -gt 0 ]]; then
  say "     و EXTRA_DOMAINS=\"$(IFS=,; printf '%s' "${DOMAIN_ALIASES[*]}")\" برای دامنه‌های alias"
fi
say "  ۴) به‌روزرسانی بعدی:  sudo bash deploy/update.sh"
say "  ۵) اگر دیتابیس تازه و خالی است، اولین سوپرادمین را بسازید:"
say "       cd ${APP_DIR} && ADMIN_PHONE=09xxxxxxxxx ADMIN_PASSWORD='…' node scripts/create-admin.mjs   (رمز حداقل ۸ کاراکتر)"
say "  لاگ: pm2 logs nobino-api — وضعیت: pm2 status — تست: curl ${HEALTH_URL}"
