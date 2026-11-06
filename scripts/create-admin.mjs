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
/** راهنما و پرچم‌های مجاز — قبل از هر کاری (حتی پیش از بررسی DATABASE_URL) */
const KNOWN_FLAGS = ["phone", "password", "name", "force-reset"];
function usage() {
  console.log(`کاربرد: node scripts/create-admin.mjs --phone 09121110000 --password <رمز> [--name "مدیر سایت"] [--force-reset]

  --phone <09xxxxxxxxx>   شمارهٔ سوپرادمین (یا متغیر محیطی ADMIN_PHONE)؛ رقم فارسی
                          و شکل 9xxxxxxxxx (بدون صفر) هم پذیرفته می‌شود
  --password <رمز>        رمز عبور، حداقل ۸ کاراکتر (یا ADMIN_PASSWORD)
  --name <نام>            نام نمایشی (پیش‌فرض: مدیر سایت / ADMIN_NAME)
  --force-reset           بازنویسی رمز سوپرادمینِ همین شماره (فقط با --phone همان شماره)
  --help                  همین راهنما

مثال (رمز از محیط، تا در تاریخچهٔ shell نماند):
  ADMIN_PHONE=09121110000 ADMIN_PASSWORD='MyStr0ng!Pass' node scripts/create-admin.mjs`);
}
const givenFlags = process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")[0]);
if (givenFlags.includes("help") || process.argv.slice(2).includes("-h")) {
  usage();
  process.exit(0);
}
const unknownFlags = givenFlags.filter((f) => f !== "help" && !KNOWN_FLAGS.includes(f));
if (unknownFlags.length) {
  console.error(`❌ پرچم ناشناخته: ${unknownFlags.map((f) => `--${f}`).join(", ")}\n`);
  usage();
  process.exit(1);
}

const envPath = loadEnv();
if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL پیدا نشد — فایل .env کنار مخزن باشد یا متغیر محیطی بدهید.");
  process.exit(1);
}

// ── آرگومان‌ها ──
function arg(name) {
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(`--${name}=`.length);
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
// ME-4: کیبورد فارسی/عربی و شمارهٔ «بدون صفر» همان چیزی است که خودِ OTP
// (auth__otp__request.ts: /^0?9\d{9}$/) می‌پذیرد؛ اینجا هم باید بپذیرد.
const asciiDigits = (s) =>
  s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
const rawPhone = (arg("phone") || process.env.ADMIN_PHONE || "").trim();
let phone = asciiDigits(rawPhone).replace(/\D/g, "");
if (/^9\d{9}$/.test(phone)) phone = `0${phone}`;
const password = arg("password") || process.env.ADMIN_PASSWORD || "";
const name = (arg("name") || process.env.ADMIN_NAME || "مدیر سایت").trim();
const FORCE_RESET = process.argv.includes("--force-reset");

if (!/^0\d{10}$/.test(phone)) {
  console.error(`❌ شماره موبایل معتبر نیست: «${rawPhone || "(خالی)"}» — ۱۱ رقم با 0 (یا ۱۰ رقم بدون صفر)، مثلاً 09121110000.`);
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
  let skip = false;
  if (existingAdmin) {
    const forceSame = FORCE_RESET && existingAdmin.phone === phone;
    if (!forceSame) {
      // ME-3: --force-reset با شمارهٔ دیگر نباید ساکت و با کد ۰ تمام شود؛
      // bootstrap.sh فقط کد خروج را می‌بیند و وگرنه «سوپرادمین آماده است» می‌گوید.
      if (FORCE_RESET) {
        console.error(`❌ --force-reset برای ${phone} داده شد ولی سوپرادمین موجود ${existingAdmin.phone} است — چیزی عوض نشد.`);
        console.error(`   برای بازنشِ همان سوپرادمین موجود: --phone ${existingAdmin.phone}`);
        process.exitCode = 1;
      } else {
        console.log(`ℹ️ سوپرادمین فعال از قبل وجود دارد (${existingAdmin.phone}). چیزی تغییر نکرد.`);
        console.log(`   اگر رمز آن را گم کرده‌اید: node scripts/create-admin.mjs --phone ${existingAdmin.phone} --password <رمز جدید> --force-reset`);
      }
      skip = true;
    } else {
      console.log("⚠️ --force-reset: رمز سوپرادمین همین شماره بازنویسی می‌شود.");
    }
  }

  if (!skip) {
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
  }
} catch (e) {
  console.error(`❌ خطا: ${e?.message ?? e}`);
  process.exitCode = 1;
} finally {
  // LO-6: خروج با process.exit(0) این finally را دور می‌زد و اتصال سرور تا timeout باز می‌ماند
  await prisma.$disconnect();
}
