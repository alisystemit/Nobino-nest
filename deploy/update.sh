#!/usr/bin/env bash
# =====================================================================
# Nobino — به‌روزرسانی سریع روی سرور (بدون نصب مجدد وابستگی‌های سیستم)
#
#   sudo bash deploy/update.sh            # git pull + بیلد + migrate + reload
#   sudo bash deploy/update.sh --no-pull  # بدون git pull (کد همین‌جا تغییر کرده)
#   sudo bash deploy/update.sh --dry-run
#
# دیتابیس: فقط schema هم‌راستا می‌شود (migrate deploy اگر prisma/migrations
# وجود داشته باشد، وگرنه db push). هیچ داده‌ای پاک یا بازنویسی نمی‌شود.
# =====================================================================
set -euo pipefail
C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✅ %s%s\n' "$C_OK" "$*" "$C_OFF"; }
warn() { printf '%s⚠️  %s%s\n' "$C_WARN" "$*" "$C_OFF"; }
die()  { printf '%s❌ %s%s\n' "$C_ERR" "$*" "$C_OFF" >&2; exit 1; }
run()  { if $DRY_RUN; then printf '%s[dry] %s%s\n' "$C_DIM" "$*" "$C_OFF"; else "$@"; fi; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DRY_RUN=false
DO_PULL=true
for a in "$@"; do
  case "$a" in
    --dry-run) DRY_RUN=true ;;
    --no-pull) DO_PULL=false ;;
    -h|--help) sed -n '1,14p' "$0"; exit 0 ;;
    *) die "گزینهٔ ناشناخته: $a" ;;
  esac
done
[[ -f "$APP_DIR/package.json" ]] || die "مسیر پروژه پیدا نشد: $APP_DIR"

BRANCH="$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '-')"
BEFORE="$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo '-')"

if $DO_PULL; then
  say "— git pull ($BRANCH) —"
  if ! $DRY_RUN && [[ -n "$(git -C "$APP_DIR" status --porcelain)" ]]; then
    warn "تغییرات ثبت‌نشده در working tree هست؛ pull فقط اگر conflict ندهد انجام می‌شود."
  fi
  run git -C "$APP_DIR" pull --ff-only
fi
AFTER="$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo '-')"
ok "کد: $BEFORE → $AFTER"

say "— نصب وابستگی‌ها (در صورت تغییر lockfile) —"
for dir in "" "backend" "frontend"; do
  cwd="$APP_DIR"; [[ -n "$dir" ]] && cwd="$APP_DIR/$dir"
  if [[ -f "$cwd/package-lock.json" ]]; then
    run sh -c "cd '$cwd' && npm ci --no-audit --no-fund"
  else
    run sh -c "cd '$cwd' && npm install --no-audit --no-fund"
  fi
done

say "— Prisma generate + بیلد —"
PRISMA_CLI="$APP_DIR/node_modules/prisma/build/index.js"
[[ -f "$PRISMA_CLI" ]] || die "prisma CLI نیست؛ npm ci موفق نبود؟"
run node "$PRISMA_CLI" generate --schema "$APP_DIR/prisma/schema.prisma"
run node "$APP_DIR/scripts/build-release.mjs" --skip-install --no-smoke

say "— هم‌راستایی schema دیتابیس (بدون حذف داده) —"
if [[ -d "$APP_DIR/prisma/migrations" ]]; then
  run node "$PRISMA_CLI" migrate deploy --schema "$APP_DIR/prisma/schema.prisma" || warn "migrate deploy ناموفق بود"
else
  run node "$PRISMA_CLI" db push --skip-generate --schema "$APP_DIR/prisma/schema.prisma" || warn "db push ناموفق بود"
fi

say "— ری‌استارت سرویس —"
if command -v pm2 >/dev/null 2>&1; then
  # restart (نه reload) چون کران‌ها در حالت cluster تکراری اجرا نشوند
  run pm2 restart nobino-api --update-env
  run pm2 save
  ok "nobino-api ری‌استارت شد"
elif [[ -f "$APP_DIR/scripts/paas-start.mjs" ]]; then
  warn "PM2 نیست؛ اگر با داکر اجرا می‌شود:  docker compose up -d --build"
fi

say "— بررسی سلامت —"
PORT="$(awk 'BEGIN{FS="="} $1=="PORT"{v=substr($0,index($0,"=")+1); gsub(/\r|"/,"",v); print v}' "$APP_DIR/.env" 2>/dev/null | tail -1)"
PORT="${PORT:-3100}"
if $DRY_RUN; then
  printf '%s[dry] curl http://127.0.0.1:%s/api/health?db=1%s\n' "$C_DIM" "$PORT" "$C_OFF"
else
  sleep 3
  if H="$(curl -fsS --max-time 12 "http://127.0.0.1:$PORT/api/health?db=1" 2>/dev/null)"; then
    say "$H"; ok "سرور سالم است"
  else
    warn "سلامت تأیید نشد — «pm2 logs nobino-api --lines 60»"
  fi
fi
say ""
say "${C_OK}به‌روزرسانی پایان یافت.${C_OFF} (کمیت: ${BEFORE} → ${AFTER})"
