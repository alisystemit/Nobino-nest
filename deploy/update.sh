#!/usr/bin/env bash
# =====================================================================
# Nobino — به‌روزرسانی سریع روی سرور (بدون نصب مجدد وابستگی‌های سیستم)
#
#   sudo bash deploy/update.sh                     # pull + npm ci + بیلد + بکاپ + migrate + restart
#   sudo bash deploy/update.sh --no-pull           # بدون git pull (کد همین‌جا تغییر کرده)
#   sudo bash deploy/update.sh --no-backup         # بدون pg_dump (دیتابیس خیلی بزرگ/فضای کم)
#   sudo bash deploy/update.sh --backup-dir /var/backups/nobino
#   sudo bash deploy/update.sh --keep 5            # چند بکاپ نگه داریم (پیش‌فرض 10)
#   sudo bash deploy/update.sh --rollback          # بازگشت دیتابیس + کد به قبل از آخرین ارتقا
#   sudo bash deploy/update.sh --rollback=/path/x.dump
#   sudo bash deploy/update.sh --yes               # بدون پرسش (لازم برای --rollback غیرتعاملی)
#   sudo bash deploy/update.sh --dry-run           # فقط نشان بده؛ هیچ دستوری اجرا نمی‌شود
# نشانی دیتابیس در هر حالت با رمز مخفی چاپ می‌شود (postgresql://user:***@host/db)؛
# رمز هرگز به argv نمی‌رود — از همان DATABASE_URL به PGPASSWORD/PGUSER/… تبدیل
# می‌شود و بلافاصله پس از pg_dump/pg_restore پاک می‌گردد، تا در `ps auxe` و لاگ
# ابزارهای مانیتورینگ قابل خواندن نباشد.
#
# دیتابیس: هیچ داده‌ای پاک یا بازنویسی نمی‌شود؛ فقط schema هم‌راستا می‌شود
# (migrate deploy اگر prisma/migrations باشد، وگرنه db push). درست پیش از آن
# یک بکاپ full با `pg_dump --format=custom` در backups/ گرفته می‌شود و
# کامیتِ قبل از ارتقا در فایل `.meta` کنارش نوشته می‌شود؛ اگر migrate خطا
# بدهد اسکریپت **قبل از ری‌استارت** می‌ایستد تا سرویس با جدول ناسازگار بالا
# نیاید، و همان بکاپ را برای `--rollback` نشان می‌دهد.
#
# هشدار: فایل‌های backups/*.dump تمام دادهٔ کاربران را دارند. این پوشه
# gitignored است و از بیرون سرو نمی‌شود (nginx فقط frontend/dist را root
# می‌گیرد)؛ با --backup-dir به جای دیگری ببریدش اگر سرور را پاک می‌کنید.
# =====================================================================
set -euo pipefail
C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✅ %s%s\n' "$C_OK" "$*" "$C_OFF"; }
warn() { printf '%s⚠️  %s%s\n' "$C_WARN" "$*" "$C_OFF"; }
die()  { printf '%s❌ %s%s\n' "$C_ERR" "$*" "$C_OFF" >&2; exit 1; }
run()  { if $DRY_RUN; then printf '%s[dry] %s%s\n' "$C_DIM" "$*" "$C_OFF"; else "$@"; fi; }
# رمز را از نشانی بیرون می‌کشد: postgresql://u:p@h/d → postgresql://u:***@h/d.
# نشانی بدون رمز دست‌نخورده می‌ماند و اگر خودِ رمز «@» داشته باشد هم درست
# مخفی می‌شود (هرچه میان «://» و آخرین «@» باشد رمز/نام‌کاربری است).
mask_url() {
  local u="${1:-}" proto userinfo host user
  [[ "$u" =~ ^([^:/]+://)(.*)@([^@]+)$ ]] || { printf '%s' "$u"; return 0; }
  proto="${BASH_REMATCH[1]}"; userinfo="${BASH_REMATCH[2]}"; host="${BASH_REMATCH[3]}"
  [[ "$userinfo" == *:* ]] || { printf '%s' "$u"; return 0; }
  user="${userinfo%%:*}"
  printf '%s%s:***@%s' "$proto" "$user" "$host"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DRY_RUN=false
DO_PULL=true
DO_BACKUP=true
AUTO_YES=false
ROLLBACK=false
ROLLBACK_DUMP=""
KEEP="${KEEP:-10}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --no-pull) DO_PULL=false; shift ;;
    --no-backup) DO_BACKUP=false; shift ;;
    --yes) AUTO_YES=true; shift ;;
    --rollback) ROLLBACK=true; shift ;;
    --rollback=*) ROLLBACK=true; ROLLBACK_DUMP="${1#*=}"; shift ;;
    --backup-dir) [[ $# -ge 2 ]] || die "--backup-dir به یک مسیر نیاز دارد"; BACKUP_DIR="$2"; shift 2 ;;
    --backup-dir=*) BACKUP_DIR="${1#*=}"; shift ;;
    --keep) [[ $# -ge 2 ]] || die "--keep به یک عدد نیاز دارد"; KEEP="$2"; shift 2 ;;
    --keep=*) KEEP="${1#*=}"; shift ;;
    -h|--help) awk 'NR>1 && /^#/ {sub(/^# ?/,""); print; next} NR>1 {exit}' "$0"; exit 0 ;;
    *) die "گزینهٔ ناشناخته: $1 (با --help لیست گزینه‌ها را ببینید)" ;;
  esac
