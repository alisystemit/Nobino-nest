#!/usr/bin/env bash
# =====================================================================
# Nobino — set up the "git loop" on the server (only once)
#
#   sudo bash deploy/install-git-remote.sh
#
# Creates:
#   /var/repo/nobino.git      bare repository (changeable: REPO_DIR=…)
#   post-receive hook         after every push to BRANCH (default master):
#                               - fetch + reset in the app folder (APP_DIR)
#                               - automatic run of deploy/update.sh --no-pull
#                                 behind the deploy lock (logs/ops-deploy.lock)
#   origin in the APP_DIR repo  so the panel's "run deployment" button can git pull
#
# After running, on your own machine (with this server's SSH key):
#   git remote add deploy root@<IP>:/var/repo/nobino.git
#   git push deploy master
#
# Security notes:
#   - push only overwrites tracked files; .env, backups/ and
#     logs/ (which are gitignored) are left alone.
#   - a manual file change on the server is overwritten by the next push; commit
#     your changes in the local repo and push them.
#   - push as a user who is allowed to write to APP_DIR
#     (such as root, which the installer also ran as).
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
command -v git >/dev/null 2>&1 || die "git is missing; 'apt-get install git' installs it."
[[ -d "$APP_DIR" && -f "$APP_DIR/package.json" ]] || die "Project folder not found: $APP_DIR"

# 1) The bare repository on the server
# (--bare is required: without it, a push to the HEAD branch is rejected with
# "refusing to update checked out branch" and the hook never runs.)
if [[ -d "$REPO_DIR" ]]; then
  ok "Bare repository already exists: $REPO_DIR"
else
  git init --bare "$REPO_DIR"
  git -C "$REPO_DIR" symbolic-ref HEAD "refs/heads/$BRANCH"
  ok "Bare repository created: $REPO_DIR"
fi

# 2) App folder → git repo with origin pointing at this bare repo (if it was not git yet)
if ! git -C "$APP_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git init "$APP_DIR"
  git -C "$APP_DIR" checkout -b "$BRANCH" 2>/dev/null || true
  ok "Git repository created in $APP_DIR (branch $BRANCH)"
fi
git -C "$APP_DIR" remote remove origin 2>/dev/null || true
git -C "$APP_DIR" remote add origin "$REPO_DIR"
ok "App repo origin points to $REPO_DIR"

# 3) post-receive hook: fetch + automatic deployment in the background, behind the shared lock
#    (the same logs/ops-deploy.lock that the panel's "run deployment" button takes;
#    so a push in the middle of a deployment does not start a second deployment and
#    instead writes "skipped" to the log.)
HOOK="$REPO_DIR/hooks/post-receive"
cat > "$HOOK" <<EOF
#!/usr/bin/env bash
APP_DIR="$APP_DIR"
BRANCH="$BRANCH"
LOG="\$APP_DIR/logs/ops-deploy-last.log"
LOCK="\$APP_DIR/logs/ops-deploy.lock"
mkdir -p "\$APP_DIR/logs"
# receive-pack sets these variables for the hook; without clearing them,
# "git -C APP_DIR" runs against the bare repo and fetch fails.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE 2>/dev/null || true

acquire_lock() {
  # Atomic lock with mkdir; a lock whose pid is dead is broken open so
  # that the next deployment does not get stuck behind a stale lock.
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
      printf '\\n=== git-push deploy skipped (another deployment is in progress) %s commit=%s ===\\n' "\$(date -u +%Y-%m-%dT%H:%M:%SZ)" "\${new:0:12}"
      exit 0
    fi
    printf '\\n=== git-push deploy start %s commit=%s ===\\n' "\$(date -u +%Y-%m-%dT%H:%M:%SZ)" "\${new:0:12}"
    if git -C "\$APP_DIR" fetch origin "\$BRANCH" && git -C "\$APP_DIR" reset --hard FETCH_HEAD; then
      printf '%s\\n' "\$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "\$LOCK/started"
      printf 'git push %s' "\${new:0:12}" > "\$LOCK/cmd"
      cd "\$APP_DIR" && bash scripts/ops-deploy-runner.sh "\$LOCK" deploy/update.sh --no-pull
    else
      printf '\\n=== git-push deploy aborted (fetch/reset failed) %s ===\\n' "\$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      rm -f "\$LOCK/pid" "\$LOCK/started" "\$LOCK/cmd" 2>/dev/null || true
      rmdir "\$LOCK" 2>/dev/null || true
    fi
  } >> "\$LOG" 2>&1 &
done
EOF
chmod +x "$HOOK"
ok "post-receive hook written and made executable: $HOOK"

say ""
say "Now on your own machine (which has the server's SSH key):"
say "  git remote add deploy root@<IP>:$REPO_DIR"
say "  git push deploy $BRANCH"
say "The first push sends the whole repository and the deployment runs automatically;"
say "output goes to $APP_DIR/logs/ops-deploy-last.log and the superadmin panel's 'Operations' tab."
