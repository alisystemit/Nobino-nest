#!/usr/bin/env bash
# =====================================================================
# اجراکنندهٔ مشترک استقرار (هم کنسول عملیات و هم هوک git push)
#
#   bash scripts/ops-deploy-runner.sh <lockDir> <script> [args...]
#
# اسکریپت هدف را اجرا می‌کند، نتیجه (OK/FAILED + کد خروج) را روی خروجی
# استاندارد می‌نویسد و در هر شرایطی — حتی شکست اسکریپت هدف — قفل استقرار
# را آزاد می‌کند. خروجی استاندارد توسط فراخواننده به
# logs/ops-deploy-last.log چسبانده می‌شود.
#
# عمداً «set -e» ندارد تا پاک‌سازی همیشه اجرا شود.
# =====================================================================
set -uo pipefail

LOCK="${1:-}"
shift 2>/dev/null || true

if [[ -z "$LOCK" || ! -d "$LOCK" ]]; then
  printf 'ops-deploy-runner: مسیر قفل داده نشده یا وجود ندارد: %s\n' "${LOCK:-<empty>}" >&2
  exit 64
fi

printf '\n=== ops-deploy script start %s ===\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
rc=0
if "$@"; then
  printf '=== ops-deploy script OK %s ===\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
else
  rc=$?
  printf '=== ops-deploy script FAILED %s exit=%s ===\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$rc"
fi

rm -f "$LOCK/pid" "$LOCK/started" "$LOCK/cmd" 2>/dev/null || true
rmdir "$LOCK" 2>/dev/null || true

exit "$rc"
