#!/usr/bin/env node
/**
 * Stress Seed — تزریق حجم بالا (۲۵۰ رکورد به‌ازای هر جدول)
 *
 * هدف: پیدا کردن بخش‌هایی از دیتابیس که زیر بار دیتا باگ دارند
 *       (بیشینه‌شدن تعداد، خطای یکتایی، رابطه، یا رفتارهای غیرمنتظره).
 *
 * ویژگی‌ها:
 *  - افزودنی (additive): فقط تا رسیدن شمار هر جدول به ۲۵۰ می‌سازد؛
 *    دیتای دموی موجود حذف نمی‌شود و اجرای مجدد امن است.
 *  - هر جدول جداگانه امتحان می‌شود؛ اگر خطایی رخ دهد، نام همان جدول
 *    و دلیل خطا چاپ می‌شود و اجرای بقیه ادامه می‌یابد.
 *  - برای کلیدهای یکتا (slug/code/phone/email/...) پیشوند stress- و
 *    شماره‌های بالا استفاده می‌شود تا با دیتای قبلی برخورد نکند.
 *
 * اجرا:  node scripts/seed-stress.mjs
 * پاک‌سازی تنظیمات:  node scripts/seed-stress.mjs --clean-settings --yes
 *   فقط ردیف‌های Setting با کلید stress.key.* را می‌برد (همان‌ها که در پنل ادمین
 *   به‌عنوان «تنظیم» مزاحم می‌شوند — A7). بقیهٔ دیتای استرس عمداً حذف نمی‌شود؛
 *   جدول‌ها به هم وابسته‌اند و پاک‌شان کردن باید با آگاهی و دستی باشد.
 *   پرچم صریح --yes لازم است؛ بدون آن فقط شمار ردیف‌ها گزارش می‌شود.
 * راهنما: node scripts/seed-stress.mjs --help
 * گارد:  روی NODE_ENV=production (هر نگارشی) بدون ALLOW_PROD_SEED=1 اجرا نمی‌شود —
 *        این اسکریپت ۲۵۰ رکورد در **هر** جدول می‌سازد و روی سرور واقعی فاجعه است.
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes, randomInt } from "node:crypto";
import { seedGuard } from "./lib/seed-guard.mjs";

// HI-9/ME-12/ME-13/ME-14: گارد مشترک، پیش از ساخت PrismaClient
const { has } = seedGuard(
  import.meta.url,
  ["--clean-settings", "--yes"],
  "۲۵۰ رکورد در **هر** جدول می‌سازد و حجم کاتالوگ پروداکشن را چند صد برابر می‌کند"
);
const YES = has("--yes");
const CLEAN_SETTINGS = has("--clean-settings");

const prisma = new PrismaClient();
const TARGET = 250;

/** A7: پاک‌سازی ردیف‌های تنظیمِ ساخته‌شده توسط همین اسکریپت — فقط با تأیید صریح */
async function cleanSettings() {
  if (!YES) {
    const found = await prisma.setting.count({ where: { key: { startsWith: "stress.key." } } });
    console.error(`🛑 ${found} ردیف Setting با کلید stress.key.* حذف خواهد شد.`);
    console.error("   تأیید صریح لازم است: node scripts/seed-stress.mjs --clean-settings --yes");
    process.exitCode = 1;
    return;
  }
  const r = await prisma.setting.deleteMany({ where: { key: { startsWith: "stress.key." } } });
  const left = await prisma.setting.count();
  console.log(`🧹 ${r.count} ردیف استرس از جدول Setting حذف شد؛ ${left} ردیف باقی مانده است.`);
  if (r.count === 0) console.log("   (ردیفی با کلید stress.key.* پیدا نشد — چیزی برای پاک‌کردن نبود.)");
}

const rand = (min, max) => randomInt(min, max + 1);
const pick = (arr) => arr[rand(0, arr.length - 1)];
const pad = (n) => String(n).padStart(2, "0");
const hhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const future = (days = 30) => new Date(Date.now() + days * 86400000);

const failures = [];

