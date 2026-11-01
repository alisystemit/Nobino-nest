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
#   ۴) آماده‌سازی schema دیتابیس (migrate deploy اگر migration باشد، وگرنه db push)
#   ۵) سرویس PM2 + autostart
#   ۶) vhost اِج‌انجی‌اِکس با ساب‌دامین‌های وایلدکارد (mah.nobino.ir و ...)
#
# گزینه‌ها:
#   --domain <دامنه-ریشه>   دامنه‌ای که اپ رویش سرو می‌شود (پیش‌فرض: ROOT_DOMAIN در .env)
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

# ── مقادیر پیش‌فرض ─────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO_DIR"
DOMAIN=""
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
    --domain) DOMAIN="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --app-dir) APP_DIR="$2"; shift 2 ;;
    --user) SERVICE_USER="$2"; shift 2 ;;
    --copy) DO_COPY=true; shift ;;
    --skip-build) SKIP_BUILD=true; shift ;;
    --skip-nginx) SKIP_NGINX=true; shift ;;
    --tls) ENABLE_TLS=true; shift ;;
    --demo-seed) DEMO_SEED=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) sed -n '1,32p' "$0"; exit 0 ;;
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
read_env() {
  awk -v k="$1" 'BEGIN{FS="="} $1==k { v=substr($0, index($0,"=")+1); gsub(/\r$/,"",v); gsub(/^"(.*)"$/,"\\1",v); print v }' "$ENV_FILE" | tail -1
}

DB_URL="$(read_env DATABASE_URL)"; [[ -z "$DB_URL" ]] && DB_URL="${DATABASE_URL:-}"
[[ -n "$DB_URL" ]] || die "DATABASE_URL در .env خالی است."
case "$DB_URL" in postgresql*://*) ;; *) die "DATABASE_URL باید با postgresql:// شروع شود." ;; esac

[[ -z "$DOMAIN" ]] && DOMAIN="$(read_env ROOT_DOMAIN)"
if [[ -z "$DOMAIN" ]]; then
  DOMAIN="$(read_env SITE_URL)"; DOMAIN="${DOMAIN#*://}"; DOMAIN="${DOMAIN%%/*}"; DOMAIN="${DOMAIN%%:*}"
fi
[[ -n "$DOMAIN" ]] || die "دامنهٔ ریشه را با --domain بدهید (مثلاً --domain nobino.ir)"
# اگر کاربر دامنه را با پیشوند http یا پورت/مسیر داده باشد، پاک شود
DOMAIN="${DOMAIN#*://}"; DOMAIN="${DOMAIN%%/*}"; DOMAIN="${DOMAIN%%:*}"

ENV_PORT="$(read_env PORT)"; if [[ -n "$ENV_PORT" && "$PORT" == "3100" ]]; then PORT="$ENV_PORT"; fi
SITE_URL="$(read_env SITE_URL)"; [[ -z "$SITE_URL" ]] && SITE_URL="https://$DOMAIN"
if $ENABLE_TLS || [[ "$SITE_URL" == https* ]]; then SPA_PROTO="https"; else SPA_PROTO="http"; fi

ok "پیش‌بررسی: دامنه=${DOMAIN}  پورت=${PORT}  مسیر=${APP_DIR}  .env=${ENV_FILE}"

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
[[ -f "$APP_DIR/backend/dist/main.js" ]] || die "backend/dist/main.js نیست؛ بدون --skip-build اجرا کنید."
[[ -f "$APP_DIR/frontend/dist/index.html" ]] || die "frontend/dist/index.html نیست؛ بیلد فرانت انجام نشده."
ok "خروجی بیلد آماده است"

# ── ۴) آماده‌سازی schema دیتابیس ───────────────────────────────────
PRISMA_CLI="${PRISMA_CLI:-$APP_DIR/node_modules/prisma/build/index.js}"
say "— آماده‌سازی دیتابیس —"
if [[ ! -f "$PRISMA_CLI" ]]; then
  warn "  prisma CLI نیست؛ آماده‌سازی schema را دستی اجرا کنید (npm run db:push)"
elif [[ -d "$APP_DIR/prisma/migrations" ]]; then
  run node "$PRISMA_CLI" migrate deploy --schema "$APP_DIR/prisma/schema.prisma" || warn "migrate deploy ناموفق بود"
else
  warn "  prisma/migrations نیست → db push (برای پروداکشن migration بسازید؛ راهنما در docs/deploy.md)"
  run node "$PRISMA_CLI" db push --skip-generate --schema "$APP_DIR/prisma/schema.prisma" || warn "db push ناموفق بود"