done
[[ "$KEEP" =~ ^[0-9]+$ ]] && [[ "$KEEP" -ge 1 ]] || die "--keep یک عدد صحیح ≥1 است (پیش‌فرض 10)"
[[ -f "$APP_DIR/package.json" ]] || die "مسیر پروژه پیدا نشد: $APP_DIR"
ENV_FILE="$APP_DIR/.env"

# خواندن یک کلید از .env (نقل‌قول و CR حذف می‌شود؛ اگر فایل نبود رشتهٔ خالی).
env_value() {
  [[ -f "$ENV_FILE" ]] || return 0
  awk -v k="$1" 'BEGIN{FS="="} $1==k { v=substr($0, index($0,"=")+1); gsub(/\r$/,"",v); gsub(/^"/,"",v); gsub(/"$/,"",v); print v }' "$ENV_FILE" | tail -1
}
DB_URL="$(env_value DATABASE_URL)"; [[ -n "$DB_URL" ]] || DB_URL="${DATABASE_URL:-}"
# پرس‌وجوی Prisma (?schema=public&…) را libpq نمی‌فهمد؛ برای pg_dump/pg_restore
# فقط نشانی خالصِ دیتابیس لازم است.
DB_TARGET="${DB_URL%%\?*}"
DB_NAME="$(printf '%s' "$DB_TARGET" | sed -E 's#.*/([^/?]+).*#\1#')"
# آنچه در stdout چاپ می‌شود همیشه ماسک‌شده است؛ در اجرای واقعی هم دیگر نشانی
# کامل به argv نمی‌رود (HI-1): اعتبارنامه‌ها فقط با متغیرهای libpq منتقل می‌شوند.
DB_DISPLAY="$(mask_url "$DB_TARGET")"
PG_ARGS=()

# %XX → کاراکتر (رمزهای URL-encode‌شده در DATABASE_URL).
url_decode() {
  local s="${1:-}"
  if [[ "$s" == *%* ]]; then printf '%b' "${s//%/\\x}"; else printf '%s' "$s"; fi
}

