// Creates the first superadmin (with any phone number and password) — for fresh installs on a bare server
//
//   node scripts/create-admin.mjs --phone 09121110000 --password "MyStr0ng!Pass" [--name "Site Admin"] [--email admin@example.com]
//
// Behavior:
//   • If the database already has an active ADMIN user with a password: it only prints a message and exits with code 0
//     (idempotent — it does not change anyone's password). Unless --force-reset is given for the same phone number.
//     If you pass --email, the email of that same existing superadmin is updated.
//   • If the given phone number exists: that user's role/password/email is upgraded.
//   • Otherwise it creates a new ADMIN user.
//   • .env is read from next to this repo or from APP_DIR (for DATABASE_URL).
// The password is hashed with the same algorithm as backend/src/lib/auth/password.ts: scrypt:<salt>:<hex>.
// Warning: pass the password via environment variables (ADMIN_PHONE/ADMIN_PASSWORD/ADMIN_EMAIL/ADMIN_NAME)
// as much as possible so it does not stay in shell history; bootstrap.sh asks for it securely itself.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, scryptSync } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── .env loading (without the dotenv dependency) ──
function loadEnv() {
  const candidates = [process.env.APP_DIR ? resolve(process.env.APP_DIR, ".env") : null, resolve(ROOT, ".env")].filter(Boolean);
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m || process.env[m[1]] !== undefined) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
    return p;
  }
  return null;
}
/** Help and allowed flags — before anything else (even before checking DATABASE_URL) */
const KNOWN_FLAGS = ["phone", "password", "name", "email", "force-reset"];
function usage() {
  console.log(`Usage: node scripts/create-admin.mjs --phone 09121110000 --password <password> [--name "Site Admin"] [--email admin@example.com] [--force-reset]

  --phone <09xxxxxxxxx>   Superadmin phone number (or the ADMIN_PHONE environment variable); Persian digits
                          and the 9xxxxxxxxx form (without the leading zero) are also accepted
  --password <password>   Password, at least 8 characters (or ADMIN_PASSWORD)
  --name <name>           Display name (default: Site Admin / ADMIN_NAME)
  --email <email>         Superadmin profile email (optional; or ADMIN_EMAIL)
  --force-reset           Overwrite the password of the superadmin with this same phone number (only with --phone for that number)
  --help                  This help

Example (password from the environment, so it does not stay in shell history):
  ADMIN_PHONE=09121110000 ADMIN_PASSWORD='MyStr0ng!Pass' ADMIN_EMAIL=admin@example.com node scripts/create-admin.mjs`);
}
const givenFlags = process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")[0]);
if (givenFlags.includes("help") || process.argv.slice(2).includes("-h")) {
  usage();
  process.exit(0);
}
const unknownFlags = givenFlags.filter((f) => f !== "help" && !KNOWN_FLAGS.includes(f));
if (unknownFlags.length) {
  console.error(`❌ Unknown flag: ${unknownFlags.map((f) => `--${f}`).join(", ")}\n`);
  usage();
  process.exit(1);
}

const envPath = loadEnv();
if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL not found — put a .env file next to the repo or provide the environment variable.");
  process.exit(1);
}

// ── Arguments ──
function arg(name) {
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(`--${name}=`.length);
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
// ME-4: the Persian/Arabic keyboard and the "no leading zero" phone number are exactly what OTP itself
// (auth__otp__request.ts: /^0?9\d{9}$/) accepts; it must be accepted here too.
const asciiDigits = (s) =>
  s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
const rawPhone = (arg("phone") || process.env.ADMIN_PHONE || "").trim();
let phone = asciiDigits(rawPhone).replace(/\D/g, "");
if (/^9\d{9}$/.test(phone)) phone = `0${phone}`;
const password = arg("password") || process.env.ADMIN_PASSWORD || "";
const name = (arg("name") || process.env.ADMIN_NAME || "Site Admin").trim();
const rawEmail = (arg("email") || process.env.ADMIN_EMAIL || "").trim();
const email = rawEmail ? rawEmail.toLowerCase() : "";
const FORCE_RESET = process.argv.includes("--force-reset");

if (!/^0\d{10}$/.test(phone)) {
  console.error(`❌ Invalid phone number: "${rawPhone || "(empty)"}" — 11 digits starting with 0 (or 10 digits without the leading zero), e.g. 09121110000.`);
  process.exit(1);
}
if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error(`❌ Invalid email: "${rawEmail}" — e.g. admin@example.com.`);
  process.exit(1);
}
if (password.length < 8) {
  console.error("❌ Password must be at least 8 characters (a strong password is required for the support panel).");
  process.exit(1);
}

