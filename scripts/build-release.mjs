#!/usr/bin/env node
/**
 * Build a deployable release of the Nobino project — NestJS edition.
 *
 * Usage:
 *   node scripts/build-release.mjs            # install + generate + build both sides + smoke test
 *   node scripts/build-release.mjs --skip-install
 *   node scripts/build-release.mjs --no-smoke
 *   node scripts/build-release.mjs --no-frontend   # backend only (frontend build and prerender are skipped)
 *   node scripts/build-release.mjs --strict    # type error = failure (default: warning)
 *
 * prerender only writes sitemap.xml/robots.txt when the base (VITE_SITE_URL or
 * SITE_URL) is a public domain; otherwise a local address never gets burned onto disk.
 *
 * Why "lenient"? This repository is edited by several sessions at the same time, so at
 * build time a few in-progress files may have type errors; `tsc` still produces output
 * despite them. For a deployment pipeline, the real criteria are "a valid dist exists +
 * the server boots successfully"; type errors are printed and warned about, but
 * `--strict` makes the behavior strict. (Development criterion: `npm run build:backend`,
 * which fails on errors; currently the backend builds without errors.)
 */
import { spawnSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);

const log = (...a) => console.log("•", ...a);
const ok = (...a) => console.log("✅", ...a);
const warn = (...a) => console.log("⚠️ ", ...a);
const fail = (msg, extra) => {
  console.error("❌", msg);
  if (extra) console.error(extra);
  process.exit(1);
};

const KNOWN_FLAGS = ["--strict", "--skip-install", "--no-frontend", "--no-smoke", "--help", "-h"];
const unknown = argv.filter((a) => a.startsWith("--") && !KNOWN_FLAGS.includes(a));
if (unknown.length) {
  console.error(`❌ Unknown option: ${unknown.join(", ")}\n   Allowed: ${KNOWN_FLAGS.filter((f) => f !== "-h").join(", ")}`);
  process.exit(1);
}
if (has("--help") || argv.includes("-h")) {
  console.log(`Usage: node scripts/build-release.mjs [option]

  --strict        TypeScript type errors = build failure
  --skip-install  npm install is not run (prepared servers)
  --no-frontend   Frontend build and prerender are skipped
  --no-smoke      Server boot for the smoke test is skipped

Affecting environment variables: SMOKE_PORT (number), SMOKE_DB_REQUIRED (0|1),
SMOKE_PRELOAD (custom --require for the boot), PRERENDER_API (live server in --no-smoke mode),
VITE_SITE_URL / SITE_URL (SEO base; if absent, prerender is not performed).`);
  process.exit(0);
}

const STRICT = has("--strict");
const SKIP_INSTALL = has("--skip-install");
const SKIP_FRONTEND = has("--no-frontend");
const SKIP_SMOKE = has("--no-smoke");
const SMOKE_PORT = (() => {
  const raw = (process.env.SMOKE_PORT || "").trim();
  if (raw === "") return 3977;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) fail(`SMOKE_PORT is invalid: "${raw}" — provide a number between 1024 and 65535.`);
  return n;
})();

function run(cmd, args, opts = {}) {
  const useShell = process.platform === "win32";
  const res = useShell
    // on Windows npm/npx only resolve through the shell; the arguments are fixed and internal
    ? spawnSync([cmd, ...args].join(" "), {
        cwd: opts.cwd || ROOT,
        stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit",
        encoding: "utf8",
        shell: true,
        env: { ...process.env, ...(opts.env || {}) },
      })
    : spawnSync(cmd, args, {
        cwd: opts.cwd || ROOT,
        stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit",
        encoding: "utf8",
        env: { ...process.env, ...(opts.env || {}) },
      });
  return res;
}

// ── 0) Environment checks ──────────────────────────────────────────
function readEnvFile(name) {
  for (const file of [".env.production", ".env"]) {
    const p = join(ROOT, file);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(new RegExp(`^${name}\\s*=\\s*"?(.*?)"?$`, "m"));
    if (m && m[1]) return m[1].trim();
  }
  return undefined;
}
const envValue = (name) => (process.env[name] || readEnvFile(name) || "").trim();

log("Checking environment...");
if (!envValue("DATABASE_URL")) {
  warn("DATABASE_URL not found — migrate/build work without a DB, but the server won't come up.");
}
if (!envValue("JWT_SECRET")) {
  warn("JWT_SECRET is not set; the development default is used (dangerous for production).");
}

// ── 1) Install dependencies ────────────────────────────────────────
if (!SKIP_INSTALL) {
  for (const dir of ["", "backend", "frontend"]) {
    const cwd = dir ? join(ROOT, dir) : ROOT;
    const label = dir || "root";
    const cmd = existsSync(join(cwd, "package-lock.json")) ? ["ci"] : ["install"];
    log(`npm ${cmd[0]} (${label})...`);
    const res = run("npm", cmd, { cwd });
    if (res.status !== 0) fail(`npm ${cmd[0]} failed in ${label}`);
  }
} else {
  log("npm install skipped (--skip-install)");
}

