/**
 * prisma/seed.mjs — seed پایه (ادمین، آرایشگر، نماینده، یک سالن و پلن‌های SaaS)
 *
 * اجرا:  npm run seed   (یا: node prisma/seed.mjs)
 * راهنما: node prisma/seed.mjs --help
 * گارد:  روی NODE_ENV=production (هر نگارشی) بدون ALLOW_PROD_SEED=1 اجرا نمی‌شود،
 *        چون ادمین 09120000000 با رمز معلوم Admin@1234 می‌سازد.
 * پرچم‌های مجاز ندارد؛ پرچم ناشناخته با خطا رد می‌شود تا اجرای CI نیمه‌کاره نماند.
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";
import { seedGuard } from "../scripts/lib/seed-guard.mjs";

// ME-12/ME-13/ME-14: همان گارد مشترک seedها، پیش از ساخت PrismaClient
seedGuard(import.meta.url, [], "ادمین 09120000000 با رمز معلوم Admin@1234 می‌سازد");

const prisma = new PrismaClient();

/** هش رمز عبور با scrypt — همان قالب src/lib/auth/password.ts */
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const buf = scryptSync(password, salt, 64);
  return `scrypt:${salt}:${buf.toString("hex")}`;
}

async function main() {
  // ادمین: ایمیل + رمز عبور پیش‌فرض (فقط اگر قبلاً تنظیم نشده باشد)
  const ADMIN_PASSWORD = "Admin@1234";
  let admin = await prisma.user.findUnique({ where: { phone: "09120000000" } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        phone: "09120000000",
        name: "مدیر کل",
        role: "ADMIN",
        verifiedAt: new Date(),
        email: "admin@nobino.ir",
        passwordHash: hashPassword(ADMIN_PASSWORD),
      },
    });
  } else if (!admin.passwordHash) {
    admin = await prisma.user.update({
      where: { phone: "09120000000" },
      data: { passwordHash: hashPassword(ADMIN_PASSWORD), email: admin.email ?? "admin@nobino.ir" },
    });
  }

  const owner = await prisma.user.upsert({
    where: { phone: "09120000001" },
    update: {},
    create: { phone: "09120000001", name: "نگار رضایی", role: "SALON_OWNER", verifiedAt: new Date() },
  });

  const agent = await prisma.user.upsert({
    where: { phone: "09120000002" },
    update: {},
    create: { phone: "09120000002", name: "امیر محمدی", role: "AGENT", verifiedAt: new Date() },
  });

  const salon = await prisma.salon.upsert({
    where: { slug: "mah" },
    update: {},
    create: {
      slug: "mah",
      name: "سالن زیبایی ماه",
      phone: "02188445566",
      city: "تهران",
      address: "تهران، سعادت‌آباد، بلوار دریا",
      description: "سالن زیبایی تخصصی با کادری مجرب در زمینه مو، پوست و ناخن.",
      coverColor: "#ec4899",
      // تصویرهای نمونه داخل ریپو (public/seed) هستند، پس روی سرور تازه هم لود می‌شوند.
      logoUrl: "/seed/mah-logo.svg",
      bannerUrl: "/seed/mah-banner.svg",
      ownerId: owner.id,
      isApproved: true,
      isActive: true,
    },
  });

  const services = [
    { name: "کوتاهی مو", durationMin: 30, price: 250000 },
    { name: "رنگ مو", durationMin: 120, price: 1200000 },
    { name: "کاشت ناخن", durationMin: 90, price: 900000 },
    { name: "میکاپ", durationMin: 60, price: 800000 },
    { name: "پاکسازی پوست", durationMin: 45, price: 600000 },
    { name: "لمینت مژه", durationMin: 40, price: 500000 },
  ];
  for (const s of services) {
    await prisma.service.upsert({
      where: { id: `${salon.id}-${s.name}` },
      update: {},
      create: { id: `${salon.id}-${s.name}`, salonId: salon.id, ...s },
    });
  }

  // شعبه پیش‌فرض
  await prisma.branch.upsert({
    where: { id: `${salon.id}-branch-main` },
    update: {},
    create: { id: `${salon.id}-branch-main`, salonId: salon.id, name: "شعبه اصلی", city: "تهران", address: salon.address },
  });

  for (let d = 0; d < 7; d++) {
    await prisma.openingHour.upsert({
      where: { salonId_dayOfWeek: { salonId: salon.id, dayOfWeek: d } },
      update: {},
      create: { salonId: salon.id, dayOfWeek: d, openTime: "09:00", closeTime: "21:00" },
    });
  }

  const gallery = [
    { title: "استایل مو", imageUrl: "/gallery/hair.svg" },
    { title: "میکاپ عروس", imageUrl: "/gallery/makeup.svg" },
    { title: "ناخن", imageUrl: "/gallery/nails.svg" },
  ];
  for (const [i, g] of gallery.entries()) {
    await prisma.galleryItem.upsert({
      where: { id: `${salon.id}-${i}` },
      update: {},
      create: { id: `${salon.id}-${i}`, salonId: salon.id, ...g, sortOrder: i },
    });
  }

  // ماژول‌ها با کلید از کاتالوگ سامانه (src/lib/plans/modules.ts) انتخاب می‌شوند؛
  // برچسب سقف‌ها (کارمند/شعبه/خدمت/مشتری/پیامک/سالن) هنگام نمایش از محدودیت زندهٔ
  // همان پلن ساخته می‌شود (src/lib/plans/limit-defs.ts + limits-data.ts).
  const packages = [
    {
      id: "pkg-0", name: "پلن پایه", plan: "BASIC", durationDays: 30, price: 990000, yearlyPrice: 9900000,
      features: [
        { key: "booking" }, { key: "staff" }, { key: "branches" }, { key: "services" },
        { key: "customers" }, { key: "smsQuota" }, { key: "salons" }, { key: "voiceBooking" },
        { key: "smsReminders" }, { key: "webapp" }, { key: "gallery" }, { key: "reviews" },
      ],
    },
    {
      id: "pkg-1", name: "پلن حرفه‌ای", plan: "PRO", durationDays: 30, price: 1890000, yearlyPrice: 18900000,
      features: [
        { key: "booking" }, { key: "staff" }, { key: "branches" }, { key: "services" },
        { key: "customers" }, { key: "smsQuota" }, { key: "salons" }, { key: "voiceBooking" },
        { key: "smsReminders" }, { key: "webapp" }, { key: "csvExport" }, { key: "customDomain" },
        { key: "api" }, { key: "gallery" }, { key: "reviews" }, { key: "campaigns" },
        { key: "waitlist" }, { key: "wallet" }, { key: "invoices" }, { key: "loyalty" },
      ],
    },
    {
      id: "pkg-2", name: "پلن سازمانی", plan: "ENTERPRISE", durationDays: 30, price: 3290000, yearlyPrice: 32900000,
      features: [
        { key: "booking" }, { key: "staff" }, { key: "branches" }, { key: "services" },
        { key: "customers" }, { key: "smsQuota" }, { key: "salons" }, { key: "voiceBooking" },
        { key: "smsReminders" }, { key: "webapp" }, { key: "csvExport" }, { key: "customDomain" },
        { key: "api" }, { key: "gallery" }, { key: "reviews" }, { key: "campaigns" },
        { key: "waitlist" }, { key: "wallet" }, { key: "invoices" }, { key: "loyalty" }, { key: "support" },
      ],
    },
  ];
  for (const p of packages) {
    await prisma.package.upsert({
      where: { id: p.id },
      update: { plan: p.plan, durationDays: p.durationDays, price: p.price, yearlyPrice: p.yearlyPrice, features: p.features },
      create: { id: p.id, name: p.name, plan: p.plan, durationDays: p.durationDays, price: p.price, yearlyPrice: p.yearlyPrice, features: p.features },
    });
  }

  await prisma.commissionPlan.upsert({
    where: { agentId_salonId: { agentId: agent.id, salonId: salon.id } },
    update: {},
    create: { agentId: agent.id, salonId: salon.id, percent: 20 },
  });

  for (const ownerId of [owner.id, agent.id, admin.id]) {
    await prisma.wallet.upsert({ where: { ownerId }, update: {}, create: { ownerId } });
  }

  // ─── تنظیمات پیش‌فرض سیستم (پویا) ─────────────────────────────────────
  const defaultSettings = [
    { key: "sms.active_provider", value: "kavenegar", group: "sms", type: "select", options: JSON.stringify(["kavenegar", "smsdotir", "farazsms", "ghasedak", "melipayamak", "iransms", "payamresan", "nakalaya", "mobilesms", "arpano"]), description: "سرویس پیامک فعال" },
    { key: "sms.show_sent_codes", value: "false", group: "sms", type: "select", options: JSON.stringify(["true", "false"]), description: "نمایش کد پیامک/ایمیل ارسال‌شده در صفحه ورود (فقط تست؛ در production بدون OTP_DISPLAY_ALLOW_PRODUCTION=true بی‌اثر است)" },
    { key: "payments.default_gateway", value: "sandbox", group: "payments", type: "select", options: JSON.stringify(["sandbox", "zarinpal", "mellat", "saman", "parsian", "pasargad", "asanpardakht", "irankish", "sadad", "maban", "cetab", "pardakhtnet", "psp", "nextpay", "vanak", "behpardakht", "payir", "zibal", "idpay", "amanat"]), description: "درگاه پرداخت پیش‌فرض" },
    { key: "voice.provider", value: "mock", group: "voice", type: "select", options: JSON.stringify(["mock", "openai"]), description: "موتور تبدیل گفتار به متن" },
    { key: "general.announcement", value: "", group: "general", type: "string", description: "اعلان سراسری (در صفحه اصلی نمایش داده می‌شود)" },
    { key: "sms.template.confirm", value: "نوبت شما در «{salon}» برای ساعت {time} ثبت شد. (تأیید: {code})", group: "sms", type: "string", description: "قالب پیامک تأیید نوبت" },
    { key: "sms.template.reminder", value: "یادآوری: نوبت شما در «{salon}» رأس ساعت {time} است.", group: "sms", type: "string", description: "قالب پیامک یادآوری" },
    { key: "sms.template.cancel", value: "نوبت شما در «{salon}» لغو شد.", group: "sms", type: "string", description: "قالب پیامک لغو نوبت" },
    { key: "email.smtp_host", value: "", group: "email", type: "string", description: "هاست SMTP (ایمیل)" },
    { key: "email.smtp_port", value: "587", group: "email", type: "string", description: "پورت SMTP" },
    { key: "email.smtp_user", value: "", group: "email", type: "string", description: "نام کاربری SMTP" },
    { key: "email.smtp_pass", value: "", group: "email", type: "secret", description: "رمز SMTP" },
    { key: "email.from", value: "noreply@nobino.ir", group: "email", type: "string", description: "آدرس فرستنده ایمیل" },
    { key: "openai.api_key", value: "", group: "ai", type: "secret", description: "کلید OpenAI برای قابلیت‌های هوش مصنوعی" },
    { key: "stt.openai.key", value: "", group: "ai", type: "secret", description: "کلید OpenAI برای Whisper (STT)" },
    { key: "stt.groq.key", value: "", group: "ai", type: "secret", description: "کلید Groq برای Whisper رایگان (STT)" },
    { key: "stt.huggingface.key", value: "", group: "ai", type: "secret", description: "توکن HuggingFace برای Whisper رایگان (STT)" },
    { key: "stt.cloudflare.key", value: "", group: "ai", type: "secret", description: "توکن Cloudflare Workers AI (STT رایگان)" },
    { key: "stt.cloudflare.account", value: "", group: "ai", type: "string", description: "Account ID کلادفلر برای Workers AI" },
    { key: "stt.deepgram.key", value: "", group: "ai", type: "secret", description: "کلید Deepgram (STT با اعتبار رایگان)" },
    { key: "stt.local.enabled", value: "true", group: "ai", type: "select", options: JSON.stringify(["true", "false"]), description: "موتور ASR محلی Shenava (sherpa-onnx) فعال باشد" },
    { key: "stt.local.model_dir", value: "", group: "ai", type: "string", description: "پوشهٔ مدل sherpa-onnx (خالی = models/shenava-koochik-v1.0-sherpa-onnx)" },
    { key: "stt.local.num_threads", value: "2", group: "ai", type: "string", description: "تعداد ترد CPU برای مدل محلی" },
    { key: "stt.local.ffmpeg", value: "", group: "ai", type: "string", description: "مسیر ffmpeg (خالی = ffmpeg-static یا PATH)" },
    { key: "stt.order", value: "local,groq,huggingface,cloudflare,deepgram,openai", group: "ai", type: "string", description: "ترتیب تلاش ربات‌های STT (با کاما)" },
    { key: "ai.enabled", value: "true", group: "ai", type: "select", options: JSON.stringify(["true", "false"]), description: "فعال‌سازی قابلیت‌های AI" },
    { key: "ai.provider", value: "", group: "ai", type: "select", options: JSON.stringify(["", "openai", "groq", "deepseek", "custom"]), description: "سرویس‌دهندهٔ متن (خالی = خودکار)" },
    { key: "ai.model", value: "", group: "ai", type: "string", description: "مدل سرویس متن (خالی = پیش‌فرض سرویس)" },
    { key: "ai.deepseek.key", value: "", group: "ai", type: "secret", description: "کلید DeepSeek برای هوش مصنوعی" },
    { key: "ai.custom.key", value: "", group: "ai", type: "secret", description: "کلید سرویس سفارشی/محلی (سازگار با OpenAI)" },
    { key: "ai.custom.base_url", value: "", group: "ai", type: "string", description: "آدرس سرویس سفارشی (مثلاً http://localhost:11434/v1)" },
    // سقف‌های پلن (کارکنان/شعبه/…) در src/lib/plans/limits-data.ts تعریف می‌شوند و
    // از طریق پنل محدودیت‌های /admin قابل تغییر‌اند. seed عمداً هیچ کلید
    // plan.limit.<PLAN>.<key> نمی‌سازد تا ماتریس پنل «پیش‌فرض» بماند.
  ];
  for (const s of defaultSettings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }

  // نصب‌های قدیمی stt.order را روی مقدار پیش‌فرضِ قبلی دارند (بدون local). فقط
  // وقتی مقدار دست‌نخورده است ارتقا می‌دهیم تا ترتیب سلیقه‌ای ادمین حفظ شود.
  await prisma.setting.updateMany({
    where: { key: "stt.order", value: "groq,huggingface,cloudflare,deepgram,openai" },
    data: { value: "local,groq,huggingface,cloudflare,deepgram,openai" },
  });

  // مهاجرت کلید قدیمی «plan.limit.<key>» (بدون نام پلن، یک عدد برای همهٔ پلن‌ها) به
  // کلید اختصاصی هر پلن، تا رفتار نصب‌های قدیمی حفظ شود و بعد از بین برود.
  const PLANS = ["FREE", "BASIC", "PRO", "ENTERPRISE"];
  const limitRows = await prisma.setting.findMany({ where: { key: { startsWith: "plan.limit." } } });
  for (const row of limitRows) {
    const name = row.key.slice("plan.limit.".length);
    if (!name || name.includes(".") || !row.value) continue;
    for (const plan of PLANS) {
      const scopedKey = `plan.limit.${plan}.${name}`;
      if (await prisma.setting.findUnique({ where: { key: scopedKey }, select: { id: true } })) continue;
      await prisma.setting.create({
        data: {
          key: scopedKey,
          value: row.value,
          group: "plans",
          type: row.value === "true" || row.value === "false" ? "boolean" : "number",
          description: `${name} — پلن ${plan} (منتقل‌شده از تنظیم قدیمی)`,
        },
      });
    }
    await prisma.setting.delete({ where: { key: row.key } });
    console.log(`   ↪️ کلید قدیمی ${row.key} به سقف اختصاصی ۴ پلن منتقل شد`);
  }

  console.log("✅ Seed کامل شد");
  console.log("   ادمین   : 09120000000 (رمز پیش‌فرض: Admin@1234 — ایمیل admin@nobino.ir)");
  console.log("   آرایشگر : 09120000001");
  console.log("   نماینده : 09120000002");
  console.log("   سالن    : /s/mah");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
