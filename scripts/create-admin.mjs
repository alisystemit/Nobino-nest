// ساخت اولین سوپرادمین (با موبایل و رمز دلخواه) — برای نصب‌های تازه روی سرور خام
//
//   node scripts/create-admin.mjs --phone 09121110000 --password "MyStr0ng!Pass" [--name "مدیر سایت"]
//
// رفتار:
//   • اگر دیتابیس از قبل کاربر ADMIN فعالِ دارای رمز داشته باشد: فقط پیام می‌دهد و با کد ۰ خارج می‌شود
//     (idempotent — رمز کسی را عوض نمی‌کند). مگر اینکه با --force-reset همان شماره داده شود.
//   • اگر شماره داده‌شده وجود داشته باشد: نقش/رمز همان کاربر ارتقا پیدا می‌کند.
//   • در غیر این صورت کاربر ADMIN تازه می‌سازد.
//   • .env از کنار همین مخزن یا APP_DIR خوانده می‌شود (برای DATABASE_URL).
// رمز با همان الگوریتم backend/src/lib/auth/password.ts هش می‌شود: scrypt:<salt>:<hex>.
// هشدار: رمز را تا می‌توانید از متغیرهای محیطی (ADMIN_PHONE/ADMIN_PASSWORD/ADMIN_NAME)
// بدهید تا در shell history نماند؛ bootstrap.sh خودش امن می‌پرسد.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, scryptSync } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── بارگذاری .env (بدون وابستگی dotenv) ──
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
const envPath = loadEnv();
if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL پیدا نشد — فایل .env کنار مخزن باشد یا متغیر محیطی بدهید.");
  process.exit(1);
}

// ── آرگومان‌ها ──
function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const phone = (arg("phone") || process.env.ADMIN_PHONE || "").trim().replace(/[^\d+]/g, "");
const password = arg("password") || process.env.ADMIN_PASSWORD || "";
const name = (arg("name") || process.env.ADMIN_NAME || "مدیر سایت").trim();

if (!/^0\d{10}$/.test(phone)) {
  console.error(`❌ شماره موبایل معتبر نیست: «${phone}» — فرمت ۱۱ رقمی با 0 (مثلاً 09121110000).`);
  process.exit(1);
}
if (password.length < 8) {
  console.error("❌ رمز باید حداقل ۸ کاراکتر باشد (برای پنل پشتیبانی رمز قوی لازم است).");
  process.exit(1);
}

function hashPassword(pw) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

try {
  const existingAdmin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true, passwordHash: { not: null } },
  });
  if (existingAdmin) {
    const forceSame = process.argv.includes("--force-reset") && existingAdmin.phone === phone;
    if (!forceSame) {
      console.log(`ℹ️ سوپرادمین فعال از قبل وجود دارد (${existingAdmin.phone}). چیزی تغییر نکرد.`);
      console.log(`   اگر رمز آن را گم کرده‌اید: node scripts/create-admin.mjs --phone ${existingAdmin.phone} --password <رمز جدید> --force-reset`);
      process.exit(0);
    }
    console.log("⚠️ --force-reset: رمز سوپرادمین همین شماره بازنویسی می‌شود.");
  }

  const hash = hashPassword(password);
  const current = await prisma.user.findUnique({ where: { phone } });
  let result;
  if (current) {
    result = await prisma.user.update({
      where: { phone },
      data: { role: "ADMIN", passwordHash: hash, isActive: true, verifiedAt: current.verifiedAt ?? new Date(), name: current.name || name },
    });
    console.log(`✅ کاربر موجود «${phone}» به سوپرادمین ارتقا یافت.`);
  } else {
    result = await prisma.user.create({
      data: { phone, name, role: "ADMIN", passwordHash: hash, verifiedAt: new Date(), isActive: true },
    });
    console.log(`✅ سوپرادمین تازه ساخته شد.`);
  }
  console.log(`   شماره: ${result.phone}\n   با همان شماره/رمز در «ورود مدیران» وارد شوید.\n   (env: ${envPath ?? "متغیرهای محیطی"})`);
} catch (e) {
  console.error(`❌ خطا: ${e?.message ?? e}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