fi
if $DEMO_SEED; then
  warn "  بذر دیمو — فقط روی دیتابیس خالی اجراش کنید"
  run node "$APP_DIR/prisma/seed.mjs" || warn "seed ناموفق بود"
fi

# ── ۵) سرویس PM2 ───────────────────────────────────────────────────
say "— سرویس PM2 —"
mkdir -p "$APP_DIR/logs"
ECOSYSTEM="$APP_DIR/deploy/ecosystem.config.cjs"
TPL="$SCRIPT_DIR/ecosystem.config.cjs.template"
[[ -f "$TPL" ]] || die "قالب PM2 نیست: $TPL"
sed -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__PORT__|$PORT|g" -e "s|__USER__|$SERVICE_USER|g" "$TPL" > "$ECOSYSTEM"
if $DRY_RUN; then
  printf '%s[dry] pm2 start %s%s\n' "$C_DIM" "$ECOSYSTEM" "$C_OFF"
else
  pm2 start "$ECOSYSTEM" --update-env
  pm2 save
  HOME_DIR="$(getent passwd "$SERVICE_USER" | cut -d: -f6)"; [[ -n "$HOME_DIR" ]] || HOME_DIR="/root"
  pm2 startup systemd -u "$SERVICE_USER" --hp "$HOME_DIR" >/dev/null 2>&1 \
    || warn "pm2 startup را دستی اجرا کنید تا سرویس بعد از ریستارت سرور بالا بیاید"
  ok "سرویس PM2 بالا آمد (نام: nobino-api)"
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

  TMP_CONF="/tmp/nobino-vhost.conf"
  { cat "$UP_PART"; cat "$BODY"; } | sed -e "s|__DOMAIN__|$DOMAIN|g" \
      -e "s|__PORT__|$PORT|g" \
      -e "s|__SPA_DIST__|$APP_DIR/frontend/dist|g" \
      -e "s|__UPLOADS__|$APP_DIR/public/uploads|g" \
      -e "s|__VOICE__|$APP_DIR/public/voice|g" \
      -e "s|__TLS_CRT__|$CRT|g" \
      -e "s|__TLS_KEY__|$KEY|g" > "$TMP_CONF"
  ok "  vhost در /tmp/nobino-vhost.conf ساخته شد"

  run cp "$TMP_CONF" /etc/nginx/sites-available/nobino.conf
  run ln -sf /etc/nginx/sites-available/nobino.conf /etc/nginx/sites-enabled/nobino.conf
  if $DRY_RUN; then
    printf '%s[dry] nginx -t && systemctl reload nginx%s\n' "$C_DIM" "$C_OFF"
  elif nginx -t 2>/tmp/nobino-nginx-test.log; then
    run systemctl reload nginx
    ok "vhost نوبینو فعال شد (نصب‌های دیگر nginx دست نمی‌خورند)"
  else
    cat /tmp/nobino-nginx-test.log >&2
    die "vhost نوشته شد ولی nginx -t خطا داد؛ /tmp/nobino-vhost.conf را بررسی کنید."
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
  sleep 3
  if HEALTH="$(curl -fsS --max-time 12 "$HEALTH_URL" 2>/dev/null)"; then
    say "$HEALTH"
    ok "سرور روی پورت $PORT پاسخ می‌دهد"
  else
    warn "پاسخی از $HEALTH_URL گرفته نشد — «pm2 logs nobino-api --lines 60» را ببینید."
  fi
fi

say ""
say "${C_OK}نصب پایان یافت.${C_OFF} مراحل باقی‌مانده:"
say "  ۱) DNS: رکورد A برای ${DOMAIN} و یک رکورد CNAME/WILDCARD برای *.${DOMAIN} به IP همین سرور"
say "     (صدور DNS را خودمان انجام نمی‌دهیم.)"
say "  ۲) گواهی HTTPS برای ساب‌دامین‌ها (چالش DNS لازم است):"
say "       sudo apt-get install -y certbot python3-certbot-nginx"
say "       sudo certbot certonly --manual --preferred-challenges dns -d ${DOMAIN} -d *.${DOMAIN}"
say "       sudo bash deploy/install.sh --domain ${DOMAIN} --tls"
say "  ۳) در .env این‌ها را تنظیم کنید: SITE_URL=${SPA_PROTO}://${DOMAIN}  APP_URL=${SPA_PROTO}://${DOMAIN}  ROOT_DOMAIN=${DOMAIN}"
say "  ۴) به‌روزرسانی بعدی:  sudo bash deploy/update.sh"
say "  لاگ: pm2 logs nobino-api — وضعیت: pm2 status — تست: curl ${HEALTH_URL}"
