#!/usr/bin/env bash
# =====================================================================
# Nobino — راه‌اندازی «حلقهٔ گیت» روی سرور (فقط یک‌بار)
#
#   sudo bash deploy/install-git-remote.sh
#
# می‌سازد:
#   /var/repo/nobino.git      مخزن bare (قابل تغییر: REPO_DIR=…)
#   post-receive hook         بعد از هر push به BRANCH (پیش‌فرض master):
#                               - fetch + reset در پوشهٔ اپ (APP_DIR)
#                               - اجرای خودکار deploy/update.sh --no-pull
#                                 پشت قفل استقرار (logs/ops-deploy.lock)
#   origin در مخزن APP_DIR    تا دکمهٔ «اجرای استقرار» پنل بتواند git pull کند
#
# بعد از اجرا، روی سیستم خودتان (با کلید SSH همین سرور):
#   git remote add deploy root@<IP>:/var/repo/nobino.git
#   git push deploy master
#
# نکته‌های امنیتی:
#   - push فقط فایل‌های گیت‌شده را بازنویسی می‌کند؛ .env ، backups/ و
#     logs/ (که gitignored هستند) دست نمی‌خورند.
#   - تغییر دستی فایل روی سرور با push بعدی بازنویسی می‌شود؛ تغییرات را
#     در مخزن محلی کامیت و push کنید.
#   - push را با کاربری بزنید که اجازهٔ نوشتن در APP_DIR را دارد
#     (مثل root که نصب‌کننده هم با همان اجرا شده است).
# =====================================================================
set -euo pipefail
C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_OFF=$'\033[0m'
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s✅ %s%s\n' "$C_OK" "$*" "$C_OFF"; }
warn() { printf '%s⚠️  %s%s\n' "$C_WARN" "$*" "$C_OFF"; }
die()  { printf '%s❌ %s%s\n' "$C_ERR" "$*" "$C_OFF" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="${REPO_DIR:-/var/repo/nobino.git}"
BRANCH="${BRANCH:-master}"
command -v git >/dev/null 2>&1 || die "git نیست؛ «apt-get install git» نصبش می‌کند."
[[ -d "$APP_DIR" && -f "$APP_DIR/package.json" ]] || die "پوشهٔ پروژه پیدا نشد: $APP_DIR"

# ۱) مخزن bare روی سرور
# (--bare الزامی است: بدون آن، push به شاخهٔ HEAD با «refusing to update
# checked out branch» رد می‌شود و هوک هرگز اجرا نمی‌شود.)
if [[ -d "$REPO_DIR" ]]; then
  ok "مخزن bare از قبل هست: $REPO_DIR"
else
  git init --bare "$REPO_DIR"
  git -C "$REPO_DIR" symbolic-ref HEAD "refs/heads/$BRANCH"
  ok "مخزن bare ساخته شد: $REPO_DIR"
fi

# ۲) پوشهٔ اپ → مخزن گیت با origin همین bare (اگر از قبل گیت نبود)
if ! git -C "$APP_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git init "$APP_DIR"
  git -C "$APP_DIR" checkout -b "$BRANCH" 2>/dev/null || true
  ok "مخزن گیت در $APP_DIR ساخته شد (شاخهٔ $BRANCH)"
fi
git -C "$APP_DIR" remote remove origin 2>/dev/null || true
git -C "$APP_DIR" remote add origin "$REPO_DIR"
ok "origin مخزن اپ به $REPO_DIR اشاره می‌کند"

# ۳) هوک post-receive: fetch + استقرار خودکار در پس‌زمینه، پشت قفل مشترک
#    (همان قفل logs/ops-deploy.lock که دکمهٔ «اجرای استقرار» پنل هم می‌گیرد؛
#    بنابراین push وسطِ استقرار، استقرار دوم را راه نمی‌اندازد و به‌جایش
#    «skipped» در لاگ می‌نویسد.)
HOOK="$REPO_DIR/hooks/post-receive"
cat > "$HOOK" <<EOF
#!/usr/bin/env bash
APP_DIR="$APP_DIR"
BRANCH="$BRANCH"
LOG="\$APP_DIR/logs/ops-deploy-last.log"
LOCK="\$APP_DIR/logs/ops-deploy.lock"
mkdir -p "\$APP_DIR/logs"
# receive-pack این متغیرها را برای هوک تنظیم می‌کند؛ بدون پاک‌کردنشان،
# «git -C APP_DIR» روی مخزن bare اجرا می‌شود و fetch شکست می‌خورد.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE 2>/dev/null || true

acquire_lock() {
  # قفل اتمی با mkdir؛ قفلی که pid آن مرده باشد باز می‌شود تا
  # استقرار بعدی پشت یک قفل کهنه گیر نکند.
  if mkdir "\$LOCK" 2>/dev/null; then
    printf '%s\n' "\$\$" > "\$LOCK/pid"
    return 0
  fi
  local pid=""
  pid="\$(cat "\$LOCK/pid" 2>/dev/null || true)"
  if [[ -n "\$pid" ]] && ! kill -0 "\$pid" 2>/dev/null; then
    rm -rf "\$LOCK" 2>/dev/null || true
    mkdir "\$LOCK" 2>/dev/null || return 1
    printf '%s\n' "\$\$" > "\$LOCK/pid"
    return 0
  fi
  return 1
}

while read -r old new ref; do
  [[ "\$ref" == "refs/heads/\$BRANCH" ]] || continue
  {
    if ! acquire_lock; then
      printf '\\n=== git-push deploy skipped (استقرار دیگری در حال اجراست) %s commit=%s ===\\n' "\$(date -u +%Y-%m-%dT%H:%M:%SZ)" "\${new:0:12}"
      exit 0
    fi
    printf '\\n=== git-push deploy start %s commit=%s ===\\n' "\$(date -u +%Y-%m-%dT%H:%M:%SZ)" "\${new:0:12}"
    if git -C "\$APP_DIR" fetch origin "\$BRANCH" && git -C "\$APP_DIR" reset --hard FETCH_HEAD; then
      printf '%s\\n' "\$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "\$LOCK/started"
      printf 'git push %s' "\${new:0:12}" > "\$LOCK/cmd"
      cd "\$APP_DIR" && bash scripts/ops-deploy-runner.sh "\$LOCK" deploy/update.sh --no-pull
    else
      printf '\\n=== git-push deploy aborted (fetch/reset ناموفق) %s ===\\n' "\$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      rm -f "\$LOCK/pid" "\$LOCK/started" "\$LOCK/cmd" 2>/dev/null || true
      rmdir "\$LOCK" 2>/dev/null || true
    fi
  } >> "\$LOG" 2>&1 &
done
EOF
chmod +x "$HOOK"
ok "هوک post-receive نوشته و اجرایی شد: $HOOK"

say ""
say "حالا روی سیستم خودتان (که کلید SSH سرور را دارد):"
say "  git remote add deploy root@<IP>:$REPO_DIR"
say "  git push deploy $BRANCH"
say "اولین push کل مخزن را می‌فرستد و استقرار به‌صورت خودکار اجرا می‌شود؛"
say "خروجی در $APP_DIR/logs/ops-deploy-last.log و تب «عملیات» پنل سوپرادمین."