function hashPassword(pw) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

/** If the email belongs to another user, it prints an error and returns true. */
async function emailTakenByOther(userId) {
  if (!email) return false;
  const owner = await prisma.user.findUnique({ where: { email }, select: { id: true, phone: true } });
  if (!owner || (userId && owner.id === userId)) return false;
  console.error(`❌ Email "${email}" is already registered for user ${owner.phone} (the User.email column is unique).`);
  process.exitCode = 1;
  return true;
}

try {
  const existingAdmin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true, passwordHash: { not: null } },
  });
  let skip = false;
  if (existingAdmin) {
    const forceSame = FORCE_RESET && existingAdmin.phone === phone;
    if (!forceSame) {
      // ME-3: --force-reset with a different phone number must not end silently with code 0;
      // bootstrap.sh only looks at the exit code and otherwise says "superadmin is ready".
      if (FORCE_RESET) {
        console.error(`❌ --force-reset was given for ${phone} but the existing superadmin is ${existingAdmin.phone} — nothing was changed.`);
        console.error(`   To reset that same existing superadmin: --phone ${existingAdmin.phone}`);
        process.exitCode = 1;
      } else {
        console.log(`ℹ️ An active superadmin already exists (${existingAdmin.phone}). Nothing was changed.`);
        console.log(`   If you lost its password: node scripts/create-admin.mjs --phone ${existingAdmin.phone} --password <new password> --force-reset`);
        // The email is added to that same admin only if requested and it does not conflict with another user.
        if (email && !(await emailTakenByOther(existingAdmin.id))) {
          if (existingAdmin.email !== email) {
            await prisma.user.update({ where: { id: existingAdmin.id }, data: { email } });
            console.log(`   The existing superadmin's email was updated to "${email}".`);
          } else {
            console.log(`   The existing superadmin's email is already "${email}".`);
          }
        }
      }
      skip = true;
    } else {
      console.log("⚠️ --force-reset: the password of the superadmin with this phone number will be overwritten.");
    }
  }

  if (!skip) {
    const current = await prisma.user.findUnique({ where: { phone } });
    if (await emailTakenByOther(current?.id)) {
      // The email belongs to another user; make no changes.
    } else {
      const hash = hashPassword(password);
      let result;
      if (current) {
        result = await prisma.user.update({
          where: { phone },
          data: { role: "ADMIN", passwordHash: hash, isActive: true, verifiedAt: current.verifiedAt ?? new Date(), name: current.name || name, ...(email ? { email } : {}) },
        });
        console.log(`✅ Existing user "${phone}" was upgraded to superadmin.`);
      } else {
        result = await prisma.user.create({
          data: { phone, name, role: "ADMIN", passwordHash: hash, verifiedAt: new Date(), isActive: true, ...(email ? { email } : {}) },
        });
        console.log(`✅ New superadmin created.`);
      }
      console.log(`   Phone: ${result.phone}${email ? `\n   Email: ${email}` : ""}\n   Log in to "Admin login" with the same phone/password.\n   (env: ${envPath ?? "environment variables"})`);
    }
  }
} catch (e) {
  console.error(`❌ Error: ${e?.message ?? e}`);
  process.exitCode = 1;
} finally {
  // LO-6: exiting with process.exit(0) skipped this finally and left the server connection open until timeout
  await prisma.$disconnect();
}
