#!/usr/bin/env node
/**
 * دیتای نمونه (Demo Data) برای تمام بخش‌های نوبینو.
 *
 * ویژگی‌ها:
 *  - بی‌ضرر و بدون بازسازی (idempotent): با هر اجرا، داده‌ها به هدف
 *    ۱۰ تا ۳۰ رکورد در هر بخش می‌رسند و تکراری ساخته نمی‌شود.
 *  - با seed اصلی (prisma/seed.mjs) سازگار است و آن را تغییر نمی‌دهد.
 *  - از upsert / top-up استفاده می‌کند تا اجرای دوباره امن باشد.
 *
 * اجرا:  node scripts/seed-demo.mjs
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync, randomInt } from "node:crypto";

const prisma = new PrismaClient();

const rand = (min, max) => randomInt(min, max + 1);
const pick = (arr) => arr[rand(0, arr.length - 1)];
const pad = (n) => String(n).padStart(2, "0");
// ساعت به‌صورت "HH:MM" از تعداد دقیقه
const hhmm = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

// ─── الگوریتم هش یکسان با اپ (scrypt) ────────────────────────────────
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const buf = scryptSync(password, salt, 64);
  return `scrypt:${salt}:${buf.toString("hex")}`;
}

// ─── ابزار top-up: فقط اگر تعداد موجود کمتر از target بود بساز ──────────
async function topUp(model, where, target, make) {
  const existing = await prisma[model].count({ where });
  const need = Math.max(0, target - existing);
  if (need <= 0) return;
  const rows = [];
  for (let i = 0; i < need; i++) rows.push(await make(i, existing + i));
  await prisma[model].createMany({ data: rows });
}

// ─── داده‌های پایه ────────────────────────────────────────────────────
const FIR = ["نگار", "امیر", "سارا", "رضا", "لیلا", "مهدی", "نازنین", "علی", "مهسا", "حسین", "پریسا", "کیان", "الهام", "بهراد", "صدف", "آرمان", "مریم", "فرهاد", "بهاره", "سام", "شیوا", "امید", "ترانه", "آیدا", "پروین", "کامران", "شیرین"];
const LAST = ["رضایی", "محمدی", "احمدی", "کریمی", "حسینی", "موسوی", "جعفری", "صادقی", "رحیمی", "نادری", "قاسمی", "توکلی", "شفیعی", "عباسی", "مظفری"];

// سالن‌های نمونه (slug یکتا برای upsert)
const SALONS = [
  { slug: "mah", name: "سالن زیبایی ماه", city: "تهران", phone: "02188445566", address: "تهران، سعادت‌آباد، بلوار دریا", desc: "سالن زیبایی تخصصی با کادری مجرب در زمینه مو، پوست و ناخن.", cover: "#ec4899" },
  { slug: "rose", name: "سالن رز", city: "اصفهان", phone: "03132665544", address: "اصفهان، خیابان چهارباغ بالا", desc: "گریم و میکاپ تخصصی عروس و داماد.", cover: "#db2777" },
  { slug: "sepideh", name: "سالن سپیده", city: "شیراز", phone: "07136223344", address: "شیراز، خیابان زند", desc: "کاشت ناخن و خدمات ناخن حرفه‌ای.", cover: "#a21caf" },
  { slug: "golha", name: "سالن گل‌ها", city: "مشهد", phone: "05138445566", address: "مشهد، بلوار وکیل‌آباد", desc: "خدمات مو و رنگ با متخصصین مجرب.", cover: "#f97316" },
  { slug: "niloofar", name: "سالن نیلوفر", city: "تهران", phone: "02122334455", address: "تهران، خیابان ولیعصر", desc: "پاکسازی پوست و خدمات زیبایی پوست.", cover: "#0891b2" },
  { slug: "bahar", name: "سالن بهار", city: "تبریز", phone: "04135566778", address: "تبریز، خیابان امام", desc: "خدمات مو، رنگ و کاشت ناخن با تیمی حرفه‌ای.", cover: "#16a34a" },
  { slug: "sahand", name: "سالن سهند", city: "ارومیه", phone: "04433445566", address: "ارومیه، خیابان مدنی", desc: "سالن تخصصی مو و میکاپ عروس.", cover: "#7c3aed" },
  { slug: "arian", name: "سالن آرین", city: "کرج", phone: "02632556677", address: "کرج، میدان توحید", desc: "پاکسازی و بهداشت پوست، میکاپ و خدمات ناخن.", cover: "#dc2626" },
];

const SERVICES_POOL = [
  ["کوتاهی مو", 30, 250000],
  ["رنگ مو", 120, 1200000],
  ["مش مش", 150, 1800000],
  ["کاشت ناخن", 90, 900000],
  ["میکاپ", 60, 800000],
  ["پاکسازی پوست", 45, 600000],
  ["لمینت مژه", 40, 500000],
  ["کاشت مژه", 90, 700000],
  ["دکلره", 180, 2200000],
  ["اصلاح صورت", 20, 150000],
];

const STAFF_ROLES = ["OWNER", "MANAGER", "RECEPTION", "STYLIST", "STYLIST"];
const STAFF_TITLES = ["آرایشگر ارشد", "مدیر سالن", "مسئول پذیرش", "آرایشگر", "متخصص ناخن"];

const APPT_STATUS = ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];
const CHANNEL = ["MANUAL", "WEBAPP", "VOICE"];

const PKG = ["pkg-0", "pkg-1", "pkg-2"]; // از seed اصلی موجود است

// ═══ ۱) کاربران (User) ══════════════════════════════════════════════
const password = hashPassword("Demo@1234");

async function ensureUser(phone, role, name, email) {
  const exists = await prisma.user.findUnique({ where: { phone } });
  if (exists) return exists;
  return prisma.user.create({
    data: { phone, role, name, email, verifiedAt: new Date(), passwordHash: password },
  });
}

async function seedUsers() {
  // مالک‌ها (۴) + نماینده (۱) — نماینده/ادمین از seed اصلی موجودند
  const owners = [];
  for (let i = 1; i <= 4; i++) {
    const ph = `0912${String(30000000 + i * 10)}`;
    const name = `${FIR[i]} ${LAST[i]}`;
    owners.push(await ensureUser(ph, "SALON_OWNER", name, `owner${i}@nobino.ir`));
  }
  const agent = await ensureUser("09120000999", "AGENT", "تیم فروش", "agent@nobino.ir");

  // مشتری‌ها (۲۰)
  const customers = [];
  for (let i = 1; i <= 20; i++) {
    const ph = `0912${String(40000000 + i * 10)}`;
    const name = `${pick(FIR)} ${pick(LAST)}`;
    customers.push(await ensureUser(ph, "CUSTOMER", name, `customer${i}@nobino.ir`));
  }
  return { owners, agent, customers };
}

// ═══ ۲) سالن‌ها و زیرمجموعه‌ها ════════════════════════════════════════
async function seedSalons(owners) {
  const salons = [];
  for (let s = 0; s < SALONS.length; s++) {
    const meta = SALONS[s];
    const owner = owners[s % owners.length];
    const salon = await prisma.salon.upsert({
      where: { slug: meta.slug },
      update: {},
      create: {
        slug: meta.slug,
        name: meta.name,
        phone: meta.phone,
        city: meta.city,
        address: meta.address,
        description: meta.desc,
        coverColor: meta.cover,
        ownerId: owner.id,
        isApproved: true,
        isActive: true,
        plan: pick(["BASIC", "PRO", "ENTERPRISE"]),
      },
    });

    // شعبه‌ها (۲ برای هر سالن)
    await topUp("branch", { salonId: salon.id }, 2, (i) => ({
      salonId: salon.id,
      name: i === 0 ? "شعبه اصلی" : `شعبه ${i + 1}`,
      city: salon.city,
      address: salon.address,
      phone: salon.phone,
    }));
    const branches = await prisma.branch.findMany({ where: { salonId: salon.id } });

    // خدمات (۶ برای هر سالن)
    await topUp("service", { salonId: salon.id }, 6, (i) => {
      const [name, durationMin, price] = SERVICES_POOL[(s * 6 + i) % SERVICES_POOL.length];
      return {
        salonId: salon.id,
        branchId: branches[i % branches.length]?.id ?? null,
        name: `${name} ${s + 1}-${i + 1}`,
        durationMin,
        price,
        category: ["مو", "ناخن", "پوست", "میکاپ"][i % 4],
        isActive: true,
      };
    });

    // ساعات کاری (۷ روز)
    for (let d = 0; d < 7; d++) {
      await prisma.openingHour.upsert({
        where: { salonId_dayOfWeek: { salonId: salon.id, dayOfWeek: d } },
        update: {},
        create: { salonId: salon.id, dayOfWeek: d, openTime: "09:00", closeTime: "21:00" },
      });
    }

    // تعطیلات (۳)
    await topUp("holiday", { salonId: salon.id }, 3, (i) => {
      const date = new Date();
      date.setDate(date.getDate() + 10 + i * 5);
      return { salonId: salon.id, branchId: pick(branches).id, date, reason: pick(["تعمیرات", "تعطیلی رسمی", "جشن سالن"]) };
    });

    // گالری (۵)
    await topUp("galleryItem", { salonId: salon.id }, 5, (i) => ({
      salonId: salon.id,
      title: pick(["استایل مو", "میکاپ عروس", "ناخن", "پوست", "رنگ مو"]),
      imageUrl: `/gallery/${pick(["hair", "makeup", "nails", "skin"])}.svg`,
      sortOrder: i,
    }));

    // کارکنان (۵)
    const staff = [];
    for (let i = 0; i < 5; i++) {
      // نام قطعی تا بدون بازسازی بماند (همان نام پیدا می‌شود و ساخته نمی‌شود)
      const name = `${FIR[(s * 5 + i) % FIR.length]} ${LAST[i % LAST.length]}`;
      let existing = await prisma.staff.findFirst({ where: { salonId: salon.id, name } });
      if (!existing) {
        existing = await prisma.staff.create({
          data: {
            salonId: salon.id,
            branchId: branches[i % branches.length].id,
            name,
            title: STAFF_TITLES[i % STAFF_TITLES.length],
            role: STAFF_ROLES[i % STAFF_ROLES.length],
            commissionPercent: rand(10, 30),
            specialties: [pick(["مو", "ناخن", "میکاپ", "پوست"])],
            schedule: { days: [0, 1, 2, 3, 4, 5, 6], open: "09:00", close: "21:00" },
            isActive: true,
          },
        });
      }
      staff.push(existing);
    }

    // حذف کارکنان اضافیِ غیراستاندارد (از اجراهای قبلی) — چون هنوز نوبتی به آن‌ها
    // اشاره نکرده، حذف‌شان امن است و عدد را دقیق و ثابت نگه می‌دارد.
    const canonicalStaffIds = staff.map((s) => s.id);
    await prisma.staff.deleteMany({ where: { salonId: salon.id, NOT: { id: { in: canonicalStaffIds } } } });

    // بلوک‌های زمانی (۳)
    await topUp("timeBlock", { salonId: salon.id }, 3, (i) => {
      const start = new Date();
      start.setDate(start.getDate() + 3 + i);
      start.setHours(10, 0, 0, 0);
      const end = new Date(start);
      end.setHours(11, 30);
      return { salonId: salon.id, branchId: branches[0].id, staffId: staff[i % staff.length].id, startAt: start, endAt: end, reason: "غیبت/مرخصی" };
    });

    salons.push({ salon, branches, staff });
  }
  return salons;
}

// ═══ ۳) CRM مشتریان سالن ══════════════════════════════════════════════
async function seedCrm(salons, customers) {
  for (const { salon } of salons) {
    // مشتریان سالن (۱۲)
    await topUp("salonCustomer", { salonId: salon.id }, 12, (i) => {
      const c = customers[(i) % customers.length];
      return {
        salonId: salon.id,
        phone: c.phone,
        name: c.name,
        firstName: c.name?.split(" ")[0],
        lastName: c.name?.split(" ")[1],
        visits: rand(1, 12),
        spend: rand(200000, 8000000),
        lastVisitAt: new Date(Date.now() - rand(1, 40) * 86400000),
        tags: [pick(["VIP", "بازگشتی", "جدید", "وفادار", "تخفیف"]), pick(["مو", "ناخن", "پوست"])],
      };
    });
    const crms = await prisma.salonCustomer.findMany({ where: { salonId: salon.id } });

    // یادداشت‌ها (۶)
    let n = await prisma.salonCustomerNote.count({ where: { customer: { salonId: salon.id } } });
    while (n < 6) {
      const c = pick(crms);
      await prisma.salonCustomerNote.create({ data: { customerId: c.id, note: pick(["عاشق رنگ روشن است", "به پنبه حساسیت دارد", "هر دو هفته یک بار می‌آید", "ترجیح می‌دهد با سارا کار کند"]) } });
      n++;
    }

    // مدیای مشتری (۴)
    let m = await prisma.salonCustomerMedia.count({ where: { salonId: salon.id } });
    while (m < 4) {
      const c = pick(crms);
      await prisma.salonCustomerMedia.create({ data: { salonId: salon.id, customerId: c.id, type: pick(["photo", "voice"]), url: `/gallery/${pick(["hair", "makeup", "nails"])}.svg`, name: "تصویر قبل/بعد", mimeType: "image/svg+xml", size: rand(10000, 400000) } });
      m++;
    }
  }
}

// ═══ ۴) نوبت‌ها ══════════════════════════════════════════════════════
async function seedAppointments(salons, customers) {
  let idx = 0;
  for (const { salon, branches, staff } of salons) {
    const services = await prisma.service.findMany({ where: { salonId: salon.id } });
    await topUp("appointment", { salonId: salon.id }, 8, () => {
      const c = customers[idx % customers.length]; idx++;
      const svc = pick(services);
      const st = pick(staff);
      const startAt = new Date();
      startAt.setDate(startAt.getDate() + rand(0, 14));
      startAt.setHours(rand(9, 19), rand(0, 50), 0, 0);
      const endAt = new Date(startAt.getTime() + svc.durationMin * 60000);
      const status = pick(APPT_STATUS);
      return {
        salonId: salon.id,
        branchId: branches[0].id,
        serviceId: svc.id,
        employeeId: st.id,
        customerId: c.id,
        customerName: c.name,
        customerPhone: c.phone,
        startAt,
        endAt,
        status,
        channel: pick(CHANNEL),
        note: status === "CANCELLED" ? "توسط مشتری لغو شد" : null,
        depositAmount: rand(0, 1) ? rand(100000, 500000) : null,
        depositPaid: false,
      };
    });
  }
}

// ═══ ۵) مالی: کیف پول / تراکنش / کمیسیون / برداشت ══════════════════════
async function seedFinance(users, salons) {
  const { owners, agent } = users;
  // کیف پول برای مالک‌ها و نماینده
  for (const u of [...owners, agent]) {
    await prisma.wallet.upsert({ where: { ownerId: u.id }, update: {}, create: { ownerId: u.id } });
  }
  const wallets = await prisma.wallet.findMany({ where: { ownerId: { in: [...owners, agent].map((u) => u.id) } } });

  // تراکنش‌ها (۵ برای هر کیف پول)
  for (const w of wallets) {
    const count = await prisma.transaction.count({ where: { walletId: w.id } });
    const need = Math.max(0, 5 - count);
    let balance = w.balance;
    for (let i = 0; i < need; i++) {
      const isCredit = i % 2 === 0;
      const amount = rand(100000, 1500000);
      balance = isCredit ? balance + amount : Math.max(0, balance - amount);
      await prisma.transaction.create({
        data: {
          walletId: w.id,
          kind: isCredit ? "CREDIT" : "DEBIT",
          reason: isCredit ? "COMMISSION_EARNING" : "PAYOUT",
          amount,
          balanceAfter: balance,
          description: isCredit ? "درآمد کمیسیون فروش" : "برداشت از کیف پول",
        },
      });
    }
  }

  // کمیسیون نمایندگان (۴)
  for (let i = 0; i < salons.length && i < 4; i++) {
    const salon = salons[i].salon;
    await prisma.commissionPlan.upsert({
      where: { agentId_salonId: { agentId: agent.id, salonId: salon.id } },
      update: {},
      create: { agentId: agent.id, salonId: salon.id, percent: rand(10, 25) },
    });
  }

  // برداشت (۳)
  const balanceWallets = wallets.slice(0, 2);
  for (const w of balanceWallets) {
    const cnt = await prisma.payout.count({ where: { walletId: w.id } });
    for (let i = cnt; i < 3; i++) {
      await prisma.payout.create({
        data: { walletId: w.id, amount: rand(200000, 1000000), method: pick(["BANK", "CARD"]), bankInfo: "IR...", status: pick(["REQUESTED", "PROCESSING", "PAID"]) },
      });
    }
  }
}

// ═══ ۶) بسته/اشتراک/فاکتور/سفارش/پرداخت ══════════════════════════════
async function seedBilling(users, salons) {
  const pkgs = await prisma.package.findMany();
  if (!pkgs.length) return;

  for (const { salon } of salons) {
    // اشتراک (۲ برای هر سالن)
    await topUp("subscription", { salonId: salon.id }, 2, (i) => {
      const pkg = pkgs[i % pkgs.length];
      const startsAt = new Date(Date.now() - i * 20 * 86400000);
      const endsAt = new Date(startsAt.getTime() + pkg.durationDays * 86400000);
      return { salonId: salon.id, packageId: pkg.id, startsAt, endsAt, period: i % 2 ? "YEARLY" : "MONTHLY", autoRenew: true, status: "ACTIVE" };
    });
    const subs = await prisma.subscription.findMany({ where: { salonId: salon.id } });

    // فاکتور (۳)
    let invCount = await prisma.invoice.count({ where: { salonId: salon.id } });
    for (let i = invCount; i < 3; i++) {
      const sub = subs[i % subs.length];
      const amount = rand(990000, 3290000);
      await prisma.invoice.create({
        data: {
          number: `INV-${salon.slug.toUpperCase()}-${1000 + i}`,
          salonId: salon.id,
          subscriptionId: sub.id,
          kind: "SUBSCRIPTION",
          customerName: salon.name,
          customerPhone: salon.phone,
          amount,
          status: pick(["PAID", "PENDING"]),
        },
      });
    }
  }

  // سفارش برای خرید بسته توسط مالک‌ها (۶) + پرداخت
  const orderOwners = users.owners;
  for (let i = 0; i < 6; i++) {
    const owner = orderOwners[i % orderOwners.length];
    const pkg = pkgs[i % pkgs.length];
    const exists = await prisma.order.findFirst({ where: { userId: owner.id, packageId: pkg.id } });
    if (exists) continue;
    const amount = pkg.price;
    const order = await prisma.order.create({
      data: { userId: owner.id, packageId: pkg.id, amount, originalAmount: amount, period: "MONTHLY", status: "PAID" },
    });
    await prisma.payment.create({
      data: { orderId: order.id, gateway: "sandbox", amount, status: "PAID", refId: `REF-${rand(100000, 999999)}`, cardPan: "6219-****-****-1234" },
    });
  }
}

// ═══ ۷) درگاه/هدیه/تخفیف/کمپین ══════════════════════════════════════
async function seedMarketing(users, salons) {
  const { customers } = users;

  // کارت هدیه (۱۰)
  const gcCount = await prisma.giftCard.count();
  for (let i = gcCount; i < 10; i++) {
    const owner = customers[i % customers.length];
    await prisma.giftCard.upsert({
      where: { code: `GC-${100000 + i}` },
      update: {},
      create: { code: `GC-${100000 + i}`, balance: rand(100000, 1000000), ownerId: owner.id, salonId: i % 2 ? salons[i % salons.length].salon.id : null, expiresAt: new Date(Date.now() + 90 * 86400000) },
    });
  }

  // کد تخفیف (۸)
  const dCount = await prisma.discount.count();
  for (let i = dCount; i < 8; i++) {
    await prisma.discount.upsert({
      where: { code: `WELCOME${i + 10}` },
      update: {},
      create: { code: `WELCOME${i + 10}`, percent: rand(5, 30), maxUses: rand(10, 100), expiresAt: new Date(Date.now() + 30 * 86400000) },
    });
  }

  // کمپین پیامکی (۳ برای هر سالن)
  for (const { salon } of salons) {
    await topUp("campaign", { salonId: salon.id }, 3, (i) => ({
      salonId: salon.id,
      name: pick(["تخفیف پایان هفته", "یادآوری نوبت", "معرفی دوستان", "عید"]),
      channel: "SMS",
      segment: pick(["ALL", "RETURNING"]),
      message: `سلام، ${salon.name} ${rand(10, 30)}٪ تخفیف ویژه ارائه می‌دهد.`,
      status: pick(["SENT", "DRAFT", "SCHEDULED"]),
      sentCount: rand(0, 50),
    }));
  }
}

// ═══ ۸) لیست انتظار / webhook / اعلان / تیکت / نظرات / علاقه‌مندی ════
async function seedEngagement(users, salons) {
  const { customers } = users;

  for (const { salon, staff } of salons) {
    const services = await prisma.service.findMany({ where: { salonId: salon.id } });

    // لیست انتظار (۵)
    await topUp("waitlistEntry", { salonId: salon.id }, 5, (i) => ({
      salonId: salon.id,
      serviceId: services[i % services.length].id,
      employeeId: staff[i % staff.length].id,
      customerName: `${pick(FIR)} ${pick(LAST)}`,
      customerPhone: `0935${String(1000000 + rand(0, 999999))}`,
      note: "وقت خالی در هفته",
      status: pick(["WAITING", "NOTIFIED", "BOOKED", "EXPIRED"]),
    }));

    // webhook (۲)
    await topUp("webhookConfig", { salonId: salon.id }, 2, (i) => ({
      salonId: salon.id,
      url: `https://webhook.test/nobino/${salon.slug}/${i}`,
      secret: randomBytes(8).toString("hex"),
      events: ["appointment.confirmed", "appointment.cancelled"],
    }));
    const hooks = await prisma.webhookConfig.findMany({ where: { salonId: salon.id } });

    // تحویل webhook (۴)
    let wh = await prisma.webhookDelivery.count({ where: { config: { salonId: salon.id } } });
    while (wh < 4) {
      const hook = pick(hooks);
      await prisma.webhookDelivery.create({ data: { configId: hook.id, event: pick(["appointment.confirmed", "appointment.cancelled"]), payload: { salon: salon.slug }, status: pick(["SUCCESS", "FAILED"]), responseStatus: 200, attempts: 1 } });
      wh++;
    }

    // اعلان‌ها (۴)
    let notif = await prisma.notification.count({ where: { salonId: salon.id } });
    while (notif < 4) {
      const c = customers[notif % customers.length];
      await prisma.notification.create({
        data: {
          type: pick(["APPOINTMENT_CONFIRM", "REMINDER", "CANCEL"]),
          channel: "SMS",
          recipient: c.phone,
          userId: c.id,
          salonId: salon.id,
          payload: { salon: salon.name },
          nextAttemptAt: new Date(),
          status: pick(["SENT", "PENDING"]),
          sentAt: new Date(),
        },
      });
      notif++;
    }

    // نظرات (۵)
    await topUp("review", { salonId: salon.id }, 5, (i) => {
      const c = customers[i % customers.length];
      const rating = rand(3, 5);
      return {
        salonId: salon.id,
        staffId: staff[i % staff.length].id,
        customerId: c.id,
        rating,
        comment: rating >= 4 ? "خیلی عالی بود، حتماً دوباره میام" : "به‌نسبت خوب بود",
        reply: rating >= 4 ? "ممنون از لطف شما 🙏" : null,
        repliedAt: rating >= 4 ? new Date() : null,
      };
    });

    // علاقه‌مندی‌ها (۴)
    await topUp("favorite", { salonId: salon.id }, 4, (i) => ({
      userId: customers[i % customers.length].id,
      salonId: salon.id,
    }));
  }

  // تیکت پشتیبانی (۱۰)
  const tCount = await prisma.supportTicket.count();
  for (let i = tCount; i < 10; i++) {
    const c = customers[i % customers.length];
    await prisma.supportTicket.create({
      data: {
        userId: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        category: pick(["GENERAL", "BOOKING", "PAYMENT", "TECHNICAL", "COMPLAINT"]),
        subject: pick(["سؤال درباره بسته‌ها", "مشکل در رزرو", "پیگیری پرداخت", "پیشنهاد"]),
        message: "متن نمونه درخواست پشتیبانی.",
        status: pick(["OPEN", "IN_PROGRESS", "CLOSED"]),
        priority: pick(["LOW", "NORMAL", "HIGH"]),
      },
    });
  }

  // لاگ ممیزی (۱۲)
  const aCount = await prisma.auditLog.count();
  for (let i = aCount; i < 12; i++) {
    const salon = salons[i % salons.length].salon;
    await prisma.auditLog.create({
      data: {
        action: pick(["approve_salon", "suspend_salon", "settings_update", "support_login"]),
        entityType: "Salon",
        entityId: salon.id,
        after: { salon: salon.slug },
        createdAt: new Date(Date.now() - i * 3600000),
      },
    });
  }
}

// ═══ ۹) صندوق روزانه و تماس‌های صوتی ══════════════════════════════════
async function seedCashAndVoice(salons) {
  for (const { salon, branches } of salons) {
    // ورودی صندوق (۳)
    await topUp("cashRegisterEntry", { salonId: salon.id }, 3, (i) => ({
      salonId: salon.id,
      branchId: branches[i % branches.length].id,
      date: new Date(Date.now() - i * 86400000),
      cashAmount: rand(200000, 2000000),
      cardAmount: rand(100000, 3000000),
      onlineAmount: rand(0, 1000000),
      expenseAmount: rand(0, 500000),
      note: pick(["واریز روزانه", "هزینه خرید مواد مصرفی", "پرداخت اجاره"]),
    }));

    // تماس صوتی (۲)
    const vc = await prisma.voiceCall.count({ where: { salonId: salon.id } });
    for (let i = vc; i < 2; i++) {
      await prisma.voiceCall.create({
        data: {
          salonId: salon.id,
          durationSec: rand(15, 120),
          transcript: "می‌خواستم برای شنبه ساعت ۵ یک نوبت کوتاهی مو بگیرم.",
          rawText: "نوبت کوتاهی مو شنبه ساعت ۵",
          status: pick(["DONE", "CONFIRMED"]),
        },
      });
    }
  }
}

// ═══ اجرا ══════════════════════════════════════════════════════════════
async function main() {
  console.log("🚀 شروع تزریق دیتای نمونه...");
  const users = await seedUsers();
  console.log(`   ✅ کاربران: ${users.owners.length} مالک + ۱ نماینده + ${users.customers.length} مشتری`);
  const salons = await seedSalons(users.owners);
  console.log(`   ✅ سالن‌ها: ${salons.length} سالن`);
  await seedCrm(salons, users.customers);
  console.log("   ✅ CRM مشتریان سالن");
  await seedAppointments(salons, users.customers);
  console.log("   ✅ نوبت‌ها");
  await seedFinance(users, salons);
  console.log("   ✅ مالی (کیف پول/تراکنش/کمیسیون/برداشت)");
  await seedBilling(users, salons);
  console.log("   ✅ بسته/اشتراک/فاکتور/سفارش/پرداخت");
  await seedMarketing(users, salons);
  console.log("   ✅ هدیه/تخفیف/کمپین");
  await seedEngagement(users, salons);
  console.log("   ✅ لیست انتظار/webhook/اعلان/تیکت/نظر/علاقه‌مندی/ممیزی");
  await seedCashAndVoice(salons);
  console.log("   ✅ صندوق روزانه و تماس صوتی");

  // تعیین سالن‌های نمونهٔ صفحهٔ اصلی = همهٔ سالن‌های نمونه ساخته‌شده (کاما جدا)
  const sampleSlugs = salons.map((x) => x.salon.slug).join(",");
  await prisma.setting.upsert({
    where: { key: "home.sample_salons" },
    update: { value: sampleSlugs },
    create: {
      key: "home.sample_salons",
      value: sampleSlugs,
      group: "home",
      type: "string",
      description: "اسلاگ سالن‌های نمونه صفحه اصلی (کاما جدا)",
    },
  });
  console.log("   ✅ سالن‌های نمونه صفحه اصلی: " + sampleSlugs);

  const models = ["User", "Salon", "Branch", "Service", "Staff", "Appointment", "VoiceCall", "SalonCustomer", "SalonCustomerNote", "SalonCustomerMedia", "Wallet", "Transaction", "CommissionPlan", "Payout", "Subscription", "Invoice", "Order", "Payment", "Campaign", "GiftCard", "Discount", "WaitlistEntry", "WebhookConfig", "WebhookDelivery", "AuditLog", "Review", "Favorite", "SupportTicket", "Notification", "Holiday", "GalleryItem", "TimeBlock", "CashRegisterEntry", "OpeningHour"];
  const keyed = { SalonCustomer: "salonCustomer", SalonCustomerNote: "salonCustomerNote", SalonCustomerMedia: "salonCustomerMedia", CommissionPlan: "commissionPlan", WebhookConfig: "webhookConfig", WebhookDelivery: "webhookDelivery", WaitlistEntry: "waitlistEntry", SupportTicket: "supportTicket", GalleryItem: "galleryItem", TimeBlock: "timeBlock", CashRegisterEntry: "cashRegisterEntry", OpeningHour: "openingHour", VoiceCall: "voiceCall" };
  const counts = {};
  for (const t of models) {
    const prop = keyed[t] ?? t[0].toLowerCase() + t.slice(1);
    counts[t] = await prisma[prop].count();
  }
  console.log("\n📊 آمار نهایی جداول:");
  console.table(counts);
  console.log("✅ تزریق دیتای نمونه کامل شد.");
}

main()
  .catch((e) => { console.error("❌ خطا:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