// ── 2) Prisma Client ───────────────────────────────────────────────
const prismaCli = join(ROOT, "node_modules", "prisma", "build", "index.js");
if (existsSync(prismaCli)) {
  log("Generating Prisma Client...");
  const res = run("node", [prismaCli, "generate", "--schema", join("prisma", "schema.prisma")]);
  if (res.status !== 0) fail("prisma generate failed");
} else {
  warn("Prisma CLI is not in node_modules; was dependency installation incomplete?");
}

// ── 3) Backend build ───────────────────────────────────────────────
log("Building backend (tsc + tsc-alias)...");
const backendDir = join(ROOT, "backend");
const tsc = run("npx", ["tsc", "-p", "tsconfig.build.json"], { cwd: backendDir, capture: true });
const tscOut = `${tsc.stdout || ""}${tsc.stderr || ""}`;
if (tsc.status !== 0) {
  const lines = tscOut.split(/\r?\n/).filter((l) => /error TS\d+/.test(l));
  if (STRICT) fail("backend tsc has errors (--strict):\n" + lines.join("\n"));
  warn(`backend tsc reported ${lines.length} type errors (dist is still built):`);
  for (const l of lines.slice(0, 12)) console.log("    " + l);
  if (lines.length > 12) console.log(`    … and ${lines.length - 12} more errors`);
}
const alias = run("npx", ["tsc-alias", "-p", "tsconfig.build.json"], { cwd: backendDir, capture: true });
if (alias.status !== 0) fail("tsc-alias failed", alias.stderr);

// ── 4) Frontend build ──────────────────────────────────────────────
if (!SKIP_FRONTEND) {
  const frontendDir = join(ROOT, "frontend");
  const feTsc = run("npx", ["tsc", "-b"], { cwd: frontendDir, capture: true });
  if (feTsc.status !== 0) {
    const lines = `${feTsc.stdout || ""}${feTsc.stderr || ""}`.split(/\r?\n/).filter((l) => /error TS\d+/.test(l));
    if (STRICT) fail("frontend tsc has errors (--strict):\n" + lines.join("\n"));
    warn(`frontend tsc reported ${lines.length} type errors (vite build does no typecheck):`);
    for (const l of lines.slice(0, 8)) console.log("    " + l);
  }
  log("Building SPA (vite build)...");
  // We set NODE_ENV explicitly to production: the root .env has `NODE_ENV="development"` and
  // Vite (because of envDir being the same folder) picks it up for the build too, so without this
  // line the development React ends up in dist. frontend/scripts/vite-build.mjs does the same thing
  // for `npm run build`; this is the most direct equivalent here.
  const vite = run("node", ["scripts/vite-build.mjs"], { cwd: frontendDir });
  if (vite.status !== 0) fail("vite build failed");
  log("prerender runs after the server boots (so salon pages are fetched from the API)...");
} else {
  log("frontend build skipped (--no-frontend)");
}

// ── 5) Check outputs ───────────────────────────────────────────────
const distMain = join(backendDir, "dist", "main.js");
const distIndex = join(ROOT, "frontend", "dist", "index.html");
if (!existsSync(distMain)) fail("backend/dist/main.js was not created");
ok("backend/dist/main.js exists");
if (!SKIP_FRONTEND && !existsSync(distIndex)) fail("frontend/dist/index.html was not created");

// ── 6) smoke test: real server boot ────────────────────────────────
/** prerender SEO pages: requires a running server.
 *  The base is taken only from VITE_SITE_URL/SITE_URL; the smoke server's own address
 *  (127.0.0.1:port) never replaces the domain — in that case prerender writes relative
 *  canonical URLs and doesn't burn the sitemap onto disk. */
function runPrerender(apiBase) {
  const site = envValue("VITE_SITE_URL") || envValue("SITE_URL") || envValue("VITE_APP_URL");
  if (!site) {
    warn("SEO base is unknown (VITE_SITE_URL/SITE_URL in env or .env) — prerender is skipped so a local sitemap/robots is not written to or deleted from dist.");
    return false;
  }
  const res = run("node", ["prerender.mjs"], {
    cwd: join(ROOT, "frontend"),
    capture: true,
    env: { PRERENDER_API: apiBase, VITE_SITE_URL: site },
  });
  const out = `${res.stdout || ""}${res.stderr || ""}`.trim();
  if (res.status === 0) {
    for (const line of out.split(/\r?\n/).filter(Boolean).slice(-3)) log("prerender: " + line);
  } else {
    warn("prerender did not complete; public pages are served by the SPA shell.");
    for (const line of out.split(/\r?\n/).filter(Boolean).slice(-4)) warn("prerender: " + line);
  }
  return res.status === 0;
}