/** mk 250 رکورد (یا کمتر، اگر از قبل رسیده باشد) به یک جدول. */
async function ensure(model, makeRow) {
  const cur = await prisma[model].count();
  const need = TARGET - cur;
  if (need <= 0) return 0;
  const rows = [];
  for (let i = 0; i < need; i++) rows.push(makeRow(i));
  try {
    await prisma[model].createMany({ data: rows });
    return need;
  } catch (e) {
    const msg = e.message.split("\n")[0] || e.message;
    failures.push(`${model}: ${msg}`);
    console.error(`  ✗ ${model}  (createMany failed: ${msg})`);
    // بازگشت به ساخت تکی تا رکورد مشکل‌دار دقیق مشخص شود (فقط ۵ نمونه چاپ می‌شود)
    let ok = 0;
    let logged = 0;
    for (const r of rows) {
      try {
        await prisma[model].create({ data: r });
        ok++;
      } catch (e2) {
        const m2 = e2.message.split("\n")[0] || e2.message;
        failures.push(`${model} > row: ${m2}`);
        if (logged < 5) {
          console.error(`     row-fail ${model}: ${m2}`);
          logged++;
        }
      }
    }
    if (rows.length - ok > logged) console.error(`     ... و ${rows.length - ok - logged} رکورد دیگر ناکام`);
    return ok;
  }
}

// ─── جمعیت‌های پایه (poolها) ──────────────────────────────────────────
let users = [];
let salons = [];
let branches = [];
let services = [];
let staffList = [];
let packages = [];

const FIR = ["نگار", "امیر", "سارا", "رضا", "لیلا", "مهدی", "نازنین", "علی", "مهسا", "حسین", "پریسا", "کیان", "الهام", "بهراد", "صدف", "آرمان", "مریم", "فرهاد", "بهاره", "سام", "شیوا", "امید", "ترانه", "آیدا", "پروین", "کامران", "شیرین"];
const LAST = ["رضایی", "محمدی", "احمدی", "کریمی", "حسینی", "موسوی", "جعفری", "صادقی", "رحیمی", "نادری", "قاسمی", "توکلی", "شفیعی", "عباسی", "مظفری"];
const APPT_STATUS = ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];
const CHANNEL = ["MANUAL", "WEBAPP", "VOICE"];
const TX_REASON = ["PACKAGE_PURCHASE", "COMMISSION_EARNING", "COMMISSION_PAYOUT", "PAYOUT", "REFUND", "ADMIN_ADJUSTMENT"];
const PAYOUT_STATUS = ["REQUESTED", "PROCESSING", "PAID", "REJECTED"];
const TK_STATUS = ["OPEN", "IN_PROGRESS", "CLOSED"];