# DATABASE_URL را به PGPASSWORD/PGUSER/PGHOST/PGPORT/PGDATABASE تبدیل و PG_ARGS را
# می‌سازد، تا هیچ رمز روی خط فرمان (و در `ps auxe`) دیده نشود. نشانی خالی یا
# غیراستاندارد → همان نشانی به --dbname می‌رود (تا dry-run نقشه را نشان دهد).
prepare_pg() {
  local u="$DB_TARGET" rest="" cred="" hp=""
  PG_ARGS=()
  if [[ -z "$u" ]]; then
    PG_ARGS=(--dbname="postgresql://USER:PASS@HOST:5432/nobino")
    return 0
  fi
  if [[ "$u" != *"://"* ]]; then
    PG_ARGS=(--dbname="$u")
    return 0
  fi
  rest="${u#*://}"
  if [[ "$rest" == *"@"* ]]; then
    cred="${rest%@*}"
    rest="${rest##*@}"
    if [[ "$cred" == *:* ]]; then export PGPASSWORD="$(url_decode "${cred#*:}")"; fi
    if [[ -n "${cred%%:*}" ]]; then export PGUSER="${cred%%:*}"; fi
  fi
  if [[ "$rest" == */* ]]; then
    hp="${rest%%/*}"
    export PGDATABASE="${rest#*/}"
  else
    hp="$rest"
  fi
  if [[ -n "$hp" ]]; then
    if [[ "$hp" == *:* ]]; then export PGHOST="${hp%:*}" PGPORT="${hp#*:}"; else export PGHOST="$hp"; fi
  fi
  if [[ -n "${PGDATABASE:-}" ]]; then
    PG_ARGS=(--dbname="$PGDATABASE")
  else
    PG_ARGS=(--dbname="$u")
  fi
  return 0
}
clear_pg_env() { unset PGPASSWORD PGUSER PGHOST PGPORT PGDATABASE; }
prepare_pg

# ── ۰) بازگشت به عقب (اگر خواسته شده، پیش از هر کاری) ──────────────
latest_dump() { ls -1t "$BACKUP_DIR"/nobino-*.dump 2>/dev/null | head -1; }

confirm_destructive() {
  $AUTO_YES && return 0
  if [[ -t 0 ]]; then
    warn "$1"
    read -r -p "    برای ادامه کلمهٔ ROLLBACK را بنویسید: " ans
    [[ "${ans:-}" == "ROLLBACK" ]] || die "لغو شد؛ هیچ چیزی تغییر نکرد."
    return 0
  fi
  die "این کار دیتابیس را بازنویسی می‌کند و غیرتعاملی اجرا شده؛ با --yes تأییدش کنید."
}

rollback() {
  local dump commit base cur_branch tables untracked
  dump="$ROLLBACK_DUMP"
  [[ -n "$dump" ]] || dump="$(latest_dump || true)"
  [[ -n "$dump" && -f "$dump" ]] || die "بکاپی در \"$BACKUP_DIR\" نیست. مسیر پوشه را با --backup-dir بدهید یا --rollback=/path/to.dump."
  base="$(basename "$dump")"
  # نام بکاپ‌های ما: nobino-<commit>-<زمان>.dump — اگر فایل دست‌سازِ دیگری باشد
  # کامیتی استخراج نمی‌شود و فقط دیتابیس بازگردانی می‌گردد.
  commit="$(printf '%s' "$base" | sed -E 's/^nobino-(.+)-[0-9]{8}-[0-9]{6}\.dump$/\1/')"
  [[ "$commit" != "$base" ]] || commit=""
  if [[ -z "$DB_URL" ]]; then
    $DRY_RUN || die "DATABASE_URL (در .env یا محیط) برای بازگشت لازم است."
    warn "DATABASE_URL نیست؛ در dry-run نشانی جای‌گزین نشان داده می‌شود."
  fi
  if ! command -v pg_restore >/dev/null 2>&1; then
    $DRY_RUN || die "pg_restore نیست؛ «apt-get install postgresql-client» نصبش می‌کند."
    warn "pg_restore نیست؛ روی سرور واقعی باید نصب باشد."
  fi
  # فقط تغییرات *ثبت‌نشدهٔ فایل‌های گیت‌شده* جلوی checkout را می‌گیرند؛ فایل‌های
  # untracked (از جمله بکاپ‌هایی که خود این اسکریپت داخل مخزن می‌سازد) با
  # checkout نمی‌سوزند و نباید مسیر بازگشت را قفل کنند.
  if [[ -n "$(git -C "$APP_DIR" status --porcelain --untracked-files=no 2>/dev/null || true)" ]]; then
    die "working tree کثیف است (تغییرات ثبت‌نشده)؛ اول کامیت یا stash کنید تا «git checkout» کارِ کسی را خراب نکند."
  fi
  untracked="$(git -C "$APP_DIR" status --porcelain --untracked-files=only 2>/dev/null || true)"
  if [[ -n "$untracked" ]]; then
    warn "$(printf '%s\n' "$untracked" | grep -c . || true) فایل untracked هست؛ «git checkout» آن‌ها را دست نمی‌زند."
  fi
  cur_branch="$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '-')"
  say "— بازگشت به حالت قبل از آخرین ارتقا —"
  say "  بکاپ  : $dump"
  say "  کامیت : $commit"
  say "  دیتابیس: $DB_DISPLAY"
  [[ -f "$dump.meta" ]] && sed 's/^/    /' "$dump.meta"
  confirm_destructive "دیتابیس «$DB_NAME» با محتوای این بکاپ بازنویسی و کد به $commit برمی‌گردد."
  if command -v pm2 >/dev/null 2>&1; then
    # نوشتن موقع restore باعث دادهٔ نیمه‌کاره می‌شود
    run pm2 stop nobino-api
  fi
  # --exit-on-error + --single-transaction: با هر خطا کل بازگردانی rollback
  # می‌شود و دیتابیس دقیقاً همان وضعیت قبلی را نگه می‌دارد؛ بدون این دو،
  # pg_restore با کد ۰ خارج می‌شد در حالی که نصف جدول‌ها خالی مانده بودند.
  run pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --single-transaction \
    "${PG_ARGS[@]}" "$dump" \
    || { clear_pg_env; die "pg_restore ناموفق بود؛ به‌خاطر --single-transaction هیچ تغییری اعمال نشد و کد دست‌نخورده است. با «pm2 logs nobino-api» و اجرای دستی pg_restore وضعیت را بررسی کنید."; }
  if $DRY_RUN; then
    clear_pg_env
  else
    if command -v psql >/dev/null 2>&1; then
      tables="$(psql -tAc "select count(*) from pg_tables where schemaname='public'" "${PG_ARGS[@]}" 2>/dev/null || true)"
      clear_pg_env
      if [[ "$tables" =~ ^[0-9]+$ ]]; then
        [[ "$tables" -gt 0 ]] || die "بازگردانی هیچ جدولی در schema public نساخت؛ سرویس ری‌استارت نمی‌شود. وضعیت دیتابیس را دستی بررسی کنید."
        ok "بازگردانی تأیید شد: $tables جدول در schema public"
      else
        warn "تعداد جدول‌ها بعد از بازگردانی خوانده نشد؛ قبل از ری‌استارت دیتابیس را دستی بررسی کنید."
      fi
    else
      clear_pg_env
      warn "psql نصب نیست؛ صحتِ بازگردانی فقط به کد خروج pg_restore محدود است."
    fi
  fi
  if [[ -n "$commit" && "$commit" != "-" ]]; then
    run git -C "$APP_DIR" checkout "$commit" || die "checkout به $commit نشد؛ کد دست‌نخورده ماند (دیتابیس بازگردانی شده)."
    # checkout روی کامیت، HEAD را معلق می‌کند و اجرای بعدی update.sh روی HEAD
    # معلق شکست می‌خورد؛ شاخهٔ قبلی را کنار گذاشتیم تا همان اجرا برگرداند.
    if ! $DRY_RUN && [[ -d "$APP_DIR/.git" && "$cur_branch" != "HEAD" && "$cur_branch" != "-" ]]; then
      printf '%s\n' "$cur_branch" >"$APP_DIR/.git/nobino-deploy-branch" ||
        warn "شاخهٔ بازگشت ($cur_branch) ذخیره نشد؛ بعد از rollback دستی «git checkout $cur_branch» بزنید."
    fi
  else
    clear_pg_env
    warn "کامیتِ بکاپ در نام فایل نیست؛ فقط دیتابیس بازگردانی می‌شود. کد را دستی به نسخهٔ قبل ببرید."
  fi
  DO_PULL=false
  DO_BACKUP=false
  ok "دیتابیس و کد به قبل از آخرین ارتقا برگشت؛ حالا همین نسخه بازسازی و ری‌استارت می‌شود."
}

if $ROLLBACK; then rollback; fi

BRANCH="$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '-')"
BEFORE="$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo '-')"

if $DO_PULL; then
  # بعد از یک --rollback، HEAD روی کامیت معلق است و `git pull --ff-only` روی آن
  # می‌میرد («You are not currently on a branch»). شاخهٔ ذخیره‌شده را برمی‌گردانیم.
  if ! $DRY_RUN && ! git -C "$APP_DIR" symbolic-ref -q HEAD >/dev/null 2>&1; then
    attach=""
    if [[ -f "$APP_DIR/.git/nobino-deploy-branch" ]]; then
      attach="$(head -1 "$APP_DIR/.git/nobino-deploy-branch" 2>/dev/null || true)"
    fi
    if [[ -z "$attach" ]]; then
      attach="$(git -C "$APP_DIR" symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)"
    fi
    if [[ -z "$attach" || "$attach" == "HEAD" ]]; then
      die "HEAD روی کامیت معلق است و شاخهٔ بازگشت مشخص نیست. دستی شاخهٔ اصلی را انتخاب کنید:  git checkout <branch>  سپس این دستور را دوباره اجرا کنید."
    fi
    warn "HEAD معلق است (احتمالاً بعد از --rollback)؛ به شاخهٔ «$attach» برمی‌گردیم."
    run git -C "$APP_DIR" checkout "$attach" || die "بازگشت به شاخهٔ «$attach» نشد."
  fi
  say "— git pull ($BRANCH) —"
  if ! $DRY_RUN && [[ -n "$(git -C "$APP_DIR" status --porcelain)" ]]; then
    warn "تغییرات ثبت‌نشده در working tree هست؛ pull فقط اگر conflict ندهد انجام می‌شود."
  fi
  run git -C "$APP_DIR" pull --ff-only
fi
AFTER="$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo '-')"
ok "کد: $BEFORE → $AFTER"

say "— نصب وابستگی‌ها (هر بار npm ci؛ بدون تشخیص تغییر lockfile) —"
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
$DRY_RUN || [[ -f "$PRISMA_CLI" ]] || die "prisma CLI نیست؛ npm ci موفق نبود؟"
run node "$PRISMA_CLI" generate --schema "$APP_DIR/prisma/schema.prisma"
run node "$APP_DIR/scripts/build-release.mjs" --skip-install --no-smoke

# ── بکاپ: بعد از بیلد (تا اگر بیلد می‌شکست دیتابیس دست‌نخورده باشد) و
#    حتماً پیش از هر تغییر schema. در --dry-run این مرحله فقط نقشه را چاپ
#    می‌کند و نبودِ ابزار/`DATABASE_URL` را با هشدار رد می‌شود (اجرای واقعی
#    سخت‌گیرانه است: بدون بکاپ، migrate و restart انجام نمی‌شود). ────────
say "— بکاپ دیتابیس (pg_dump) —"
DUMP=""
if $DO_BACKUP; then
  if [[ -z "$DB_URL" ]]; then
    $DRY_RUN || die "DATABASE_URL نه در .env و نه در محیط پیدا نشد؛ بدون بکاپ ادامه نمی‌دهیم. .env را کامل کنید یا --no-backup بدهید."
    warn "DATABASE_URL نیست؛ در dry-run نشانی جای‌گزین نشان داده می‌شود."
  fi
  if ! command -v pg_dump >/dev/null 2>&1; then
    $DRY_RUN || die "pg_dump در PATH نیست؛ «apt-get install postgresql-client» (یا deploy/bootstrap.sh) نصبش می‌کند. اگر عمداً بکاپ نمی‌خواهید: --no-backup"
    warn "pg_dump نیست؛ در dry-run دستورِ برنامهریزی‌شده چاپ می‌شود ولی روی سرور واقعی باید نصب باشد."
  fi
  DUMP="$BACKUP_DIR/nobino-${BEFORE}-$(date +%Y%m%d-%H%M%S).dump"
  run mkdir -p "$BACKUP_DIR"
  run pg_dump --no-owner --no-privileges --format=custom --file="$DUMP" "${PG_ARGS[@]}"
  clear_pg_env
  if ! $DRY_RUN; then
    [[ -s "$DUMP" ]] || die "بکاپ \"$DUMP\" ساخته نشد؛ قبل از تغییر schema می‌ایستیم."
    printf 'commit=%s\nbranch=%s\ndb=%s\nbytes=%s\nutc=%s\n' \
      "$BEFORE" "$BRANCH" "$DB_NAME" "$(wc -c <"$DUMP" | tr -d ' ')" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$DUMP.meta"
    ok "بکاپ: $DUMP"
    # چرخش: فقط $KEEP بکاپِ تازه می‌ماند (dump و .meta با هم)
    while IFS= read -r oldf; do
      [[ -n "$oldf" && -f "$oldf" ]] || continue
      rm -f "$oldf" "$oldf.meta"
      warn "بکاپ کهنه حذف شد: $(basename "$oldf")"
    done < <(ls -1t "$BACKUP_DIR"/nobino-*.dump 2>/dev/null | tail -n +$((KEEP + 1)))
  fi
else
  warn "بکاپ رد شد (--no-backup یا مسیر --rollback)؛ اگر schema تغییر کند راه برگشتی جز بکاپ دستی ندارید."
fi

say "— هم‌راستایی schema دیتابیس (بدون حذف داده) —"
SCHEMA_OK=true
if [[ -d "$APP_DIR/prisma/migrations" ]]; then
  run node "$PRISMA_CLI" migrate deploy --schema "$APP_DIR/prisma/schema.prisma" || SCHEMA_OK=false
else
  run node "$PRISMA_CLI" db push --skip-generate --schema "$APP_DIR/prisma/schema.prisma" || SCHEMA_OK=false
fi
if ! $SCHEMA_OK; then
  # ری‌استارت با جدول ناسازگار یعنی 500 روی همهٔ صفحه‌ها؛ بهتر است نسخهٔ
  # قبلی روی همان دیتابیسِ سالم بالا بماند و اپراتور تصمیم بگیرد.
  printf '%s❌ schema هم‌راستا نشد؛ سرویس ری‌استارت نشد.%s\n' "$C_ERR" "$C_OFF" >&2
  say "   بکاپِ همین لحظه: ${DUMP:-«بکاپی گرفته نشد»}"
  say "   بازگشت کامل:      sudo bash deploy/update.sh --rollback --yes"
  say "   دلایل و لاگ:      pm2 logs nobino-api --lines 40  +  اجرای دستی migrate deploy"
  exit 1
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
PORT="$(env_value PORT)"; [[ -n "$PORT" ]] || PORT="${PORT:-3100}"  # نبود در .env ← محیط پروسه ← 3100
if $DRY_RUN; then
  printf '%s[dry] curl http://127.0.0.1:%s/api/health?db=1%s\n' "$C_DIM" "$PORT" "$C_OFF"
else
  # بررسی سلامت = دروازهٔ واقعی استقرار، نه هشدار. (۱) تا ۹۰ ثانیه تلاش مجدد، چون
  # بوت با prisma generate/migrate طول می‌کشد؛ (۲) اگر pm2 و ss در دسترس باشند،
  # pidِ نگه‌دارندهٔ پورت با pid سرویس مقصد تطبیق داده می‌شود تا سلامتِ یک پروسهٔ
  # دیگر روی همان پورت، این استقرار را «موفق» نشان ندهد؛ (۳) شکست → خروج ۱.
  EXPECT_PID=""
  if command -v pm2 >/dev/null 2>&1; then
    EXPECT_PID="$(pm2 pid nobino-api 2>/dev/null | tr -dc '0-9')"
  fi
  HEALTH_URL="http://127.0.0.1:$PORT/api/health?db=1"
  H=""
  waited=0
  while [[ -z "$H" && $waited -lt 90 ]]; do
    H="$(curl -fsS --max-time 10 "$HEALTH_URL" 2>/dev/null || true)"
    if [[ -z "$H" ]]; then sleep 3; waited=$((waited + 3)); fi
  done
  if [[ -z "$H" ]]; then
    say "   لاگ سرویس:  pm2 logs nobino-api --lines 60"
    if [[ -n "$DUMP" ]]; then
      warn "اگر نسخهٔ تازه خراب است: sudo bash deploy/update.sh --rollback --yes (بکاپ: $DUMP)"
    fi
    die "سرویس در ۹۰ ثانیه به $HEALTH_URL پاسخ نداد؛ استقرار ناموفق است."
  fi
  OWNER=""
  if [[ -n "$EXPECT_PID" ]] && command -v ss >/dev/null 2>&1; then
    OWNER="$(ss -ltnp "sport = :$PORT" 2>/dev/null | grep -oE 'pid=[0-9]+' | head -1 | sed 's/pid=//')"
    if [[ -n "$OWNER" && "$OWNER" != "$EXPECT_PID" ]]; then
      die "پورت $PORT را پروسهٔ $OWNER پاسخ داد، نه nobino-api (pid $EXPECT_PID). قبل از ادامه آن پروسه را متوقف کنید؛ نسخهٔ تازه‌ای که build شد در حال سرو نیست."
    fi
  fi
  say "$H"
  if [[ -n "$OWNER" ]]; then ok "سرور سالم است (pid $OWNER روی پورت $PORT)"; else ok "سرور سالم است (پورت $PORT)"; fi
fi
say ""
say "${C_OK}به‌روزرسانی پایان یافت.${C_OFF} (کمیت: ${BEFORE} → ${AFTER}) بکاپ: ${DUMP:-—}"
