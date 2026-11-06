#!/usr/bin/env bash
# =====================================================================
# Nobino — راه‌اندازی «حلقهٔ گیت» روی سرور (فقط یک‌بار)
#
#   sudo bash deploy/install-git-remote.sh
#
# می‌سازد:
#   /var/repo/nobino.git      مخزن bare (قابل تغییر: REPO_DIR=…)
#   post-receive hook         بعد از هر push به main:
#                               - چک‌اوت فایل‌ها در پوشهٔ اپ (APP_DIR)
#                               - اجرای خودکار deploy/update.sh --no-pull
#   origin در مخزن APP_DIR    تا دکمهٔ «اجرای استقرار» پنل بتواند git pull کند
#
# بعد از اجرا، روی سیستم خودتان (با کلید SSH همین سرور):
#   git remote add deploy root@<IP>:/var/repo/nobino.git
#   git push deploy main
#
# نکته‌های امنیتی:
#   - چک‌اوت فقط فایل‌های گیت‌شده را بازنویسی می‌کند؛ .env ، backups/ و
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
BRANCH="${BRANCH:-main}"
command -v git >/dev/null 2>&1 || die "git نیست؛ «apt-get install git» نصبش می‌کند."
[[ -d "$APP_DIR" && -f "$APP_DIR/package.json" ]] || die "پوشهٔ پروژه پیدا نشد: $APP_DIR"

# ۱) مخزن bare روی سرور
if [[ -d "$REPO_DIR" ]]; then
  ok "مخزن bare از قبل هست: $REPO_DIR"
else
  git init "$REPO_DIR"
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

# ۳) هوک post-receive: چک‌اوت + استقرار خودکار در پس‌زمینه
HOOK="$REPO_DIR/hooks/post-receive"
cat > "$HOOK" <<EOF
#!/usr/bin/env bash
APP_DIR="$APP_DIR"
BRANCH="$BRANCH"
LOG="\$APP_DIR/logs/ops-deploy-last.log"
mkdir -p "\$APP_DIR/logs"
while read -r old new ref; do
  [[ "\$ref" == "refs/heads/\$BRANCH" ]] || continue
  git --work-tree="\$APP_DIR" checkout -f "\$BRANCH" || exit 1
  {
    printf '\\n=== git-push deploy start %s commit=%s ===\\n' "\$(date -u +%Y-%m-%dT%H:%M:%SZ)" "\${new:0:12}"
    cd "\$APP_DIR" && bash deploy/update.sh --no-pull
    printf '\\n=== git-push deploy end %s exit=%s ===\\n' "\$(date -u +%Y-%m-%dT%H:%M:%SZ)" "\$?"
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