/** Does a server answer at this address? (for prerender in --no-smoke mode) */
async function apiReachable(apiBase) {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 2500);
    const res = await fetch(`${apiBase}/api/health`, { signal: ac.signal }).finally(() => clearTimeout(timer));
    return res.ok || res.status === 503;
  } catch {
    return false;
  }
}

if (SKIP_SMOKE) {
  log("smoke test skipped (--no-smoke)");
  // Without a running server we never prerender; otherwise
  // sitemap/canonical would burn the smoke-test local address onto disk (B2).
  const explicitApi = (process.env.PRERENDER_API || "").trim();
  if (SKIP_FRONTEND) {
    log("prerender skipped (--no-frontend)");
  } else if (!explicitApi) {
    warn("prerender is not performed in --no-smoke mode (no server is running). Use the smoke test to build the SEO pages, or point PRERENDER_API at your live server.");
  } else if (await apiReachable(explicitApi)) {
    runPrerender(explicitApi);
  } else {
    warn(`PRERENDER_API=${explicitApi} is unreachable — prerender was skipped.`);
  }
} else {
  log(`Booting server on port ${SMOKE_PORT} for the smoke test...`);
  // SMOKE_PRELOAD: an optional --require (e.g. a Prisma connection stub) for an environment
  // without a database; not needed in a real deployment.
  const preload = (process.env.SMOKE_PRELOAD || "").trim();
  const child = spawn("node", [...(preload ? ["--require", preload] : []), distMain], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(SMOKE_PORT),
      NODE_ENV: process.env.NODE_ENV || "production",
      SERVE_FRONTEND: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let bootLog = "";
  child.stdout.on("data", (d) => (bootLog += d.toString()));
  child.stderr.on("data", (d) => (bootLog += d.toString()));

  const deadline = Date.now() + 30000;
  let health = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 700));
    try {
      const res = await fetch(`http://127.0.0.1:${SMOKE_PORT}/api/health?db=1`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        health = await res.json();
        break;
      }
    } catch {
      if (child.exitCode !== null) break;
    }
  }

  const apiBase = `http://127.0.0.1:${SMOKE_PORT}`;
  let spaStatus = 0;
  let spaIsHtml = false;
  let deepStatus = 0;
  if (health) {
    try {
      const res = await fetch(`${apiBase}/`, { signal: AbortSignal.timeout(5000) });
      spaStatus = res.status;
      spaIsHtml = (res.headers.get("content-type") || "").includes("text/html");
    } catch {
      /* keep defaults */
    }
    try {
      // deep path: must answer with the SPA fallback or a prerendered page (not a 404)
      deepStatus = (await fetch(`${apiBase}/packages`, { signal: AbortSignal.timeout(5000) })).status;
    } catch {
      /* keep defaults */
    }
    // prerender runs right now, while the server is up, so the salon pages get generated
    if (!SKIP_FRONTEND) runPrerender(apiBase);
  }

  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 400));
  if (child.exitCode === null) child.kill("SIGKILL");

  if (!health) {
    const dbDown = /Can't reach database server|P1001|ECONNREFUSED/i.test(bootLog);
    // A failure caused by a missing database is not counted as "success"; explicitly skip it with SMOKE_DB_REQUIRED=0.
    if (dbDown && /^(0|false|no)$/i.test(process.env.SMOKE_DB_REQUIRED || "")) {
      warn("The database was unreachable and was skipped with SMOKE_DB_REQUIRED=0 — the smoke test was not fully performed.");
      console.error(bootLog.split(/\r?\n/).filter((l) => /Prisma|P100|database/i.test(l)).slice(0, 4).join("\n"));
    } else {
      console.error(bootLog.slice(-3000));
      if (dbDown) {
        fail("server did not come up: the database is unreachable. Start PostgreSQL (or fix DATABASE_URL); if you really want to test without a DB: SMOKE_DB_REQUIRED=0");
      }
      fail("server did not come up within 30 seconds / /api/health did not respond");
    }
  } else {
    ok(`/api/health → ${health.status} | db=${health.db || "n/a"} | servingSpa=${health.servingSpa}`);
    if (health.db === "down") warn("The database did not respond from /api/health?db=1 (liveness is still 200).");
    if (existsSync(distIndex)) {
      if (spaStatus === 200 && spaIsHtml) ok(`SPA responded at / (HTTP ${spaStatus})`);
      else fail(`SPA was not served (HTTP ${spaStatus}, html=${spaIsHtml})`);
      if (deepStatus === 200) ok("SPA fallback worked on the deep path /packages");
      else fail(`deep path /packages returned ${deepStatus} — the SPA fallback is broken (browser refresh on deep paths gets a 404).`);
    }
  }
}

ok("release is ready. Start with: node scripts/paas-start.mjs");