async function main() {
  if (CLEAN_SETTINGS) {
    await cleanSettings();
    return;
  }
  console.log("🚀 شروع تزریق حجم بالا (استرس) — هدف: ۲۵۰ رکورد در هر جدول\n");

  // ── ۱) کاربران ─────────────────────────────────────────────────────
  {
    const phStart = 300000;
    const need = await ensure("user", (i) => {
      const role = i % 10 === 0 ? "SALON_OWNER" : "CUSTOMER";
      return {
        phone: `0999${String(phStart + i)}`,
        name: `${pick(FIR)} ${pick(LAST)}`,
        email: null,
        role,
        verifiedAt: new Date(),
        isActive: true,
        loyaltyPoints: rand(0, 500),
      };
    });
    console.log(`   ✅ user: +${need}`);
    users = await prisma.user.findMany({ orderBy: { id: "asc" } });
  }

  // ── ۲) سالن‌ها ─────────────────────────────────────────────────────
  {
    const owners = users.filter((u) => u.role === "SALON_OWNER");
    if (!owners.length) throw new Error("هیچ مالکی برای سالن وجود ندارد");
    const need = await ensure("salon", (i) => {
      const owner = owners[i % owners.length];
      return {
        slug: `stress-salon-${1000 + i}`,
        name: `سالن استرس ${i + 1}`,
        phone: `0${String(21 + (i % 40)).padStart(2, "0")}${String(1000000 + i).slice(-7)}`,
        city: pick(["تهران", "اصفهان", "شیراز", "مشهد", "تبریز", "کرج", "رشت"]),
        address: `خیابان ${pick(FIR)}، پلاک ${100 + i}`,
        description: "سالن نمونه برای تست بار دیتا",
        coverColor: pick(["#f472b6", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981"]),
        ownerId: owner.id,
        isApproved: true,
        isActive: true,
        plan: pick(["FREE", "BASIC", "PRO", "ENTERPRISE"]),
        minNoticeMinutes: rand(30, 120),
        maxAdvanceDays: rand(14, 60),
        cancelDeadlineHours: rand(6, 48),
        bufferMinutes: rand(0, 30),
      };
    });
    console.log(`   ✅ salon: +${need}`);
    salons = await prisma.salon.findMany({ orderBy: { id: "asc" } });
  }

  // ── ۳) شعبه / خدمات / کارکنان / بسته ──────────────────────────────
  {
    const needBr = await ensure("branch", (i) => {
      const s = salons[i % salons.length];
      return { salonId: s.id, name: `شعبه ${i + 1}`, city: s.city, address: s.address, phone: s.phone, isActive: i % 5 !== 0 };
    });
    console.log(`   ✅ branch: +${needBr}`);
    branches = await prisma.branch.findMany({ orderBy: { id: "asc" } });

    const needSvc = await ensure("service", (i) => {
      const s = salons[i % salons.length];
      const b = branches[i % branches.length];
      return {
        salonId: s.id,
        branchId: b.id,
        name: `خدمت ${i + 1}`,
        durationMin: rand(15, 240),
        price: rand(150000, 2500000),
        category: pick(["مو", "ناخن", "پوست", "میکاپ"]),
        bufferMin: rand(0, 15),
        isActive: true,
      };
    });
    console.log(`   ✅ service: +${needSvc}`);
    services = await prisma.service.findMany({ orderBy: { id: "asc" } });

    const roles = ["OWNER", "MANAGER", "RECEPTION", "STYLIST", "STYLIST"];
    const titles = ["آرایشگر ارشد", "مدیر سالن", "مسئول پذیرش", "آرایشگر", "متخصص ناخن"];
    const needSt = await ensure("staff", (i) => {
      const s = salons[i % salons.length];
      const b = branches[i % branches.length];
      return {
        salonId: s.id,
        branchId: b.id,
        name: `${pick(FIR)} ${pick(LAST)}`,
        title: titles[i % titles.length],
        role: roles[i % roles.length],
        commissionPercent: rand(0, 30),
        specialties: [pick(["مو", "ناخن", "میکاپ", "پوست"])],
        schedule: Array.from({ length: 7 }, (_, day) => ({ day, open: "09:00", close: "21:00", isClosed: false })),
        isActive: true,
      };
    });
    console.log(`   ✅ staff: +${needSt}`);
    staffList = await prisma.staff.findMany({ orderBy: { id: "asc" } });

    const needPkg = await ensure("package", (i) => ({
      name: `بسته استرس ${i + 1}`,
      description: "بسته تست",
      plan: pick(["BASIC", "PRO", "ENTERPRISE"]),
      price: rand(500000, 5000000),
      yearlyPrice: rand(5000000, 50000000),
      durationDays: pick([30, 90, 365]),
      features: { slots: rand(10, 100) },
      isActive: true,
    }));
    console.log(`   ✅ package: +${needPkg}`);
    packages = await prisma.package.findMany({ orderBy: { id: "asc" } });
  }

  // ── ۴) کیف پول ─────────────────────────────────────────────────────
  {
    const existingOwner = new Set((await prisma.wallet.findMany({ select: { ownerId: true } })).map((w) => w.ownerId));
    const noWallet = users.filter((u) => !existingOwner.has(u.id)).slice(0, TARGET);
    if (noWallet.length) {
      try {
        await prisma.wallet.createMany({ data: noWallet.map((u) => ({ ownerId: u.id })) });
        console.log(`   ✅ wallet: +${noWallet.length}`);
      } catch (e) {
        failures.push(`wallet: ${e.message.split("\n")[0]}`);
        console.error(`  ✗ wallet: ${e.message.split("\n")[0]}`);
      }
    }
  }
  const wallets = await prisma.wallet.findMany({ orderBy: { id: "asc" } });

  // ── ۵) تراکنش / برداشت ────────────────────────────────────────────
  {
    const need = await ensure("transaction", (i) => {
      const w = wallets[i % wallets.length];
      const credit = i % 2 === 0;
      return {
        walletId: w.id,
        kind: credit ? "CREDIT" : "DEBIT",
        reason: pick(TX_REASON),
        amount: rand(100000, 2000000),
        balanceAfter: rand(0, 10000000),
        description: credit ? "درآمد" : "برداشت",
      };
    });
    console.log(`   ✅ transaction: +${need}`);

    const needPo = await ensure("payout", (i) => {
      const w = wallets[i % wallets.length];
      return {
        walletId: w.id,
        amount: rand(200000, 2000000),
        method: pick(["BANK", "CARD", "SMS"]),
        bankInfo: "IR...",
        status: pick(PAYOUT_STATUS),
        processedAt: i % 2 ? future(-1) : null,
      };
    });
    console.log(`   ✅ payout: +${needPo}`);
  }

  // ── ۶) Otp / Session ──────────────────────────────────────────────
  {
    const needO = await ensure("otp", (i) => {
      const u = users[i % users.length];
      return { phone: u.phone, code: String(rand(100000, 999999)), purpose: "LOGIN", expiresAt: new Date(Date.now() + 5 * 60000), attempts: 0 };
    });
    console.log(`   ✅ otp: +${needO}`);

    const needS = await ensure("session", (i) => {
      const u = users[i % users.length];
      return { userId: u.id, tokenHash: randomBytes(24).toString("hex"), expiresAt: future(7), device: "stress-device", ip: `192.168.${i % 255}.${(i * 7) % 255}` };
    });
    console.log(`   ✅ session: +${needS}`);
  }

  // ── ۷) ساعات کاری / تعطیلات / گالری / بلوک زمانی / صندوق ──────────
  {
    // ساعات کاری فقط روی سالن‌های تازه (شاخص >= 8) تا با دمو برخورد نکند
    const newSalons = salons.slice(8);
    const needOH = await ensure("openingHour", (i) => {
      const s = newSalons[Math.floor(i / 7) % newSalons.length];
      return { salonId: s.id, dayOfWeek: i % 7, openTime: "09:00", closeTime: "21:00", isClosed: false };
    });
    console.log(`   ✅ openingHour: +${needOH}`);

    const needH = await ensure("holiday", (i) => {
      const s = salons[i % salons.length];
      const b = branches[i % branches.length];
      const d = new Date(Date.now() + (10 + i % 60) * 86400000);
      return { salonId: s.id, branchId: b.id, date: d, isClosed: true, openTime: null, closeTime: null, reason: pick(["تعمیرات", "تعطیلی رسمی", "جشن سالن"]) };
    });
    console.log(`   ✅ holiday: +${needH}`);

    const needG = await ensure("galleryItem", (i) => {
      const s = salons[i % salons.length];
      return { salonId: s.id, title: `گالری ${i + 1}`, imageUrl: `/gallery/${pick(["hair", "makeup", "nails", "skin"])}.svg`, type: "image", sortOrder: i % 10 };
    });
    console.log(`   ✅ galleryItem: +${needG}`);

    const needT = await ensure("timeBlock", (i) => {
      const s = salons[i % salons.length];
      const st = staffList[i % staffList.length];
      const b = branches[i % branches.length];
      const start = new Date(Date.now() + (3 + i % 14) * 86400000);
      start.setHours(10, 0, 0, 0);
      const end = new Date(start.getTime() + 90 * 60000);
      return { salonId: s.id, branchId: b.id, staffId: st.id, startAt: start, endAt: end, reason: i % 3 === 0 ? "مرخصی" : null };
    });
    console.log(`   ✅ timeBlock: +${needT}`);

    const needC = await ensure("cashRegisterEntry", (i) => {
      const s = salons[i % salons.length];
      const b = branches[i % branches.length];
      return {
        salonId: s.id,
        branchId: b.id,
        date: new Date(Date.now() - (i % 30) * 86400000),
        cashAmount: rand(0, 3000000),
        cardAmount: rand(0, 4000000),
        onlineAmount: rand(0, 2000000),
        expenseAmount: rand(0, 800000),
        note: pick(["واریز روزانه", "هزینه خرید", "پرداخت اجاره"]),
      };
    });
    console.log(`   ✅ cashRegisterEntry: +${needC}`);
  }

  // ── ۸) CRM مشتریان سالن ────────────────────────────────────────────
  let salonCustomers = [];
  {
    const newSalons = salons.slice(8);
    const need = await ensure("salonCustomer", (i) => {
      const s = newSalons[i % newSalons.length];
      const name = `${pick(FIR)} ${pick(LAST)}`;
      return {
        salonId: s.id,
        phone: `0998${String(400000 + i)}`,
        name,
        firstName: name.split(" ")[0],
        lastName: name.split(" ")[1],
        visits: rand(0, 40),
        spend: rand(0, 10000000),
        lastVisitAt: new Date(Date.now() - rand(0, 90) * 86400000),
        tags: [pick(["VIP", "وفادار", "جدید"]), pick(["مو", "ناخن", "پوست"])],
      };
    });
    console.log(`   ✅ salonCustomer: +${need}`);
    salonCustomers = await prisma.salonCustomer.findMany({ orderBy: { id: "asc" } });

    const needNote = await ensure("salonCustomerNote", (i) => {
      const c = salonCustomers[i % salonCustomers.length];
      return { customerId: c.id, note: `یادداشت استرس ${i + 1}`, createdAt: new Date(Date.now() - (i % 30) * 86400000) };
    });
    console.log(`   ✅ salonCustomerNote: +${needNote}`);

    const needMed = await ensure("salonCustomerMedia", (i) => {
      const s = salons[i % salons.length];
      const c = salonCustomers[i % salonCustomers.length];
      return { salonId: s.id, customerId: c.id, type: pick(["photo", "voice"]), url: `/gallery/${pick(["hair", "makeup", "nails"])}.svg`, name: "تصویر", mimeType: "image/svg+xml", size: rand(1000, 500000) };
    });
    console.log(`   ✅ salonCustomerMedia: +${needMed}`);
  }

  // ── ۹) نوبت‌ها و تماس صوتی ────────────────────────────────────────
  {
    const need = await ensure("appointment", (i) => {
      const s = salons[i % salons.length];
      const svc = services[i % services.length];
      const st = staffList[i % staffList.length];
      const b = branches[i % branches.length];
      const cu = users[i % users.length];
      const start = new Date(Date.now() + (i % 30) * 86400000);
      start.setHours(rand(9, 19), rand(0, 50), 0, 0);
      const end = new Date(start.getTime() + svc.durationMin * 60000);
      const status = pick(APPT_STATUS);
      return {
        salonId: s.id,
        serviceId: svc.id,
        branchId: b.id,
        employeeId: st.id,
        customerId: cu.id,
        customerName: cu.name || "مشتری",
        customerPhone: cu.phone,
        startAt: start,
        endAt: end,
        status,
        channel: pick(CHANNEL),
        note: status === "CANCELLED" ? "لغو توسط مشتری" : null,
        depositAmount: i % 2 ? rand(100000, 500000) : null,
        depositPaid: i % 4 === 0,
      };
    });
    console.log(`   ✅ appointment: +${need}`);

    const needV = await ensure("voiceCall", (i) => {
      const s = salons[i % salons.length];
      return { salonId: s.id, durationSec: rand(15, 300), transcript: "می‌خواستم برای شنبه نوبت بگیرم.", rawText: "نوبت شنبه", status: pick(["DONE", "CONFIRMED", "FAILED"]), error: null };
    });
    console.log(`   ✅ voiceCall: +${needV}`);

    const needW = await ensure("waitlistEntry", (i) => {
      const s = salons[i % salons.length];
      const svc = services[i % services.length];
      const st = staffList[i % staffList.length];
      const cu = users[i % users.length];
      return { salonId: s.id, serviceId: svc.id, employeeId: st.id, customerName: cu.name || "مشتری", customerPhone: cu.phone, note: "وقت خالی", status: pick(["WAITING", "NOTIFIED", "BOOKED", "EXPIRED"]), notifiedAt: i % 3 === 0 ? new Date() : null };
    });
    console.log(`   ✅ waitlistEntry: +${needW}`);
  }

  // ── ۱۰) کمیسیون / اشتراک / فاکتور / سفارش / پرداخت ────────────────
  {
    const agent = users.find((u) => u.role === "AGENT") || users[0];
    // سالن‌های متمایز (شاخص ۵ به بعد) تا با پلن کمیسیون دمو (سالن ۰..۳) برخورد نکند
    const needC = await ensure("commissionPlan", (i) => {
      const s = salons[(i + 5) % salons.length];
      return { agentId: agent.id, salonId: s.id, percent: rand(5, 30), isActive: true };
    });
    console.log(`   ✅ commissionPlan: +${needC}`);

    const needSub = await ensure("subscription", (i) => {
      const s = salons[i % salons.length];
      const pkg = packages[i % packages.length];
      const starts = new Date(Date.now() - (i % 60) * 86400000);
      return { salonId: s.id, packageId: pkg.id, startsAt: starts, endsAt: new Date(starts.getTime() + pkg.durationDays * 86400000), period: i % 2 ? "YEARLY" : "MONTHLY", autoRenew: true, status: "ACTIVE" };
    });
    console.log(`   ✅ subscription: +${needSub}`);
    const subscriptions = await prisma.subscription.findMany({ orderBy: { id: "asc" } });

    const needInv = await ensure("invoice", (i) => {
      const s = salons[i % salons.length];
      const sub = subscriptions[i % subscriptions.length];
      const amount = rand(990000, 5000000);
      return { number: `STRESS-INV-${1000 + i}`, salonId: s.id, subscriptionId: sub.id, kind: "SUBSCRIPTION", customerName: s.name, customerPhone: s.phone, amount, status: pick(["PAID", "PENDING"]), issuedAt: new Date(Date.now() - (i % 60) * 86400000) };
    });
    console.log(`   ✅ invoice: +${needInv}`);

    const needOrd = await ensure("order", (i) => {
      const u = users[i % users.length];
      const pkg = packages[i % packages.length];
      const amount = pkg.price;
      return { userId: u.id, packageId: pkg.id, amount, originalAmount: amount + rand(0, 500000), period: i % 2 ? "YEARLY" : "MONTHLY", autoRenew: i % 3 === 0, status: pick(["PAID", "PENDING"]) };
    });
    console.log(`   ✅ order: +${needOrd}`);
    const orders = await prisma.order.findMany({ orderBy: { id: "asc" } });

    const needPay = await ensure("payment", (i) => {
      const o = orders[i % orders.length];
      return { orderId: o.id, gateway: "sandbox", amount: o.amount, status: pick(["PAID", "PENDING", "FAILED"]), authority: `A${100000 + i}`, refId: `REF${200000 + i}`, cardPan: "6219-****-****-0000", callbackUrl: "http://localhost:3100/api/payments/callback" };
    });
    console.log(`   ✅ payment: +${needPay}`);
  }

  // ── ۱۱) کمپین / هدیه / تخفیف / Webhook ────────────────────────────
  let webhookConfigs = [];
  {
    const needCamp = await ensure("campaign", (i) => {
      const s = salons[i % salons.length];
      return { salonId: s.id, name: `کمپین ${i + 1}`, channel: "SMS", segment: pick(["ALL", "RETURNING"]), message: `پیام کمپین ${i + 1}`, status: pick(["DRAFT", "SENT", "SCHEDULED"]), scheduledAt: i % 3 === 0 ? future(2) : null, sentAt: i % 3 === 1 ? future(-1) : null, sentCount: rand(0, 500) };
    });
    console.log(`   ✅ campaign: +${needCamp}`);

    const needGc = await ensure("giftCard", (i) => {
      const u = users[i % users.length];
      return { code: `STRESS-GC-${1000 + i}`, balance: rand(100000, 2000000), ownerId: u.id, salonId: salons[i % salons.length].id, expiresAt: future(90), isActive: true };
    });
    console.log(`   ✅ giftCard: +${needGc}`);

    const needDisc = await ensure("discount", (i) => ({ code: `STRESS-DISC-${1000 + i}`, percent: rand(5, 50), maxUses: rand(0, 1000), usedCount: rand(0, 100), expiresAt: future(30), isActive: true }));
    console.log(`   ✅ discount: +${needDisc}`);

    const needWh = await ensure("webhookConfig", (i) => {
      const s = salons[i % salons.length];
      return { salonId: s.id, url: `https://webhook.stress/${s.slug}/${i}`, secret: randomBytes(8).toString("hex"), events: ["appointment.confirmed", "appointment.cancelled"], isActive: true };
    });
    console.log(`   ✅ webhookConfig: +${needWh}`);
    webhookConfigs = await prisma.webhookConfig.findMany({ orderBy: { id: "asc" } });

    const needWd = await ensure("webhookDelivery", (i) => {
      const cfg = webhookConfigs[i % webhookConfigs.length];
      return { configId: cfg.id, event: pick(["appointment.confirmed", "appointment.cancelled"]), payload: { i }, status: pick(["SUCCESS", "FAILED", "PENDING"]), responseStatus: i % 3 ? 200 : 500, attempts: rand(0, 3), lastError: i % 3 ? null : "timeout" };
    });
    console.log(`   ✅ webhookDelivery: +${needWd}`);
  }

  // ── ۱۲) نظر / علاقه‌مندی / تیکت / اعلان / ممیزی ────────────────────
  {
    const needR = await ensure("review", (i) => {
      const s = salons[i % salons.length];
      const st = staffList[i % staffList.length];
      const cu = users[i % users.length];
      const rating = rand(1, 5);
      return { salonId: s.id, staffId: st.id, customerId: cu.id, rating, comment: rating >= 4 ? "عالی بود" : "معمولی بود", reply: rating >= 4 ? "ممنون" : null, repliedAt: rating >= 4 ? new Date() : null };
    });
    console.log(`   ✅ review: +${needR}`);

    const newUsers = users.slice(28);
    const newSalons = salons.slice(8);
    const needF = await ensure("favorite", (i) => {
      const u = newUsers[i % newUsers.length];
      const s = newSalons[i % newSalons.length];
      return { userId: u.id, salonId: s.id };
    });
    console.log(`   ✅ favorite: +${needF}`);

    const needT = await ensure("supportTicket", (i) => {
      const u = users[i % users.length];
      return { userId: u.id, name: u.name || "کاربر", phone: u.phone, email: null, category: pick(["GENERAL", "BOOKING", "PAYMENT", "TECHNICAL", "COMPLAINT"]), subject: `موضوع تیکت ${i + 1}`, message: `متن تیکت ${i + 1}`, status: pick(TK_STATUS), priority: pick(["LOW", "NORMAL", "HIGH"]) };
    });
    console.log(`   ✅ supportTicket: +${needT}`);

    const needN = await ensure("notification", (i) => {
      const u = users[i % users.length];
      return { type: pick(["OTP", "APPOINTMENT_CONFIRM", "REMINDER", "CANCEL", "SUBSCRIPTION"]), channel: "SMS", recipient: u.phone, userId: u.id, salonId: salons[i % salons.length].id, payload: { i }, status: pick(["PENDING", "SENT", "FAILED"]), attempts: rand(0, 3), nextAttemptAt: new Date(), sentAt: new Date() };
    });
    console.log(`   ✅ notification: +${needN}`);

    const needA = await ensure("auditLog", (i) => {
      const s = salons[i % salons.length];
      return { action: pick(["approve_salon", "suspend_salon", "settings_update", "support_login"]), entityType: "Salon", entityId: s.id, after: { salon: s.slug }, ip: `10.0.0.${i % 255}`, createdAt: new Date(Date.now() - i * 3600000) };
    });
    console.log(`   ✅ auditLog: +${needA}`);
  }

  // ── ۱۳) تنظیمات (فقط زیرگروه stress برای امنیت) ──────────────────────
  {
    const needSt = await ensure("setting", (i) => ({ key: `stress.key.${i}`, value: `value-${i}`, group: "stress", type: "string", description: "ورودی تست بار", isSecret: false }));
    console.log(`   ✅ setting: +${needSt}`);
  }

  // ─── جمع‌بندی ──────────────────────────────────────────────────────
  const models = ["user", "salon", "branch", "service", "staff", "appointment", "voiceCall", "salonCustomer", "salonCustomerNote", "salonCustomerMedia", "wallet", "transaction", "commissionPlan", "payout", "subscription", "invoice", "order", "payment", "campaign", "giftCard", "discount", "waitlistEntry", "webhookConfig", "webhookDelivery", "auditLog", "review", "favorite", "supportTicket", "notification", "holiday", "galleryItem", "timeBlock", "cashRegisterEntry", "openingHour", "package", "otp", "session", "setting"];
  console.log("\n📊 آمار نهایی (بعد از تزریق):");
  const summary = {};
  for (const m of models) {
    try { summary[m] = await prisma[m].count(); } catch { summary[m] = "ERR"; }
  }
  console.table(summary);

  if (failures.length) {
    console.log(`\n⚠️  ${failures.length} خطا/رکورد مشکل‌دار در بخش‌های زیر ثبت شد:`);
    [...new Set(failures)].forEach((f) => console.log("   - " + f));
  } else {
    console.log("\n✅ هیچ خطایی ثبت نشد؛ همه بخش‌ها تا ۲۵۰ رکورد پر شدند.");
  }
}

main()
  .catch((e) => { console.error("❌ خطای کلی:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
