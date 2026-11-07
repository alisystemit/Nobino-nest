#!/usr/bin/env node
/**
 * Start the Nobino project (NestJS version) on PaaS and on a server.
 *
 * This file is the standard entry point for platforms (`npm start`). Steps:
 *   1) If there is no build output, build it (node scripts/build-release.mjs --skip-install)
 *   2) Generate the Prisma Client and prepare the database
 *        prisma/migrations exists → migrate deploy
 *        does not exist           → db push (the current project was created with db push)
 *        DB_SETUP=skip|migrate|push changes the path
 *   3) Run backend/dist/main.js on $PORT with SERVE_FRONTEND=1 so it also serves the SPA
 *   4) After the server comes up, a light background prerender for the venue pages
 *
 * Relevant variables: PORT (default 3100), HOST, SERVE_FRONTEND, DB_SETUP,
 * SKIP_BUILD, PRERENDER_ON_BOOT,
 * AUTO_SEED=1 → run prisma/seed.mjs (demo seed). Has no effect on production
 * unless ALLOW_PROD_SEED=1, because seed creates an admin user with a known default password.
 */
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const log = (...a) => console.log("•", ...a);
const die = (msg, err) => {
  console.error("❌", msg, err?.message || "");
  process.exit(1);
};

const env = { ...process.env };
const PORT = Number(env.PORT || env.API_PORT || 3100);
const DB_SETUP = (env.DB_SETUP || "auto").toLowerCase();
const SKIP_BUILD = /^(1|true|yes)$/i.test(env.SKIP_BUILD || "");

function fromEnvFile(name) {
  for (const file of [".env.production", ".env"]) {
    const p = join(ROOT, file);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(new RegExp(`^${name}\\s*=\\s*"?(.*?)"?$`, "m"));
    if (m && m[1]) return m[1].trim();
  }
  return undefined;
}
const envValue = (name) => (env[name] || fromEnvFile(name) || "").trim();

const prismaCli = join(ROOT, "node_modules", "prisma", "build", "index.js");
const distMain = join(ROOT, "backend", "dist", "main.js");
const distIndex = join(ROOT, "frontend", "dist", "index.html");

if (!envValue("DATABASE_URL")) {
  console.warn("⚠️  DATABASE_URL is not set; the server will fail at env.ts. Ask the platform to set it.");
}

// ── 1) build if output is missing ───────────────────────────────────
const needBuild = !SKIP_BUILD && (!existsSync(distMain) || !existsSync(distIndex));
if (needBuild) {
  log("no build output — building release...");
  try {
    execFileSync(process.execPath, [join(ROOT, "scripts", "build-release.mjs"), "--skip-install", "--no-smoke"], {
      stdio: "inherit",
      cwd: ROOT,
    });
  } catch {
    die("build-release failed");
  }
} else if (SKIP_BUILD) {
  log("SKIP_BUILD=1 — skipped build");
}
if (!existsSync(distMain)) die("backend/dist/main.js does not exist (run the build)");

// ── 2) Prisma: generate + prepare the database ────────────────────
if (existsSync(prismaCli)) {
  try {
    execFileSync(process.execPath, [prismaCli, "generate", "--schema", join("prisma", "schema.prisma")], {
      stdio: "inherit",
      cwd: ROOT,
    });
  } catch {
    console.warn("⚠️  prisma generate failed (the client may already have been generated)");
  }
}

const hasMigrations = existsSync(join(ROOT, "prisma", "migrations"));
let mode = DB_SETUP;
if (mode === "auto") mode = hasMigrations ? "migrate" : "push";

// db push modifies the database schema on every boot. Since this repository has
// no migrations, that is the correct path; so it is only repeated when
// schema.prisma has changed since the last successful push.
const SCHEMA_FILE = join(ROOT, "prisma", "schema.prisma");
const SCHEMA_STAMP = join(ROOT, "node_modules", ".cache", "nobino-schema-stamp");
function schemaChanged() {
  try {
    const hash = createHash("sha256").update(readFileSync(SCHEMA_FILE)).digest("hex");
    const last = existsSync(SCHEMA_STAMP) ? readFileSync(SCHEMA_STAMP, "utf8").trim() : "";
    return { hash, changed: last !== hash };
  } catch {
    return { hash: "", changed: true };
  }
}

if (mode !== "skip" && envValue("DATABASE_URL")) {
  const stamp = mode === "push" ? schemaChanged() : { changed: true, hash: "" };
  if (mode === "push" && !stamp.changed) {
    log("db push skipped — schema.prisma has not changed since the last preparation (DB_SETUP=push to force a run)");
  } else {
    const args =
      mode === "migrate"
        ? [prismaCli, "migrate", "deploy", "--schema", join("prisma", "schema.prisma")]
        : [prismaCli, "db", "push", "--skip-generate", "--schema", join("prisma", "schema.prisma")];
    log(`preparing database (${mode === "migrate" ? "migrate deploy" : "db push"})...`);
    // ME-8: under PM2/Docker stdin is not a TTY, and with `stdio:"inherit"` the
    // destructive prompt of `db push` (dropping a column/table) can hang the boot.
    // We set stdin to ignore so it gets EOF and Prisma errors out immediately;
    // `--accept-data-loss` is never added, because silently deleting data during
    // an automatic boot is not acceptable.
    const interactive = Boolean(process.stdin.isTTY);
    try {
      execFileSync(process.execPath, args, {
        stdio: interactive ? "inherit" : ["ignore", "inherit", "inherit"],
        cwd: ROOT,
      });
      if (mode === "push" && stamp.hash) {
        try {
          mkdirSync(dirname(SCHEMA_STAMP), { recursive: true });
          writeFileSync(SCHEMA_STAMP, stamp.hash, "utf8");
        } catch {
          console.warn("⚠️  schema stamp was not written — db push will run again on the next boot.");
        }
      }
    } catch {
      console.error(`❌ database preparation (${mode}) failed — the server will start, but the schema is not up to date.`);
      if (mode === "migrate") {
        console.error(
          "    If this database was previously created with db push, mark the baseline once:\n" +
            `    node ${prismaCli} migrate resolve --applied 0_init --schema prisma/schema.prisma`,
        );
      } else {
        console.error(
          "    If Prisma warned about dropping a column/table, decide knowingly and manually:\n" +
            `    node ${prismaCli} db push --schema prisma/schema.prisma   (use --accept-data-loss only after a backup)`,
        );
      }
    }
  }
  if (mode === "migrate" && !hasMigrations) {
    console.warn("ℹ️  the prisma/migrations folder does not exist; create a baseline (see prisma/migrations/README.md).");
  }
} else {
  log(`database preparation skipped (DB_SETUP=${mode})`);
}

// ── 2.5) demo seed — fresh development environments only ────────────
// seed.mjs creates an admin user with a known default password, so on production
// it does not run without ALLOW_PROD_SEED=1.
if (/^(1|true|yes)$/i.test(envValue("AUTO_SEED"))) {
  const isProd = (envValue("NODE_ENV") || "production").toLowerCase() === "production";
  const allowed = !isProd || /^(1|true|yes)$/i.test(envValue("ALLOW_PROD_SEED"));
  if (!allowed) {
    console.warn("⚠️  AUTO_SEED refused on production (default admin with a known password) — set ALLOW_PROD_SEED=1 to override.");
  } else {
    const seedScript = join(ROOT, "prisma", "seed.mjs");
    if (existsSync(seedScript)) {
      log("AUTO_SEED=1 — running prisma/seed.mjs");
      try {
        execFileSync(process.execPath, [seedScript], { stdio: "inherit", cwd: ROOT });
      } catch {
        console.warn("⚠️  seed failed");
      }
    }
  }
}

// ── 3) run the server ──────────────────────────────────────────────
const child = spawn(process.execPath, [distMain], {
  cwd: ROOT, // important: public/uploads is resolved relative to cwd
  env: { ...env, PORT: String(PORT), HOST: env.HOST || "0.0.0.0", SERVE_FRONTEND: env.SERVE_FRONTEND || "1", NODE_ENV: env.NODE_ENV || "production" },
  stdio: "inherit",
});

let requestedStop = false;
child.on("exit", (code, signal) => {
  if (signal) {
    console.log(`⏹  server closed with signal ${signal} (${requestedStop ? "requested stop" : "unrequested"}).`);
    // An unrequested signal (OOM, crash) must not look like a clean stop with code 0
    process.exit(requestedStop ? 0 : 1);
  }
  process.exit(code ?? 0);
});

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    requestedStop = true;
    if (!child.killed) child.kill(sig);
  });
}

// ── 3.5) automatic preparation of the local ASR model (without blocking boot) ────────
// The user/admin does nothing: on the first run the model is downloaded in the background and until
// that moment the STT chain uses the cloud services (with no error for the customer).
if (/^(0|false|no|off)$/i.test(envValue("AUTO_ASR") || "1")) {
  log("automatic ASR preparation is off (AUTO_ASR=0)");
} else {
  log("preparing the local ASR model in the background (first run: ~459MB model + ffmpeg)");
  const asr = spawn(process.execPath, [join(ROOT, "scripts", "asr-setup.mjs")], {
    cwd: ROOT,
    env,
    stdio: "inherit",
  });
  asr.unref();
  asr.on("exit", (code) => log(`ASR preparation finished (code ${code ?? "-"})`));
}

// ── 4) background prerender after the server comes up ────────────────────────
if (/^(0|false|no)$/i.test(env.PRERENDER_ON_BOOT || "")) {
  log("background prerender is off (PRERENDER_ON_BOOT=0)");
} else {
  (async () => {
    const base = `http://127.0.0.1:${PORT}`;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 800));
      try {
        const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2500) });
        if (res.ok) break;
      } catch {
        if (child.exitCode !== null) return;
      }
    }
    if (!existsSync(distIndex)) return;
    // The SEO base comes from the environment or the .env file; the server's own local
    // address never replaces the domain (in that case prerender wipes sitemap/robots).
    const site = envValue("VITE_SITE_URL") || envValue("SITE_URL") || envValue("VITE_APP_URL") || envValue("APP_URL");
    if (!site) {
      console.warn("⚠️  SEO base is unknown (VITE_SITE_URL/SITE_URL in env or .env) — prerender skipped so sitemap/robots is not written stale or local.");
      return;
    }
    log("prerendering SEO pages (venues)...");
    // ME-11: we capture and print both streams — with stdio:"ignore" the warnings
    // (and "0 venue pages") were never visible in the PM2 log.
    const r = spawnSync(process.execPath, ["prerender.mjs"], {
      cwd: join(ROOT, "frontend"),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...env, PRERENDER_API: env.PRERENDER_API || base, VITE_SITE_URL: site },
    });
    const lines = `${r.stdout || ""}\n${r.stderr || ""}`.split(/\r?\n/).filter((l) => /prerender/.test(l));
    for (const line of lines) (r.status === 0 ? log : console.warn)("   " + line);
    if (r.status === 0) log("prerender completed");
    else if (r.error) console.warn(`⚠️  prerender did not run: ${r.error.message}`);
    else console.warn("⚠️  prerender did not complete — the backend returned no SEO data (venue pages were not generated).");
  })();
}
