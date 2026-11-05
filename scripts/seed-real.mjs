#!/usr/bin/env node
/**
 * seed-real.mjs — پاک‌سازی محتوای تست و جایگزینی آن با محتوای واقع‌نمای فارسی
 *
 * چه چیزی پاک می‌شود (فاز پاک‌سازی):
 *  - سالن‌های استرسی (slug با پیشوند stress یا نام «… استرس N») و سالن‌های بی‌نام تستی
 *  - تمام فرزندان آن سالن‌ها و همچنین فرزندان ۸ سالن دمو (نام‌های «لمینت مژه 2-1»)
 *  - کاربرهای تستی (0999/0998، ایمیل @nobino.ir برای مشتری‌ها) و ردیف‌های وابسته
 *  - پکیج‌های «بسته استرس N» و ردیف‌های Setting با کلید stress.*
 * چه چیزی دست‌نخورده می‌ماند:
 *  - حساب ادمین و نماینده‌ها، تنظیمات واقعی پنل، پلن‌های واقعی SaaS (پلن پایه/حرفه‌ای/سازمانی)
 *  - سالن‌هایی که دستی در پنل ساخته شده‌اند (مثل پردیسان کاج)
 *
 * اجرا:
 *   node scripts/seed-real.mjs              پاک‌سازی + سید
 *   node scripts/seed-real.mjs --dry-run    فقط گزارش، بدون نوشتن
 *   node scripts/seed-real.mjs --clean-only | --seed-only
 * گارد: روی NODE_ENV=production بدون ALLOW_PROD_SEED=1 اجرا نمی‌شود.
 */
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes, randomInt, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const ONLY_CLEAN = args.includes("--clean-only");
const ONLY_SEED = args.includes("--seed-only");
const SALON_TARGET = 100; // slug‌های دمو + سالن‌های تازه

if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "1") {
  console.error("🛑 روی production اجرا نمی‌شود (ALLOW_PROD_SEED=1 را ست کنید اگر واقعاً می‌خواهید).");
  process.exit(1);
}

/* ── ابزارها ─────────────────────────────────────────────────────── */
let seq = 0;
/** شناسهٔ خوانا و یکتا برای ردیف‌های این اسکریپت؛ پیشوند nr یعنی «نوبینو ریل» */
const nid = (tag) => `nr${tag}${String(++seq).padStart(5, "0")}`;
const rand = (min, max) => randomInt(min, max + 1);
const pick = (arr) => arr[rand(0, arr.length - 1)];
const pad2 = (n) => String(n).padStart(2, "0");
const hhmm = (minutes) => `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
const shiftDays = (days, hour = 12) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, rand(0, 2) * 30, 0, 0);
  return d;
};
const DEMO_PASSWORD = "Demo@1234";
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const buf = scryptSync(password, salt, 64);
  return `scrypt:${salt}:${buf.toString("hex")}`;
}

/* ── جغرافیا ─────────────────────────────────────────────────────── */
/** [شهر، پیشگاه تلفن، lat, lng، محله‌ها] */
const CITY = [
  ["تهران", "021", 35.70, 51.40, ["سعادت‌آباد", "ونک", "جردن", "نارداک", "پاسداران", "میرداماد", "شهرک غرب", "گیشا", "امامیه", "حکمت"]],
  ["کرج", "026", 35.83, 50.99, ["میدان توحید", "گوهردشت", "عظیمیه", "جهادشهر", "باغستان"]],
  ["اصفهان", "031", 32.65, 51.67, ["چهارباغ بالا", "جوب‌آراش", "نصف‌جهان", "خاک‌سیر", "دستغیب"]],
  ["شیراز", "071", 29.60, 52.51, ["خیابان زند", "قصردشتان", "معالی‌آباد", "شهرک قدس", "گودمندان"]],
  ["مشهد", "051", 36.29, 59.57, ["بلوار وکیل‌آباد", "احمدآباد", "صادقیه", "وحدت", "مطهری"]],
  ["تبریز", "041", 38.08, 46.29, ["خیابان امام", "آبرسان", "مابنانک", "گیلوار", "پایان‌ور"]],
  ["ارومیه", "044", 37.55, 45.07, ["خیابان مدنی", "باغ‌مکان", "گذرگاه زند", "روشنای"]],
  ["رشت", "013", 37.28, 49.58, ["میدان شهدا", "بلوار دانشجو", "خجابور", "گلسران"]],
  ["ساری", "011", 36.56, 53.06, ["بلوار امام‌خمینی", "میرزا‌دوغجی", "کیاکلایه"]],
  ["گرگان", "017", 36.84, 54.43, ["گلشهر", "خیابان شهید مطهری", "دکاوایی"]],
  ["قم", "025", 34.64, 50.87, ["صفائیه", "کیوسف‌آباد", "بلوار امین", "میدان ۱۹ دی"]],
  ["اهواز", "061", 31.32, 48.68, ["کیانپارس", "پاسداران", "زعفرانیه", "نادری"]],
  ["کرمانشاه", "083", 34.31, 47.06, ["بلوار رضوان", "شهرک ارم", "خیابان پزشک"]],
  ["یزد", "035", 31.90, 54.36, ["میدان صفائیه", "خیابان قاطر", "شهرک صدریه"]],
  ["کرمان", "034", 30.28, 57.13, ["بلوار جمال‌آباد", "شهرک قدس", "خیابان مسجد جامع"]],
  ["همدان", "081", 34.80, 48.51, ["بلوار امام خمینی", "میدان बुعلی", "خزانه"]],
  ["بندرعباس", "076", 27.19, 56.27, ["بلوار امام‌زاده عبدالله", "شهرک گلها", "میربیا"]],
  ["انزلی", "013", 37.47, 49.30, ["بلوار پیامبر اعظم", "خیابان کاسبین‌خان"]],
];
const STREET = ["خیابان ولیعصر", "خیابان شریعتی", "خیابان مطهری", "بلوار معلم", "خیابان آزادی", "خیابان کریمخان", "خیابان طالقانی", "بلوار جمهوری", "خیابان چمران", "خیابان ستارخان", "خیابان فلسطین", "بلوار پاسداران", "خیابان امام", "خیابان بهار", "خیابان انقلاب"];

/* ── برندها (slug لاتین + نام فارسی) ─────────────────────────────── */
/** kind: W = زنانه، M = مردانه — ۹۲ برند، به‌علاوهٔ ۸ سالن دمو = ۱۰۰ سالن */
const BRAND = [
  // زنانه (۶۴) — «ava» و «gisso» هنر گرافیکی آماده دارند
  ["ava", "آوا", "W"], ["gisso", "گیسو", "W"], ["armita", "آرمیتا", "W"], ["atena", "آتنا", "W"],
  ["baran", "باران", "W"], ["belin", "بلین", "W"], ["candice", "کاندیس", "W"], ["darya", "دریا", "W"],
  ["dena", "دنا", "W"], ["elood", "الود", "W"], ["forough", "فروغ", "W"], ["gandom", "گندم", "W"],
  ["golnaz", "گلناز", "W"], ["hana", "هانا", "W"], ["insa", "اینسا", "W"], ["yasmin", "یاسمن", "W"],
  ["kiana", "کیانا", "W"], ["lavin", "لاوین", "W"], ["mahtab", "مهتاب", "W"], ["nazi", "نازی", "W"],
  ["ovia", "اویا", "W"], ["parisa", "پریسا", "W"], ["raha", "رها", "W"], ["sepid", "سپید", "W"],
  ["morvarid", "مروارید", "W"], ["nahal", "نهال", "W"], ["avis", "آویس", "W"], ["baharanzaran", "بهارنارنج", "W"],
  ["dilkesh", "دلکش", "W"], ["jeyran", "جیران", "W"], ["laleh", "لاله", "W"], ["narges", "نرگس", "W"],
  ["parvaneh", "پروانه", "W"], ["roxana", "روکسانا", "W"], ["tilaar", "تیلار", "W"], ["urmay", "اورمی", "W"],
  ["virgul", "ویرگو", "W"], ["zivar", "زیوار", "W"], ["zarrin", "زرین", "W"], ["afra", "افرا", "W"],
  ["elahe", "الهه", "W"], ["gohar", "گوهر", "W"], ["homa", "هما", "W"], ["khorshid", "خورشید", "W"],
  ["lestinn", "لستین", "W"], ["mansooreh", "منصوره", "W"], ["noora", "نورا", "W"], ["paria", "پریا", "W"],
  ["rashin", "راشین", "W"], ["soodeh", "سوده", "W"], ["tahmina", "تهمینه", "W"], ["ushan", "اوشان", "W"],
  ["yas", "یاس", "W"], ["zoya", "زویا", "W"], ["niousha", "نیوشا", "W"], ["royaan", "رویانا", "W"],
  ["taj", "تاج", "W"], ["varsha", "وارشا", "W"], ["yeganeh", "یکانه", "W"], ["larvan", "لاوران", "W"],
  ["golriz", "گلریز", "W"], ["nahid", "ناهید", "W"], ["arezoo", "آرزو", "W"], ["shabnam", "شبنم", "W"],
  // مردانه (۲۸)
  ["arioobar", "آریوبرزن", "M"], ["isfand", "اسفند", "M"], ["kavir", "کویر", "M"], ["mehrad", "مهرداد", "M"],
  ["omid", "امید", "M"], ["qajar", "قاجار", "M"], ["samin", "سامین", "M"], ["simorgh", "سیمرغ", "M"],
  ["bardia", "بردیا", "M"], ["cina", "سینا", "M"], ["damavand", "دماوند", "M"], ["fereydoun", "فریدون", "M"],
  ["iraj", "ایرج", "M"], ["jamshid", "جمشید", "M"], ["vahid", "وحید", "M"], ["ardeshir", "اردشیر", "M"],
  ["bartar", "برتر", "M"], ["dashtekavir", "دشت‌کویر", "M"], ["haraz", "البرز", "M"], ["keyvan", "کیوان", "M"],
  ["miras", "میراث", "M"], ["pahlevan", "پهلوان", "M"], ["shahriar", "شهریار", "M"], ["arash", "آرش", "M"],
  ["kaveh", "کاوه", "M"], ["siyavash", "سیاوش", "M"], ["rostam", "رستم", "M"], ["bahram", "بهرام", "M"],
];
const W_TYPES = ["مجموعه زیبایی", "سالن زیبایی", "سالن مو و زیبایی", "استودیو زیبایی"];
const M_TYPES = ["آرایشگاه مردانه", "مجموعه آرایشی مردانه", "آرایشگاه و اصلاح‌موی"];

/* ── کاتالوگ خدمات با قیمت‌های بازار (تومان) ─────────────────────── */
const SERVICES_W = {
  مو: [
    ["کوتاهی مو و سشوار", 45, 380000, "شامل شست‌وشو و سشوار"],
    ["رنگ مو یک‌مرحله‌ای", 120, 1450000, "با رنگ بدون آمونیاک"],
    ["رفلکس و مش", 165, 2350000, "طبیعی و یکدست"],
    ["دکلره کامل", 210, 3200000, "تا پایه ده، با کراتین"],
    ["کراتین مو", 180, 3500000, "برزیل، اصالت با ضمانت"],
    ["بوتاکس مو", 150, 2600000],
    ["پروتئین و ویتامینه", 150, 2800000],
    ["بافت مو", 120, 1250000],
    ["شینیون و مدل مو", 90, 1800000, "مجلسی و عروس"],
    ["ماساژ و ماسک مو", 40, 480000],
  ],
  "میکاپ": [
    ["میکاپ شب", 60, 1250000],
    ["میکاپ عروس", 120, 4500000, "شامل تست قبل از مراسم"],
    ["گریم عروس", 150, 6200000, "با مژه و شینیون"],
    ["میکاپ خطبه", 90, 2800000],
  ],
  "ناخن": [
    ["کاشت ناخن ژلنی", 120, 1400000],
    ["مانیکور کلاسیک", 60, 480000],
    ["لاک ژل", 75, 850000],
    ["فرنچ و طراحی", 45, 620000],
    ["پدیکور", 70, 700000, "با پارافین و ماساژ"],
  ],
  "پوست": [
    ["پاکسازی پوست", 60, 880000, "تخصصی با دستگاه"],
    ["میکرودرم ابریژن", 45, 720000],
    ["هایفوتراپی صورت", 90, 2500000],
    ["مزوتراپی صورت", 60, 1600000],
    ["لیزر مو (هر ناحیه)", 30, 900000],
    ["بلیچ و ویوا", 30, 420000],
  ],
  "مژه و ابرو": [
    ["کاشت مژه تار به تار", 90, 980000],
    ["لمینت مژه", 45, 560000],
    ["لیفتینگ مژه", 60, 760000],
    ["لیفت و لمینت ابرو", 45, 680000],
    ["تتوی ابرو", 120, 2200000],
    ["میکرونیدلینگ", 60, 1500000],
  ],
};
const SERVICES_M = {
  "مردانه": [
    ["کوتاهی مو (مردانه)", 30, 280000, "با شست‌وشو و سشوار"],
    ["کوتاهی با ماشین", 20, 180000],
    ["اصلاح ریش و خط ریش", 20, 160000, "با حولهٔ گرم"],
    ["مدل ریش و سبیل", 35, 260000],
    ["رنگ مو (مردانه)", 60, 700000],
    ["ویژژ مردانه", 90, 1200000],
    ["کراتین مو (مردانه)", 120, 1900000],
    ["پاکسازی پوست مردانه", 50, 650000],
    ["ماساژ صورت", 30, 400000],
    ["کوتاهی مو نوجوان", 25, 220000],
  ],
};

const STAFF_TITLES_W = ["مدیر فنی", "آرایشگر ارشد", "متخصص رنگ و مش", "متخصص مو و کراتین", "ناخن‌کار", "میکاپ آرتیست", "متخصص پوست و لیزر", "کارشناس مژه و ابرو", "مسئول پذیرش"];
const STAFF_TITLES_M = ["آرایشگر ارشد", "اصلاح‌گر ریش", "متخصص کوتاهی فید", "مسئول پذیرش", "مدیر سالن"];
const SPECIALTIES_W = ["رنگ و مش", "کراتین و بوتاکس", "شینیون عروس", "میکاپ شب", "کاشت ناخن", "لاک ژل", "پاکسازی پوست", "لیزر مو", "لمینت مژه", "تتوی ابرو", "بافت مو", "میکرونیدلینگ"];
const SPECIALTIES_M = ["کوتاهی فید", "ریش و سبیل", "کراتین مردانه", "رنگ مو", "پاکسازی پوست", "موادگیری"];
const FIR_W = ["نگار", "سارا", "لیلا", "نازنین", "مهسا", "پریسا", "الهام", "صدف", "مریم", "بهاره", "شیوا", "ترانه", "آیدا", "پروین", "شیرین", "مینا", "فاطمه", "زهرا", "رعنا", "آسمه", "هستی", "گلنار", "رویا", "نسترن", "سیما", "مونا", "پارمیس", "آرزو"];
const FIR_M = ["امیر", "رضا", "مهدی", "علی", "حسین", "کیان", "بهراد", "آرمان", "فرهاد", "سام", "امید", "کامران", "بهرام", "سینا", "ماهن", "بردیا", "سروش", "بهنام", "پویا", "رامین"];
const LAST = ["رضایی", "محمدی", "احمدی", "کریمی", "حسینی", "موسوی", "جعفری", "صادقی", "رحیمی", "نادری", "قاسمی", "توکلی", "شفیعی", "عباسی", "مظفری", "کیانی", "هراتی", "زارع", "رستگار", "مطیعی", "فرهمند", "بهرامی", "اسدی", "جوادی", "شریفی"];

const REVIEW_TEXTS = [
  "خیلی راضی بودم، وقت‌شناسی دقیق و کار تمیز.",
  "رنگ مو عالی شد، دقیقاً همان چیزی که خواسته بودم.",
  "مهمان‌نوازی خوب و محیطی تمیز و مرتب.",
  "نفر دوم کمی دیر شروع کرد ولی نتیجه خوب بود.",
  "کاشت ناخن خیلی طبیعی شده، دست‌مزد شما گرم.",
  "برای میکاپ عروس انتخاب کردم و پشیمان نشدم.",
  "قیمت‌ها منصفانه است، کیفیت هم قابل قبول.",
  "پذیرش تلفنی پاسخگو بود ولی سالن شلوغ بود.",
  "کراتین مو واقعاً جواب داد، موهایم لطیف شده.",
  "متخصص پوست بسیار باحوصله بود و توضیح کامل داد.",
  "بوی خوش محیط و تمیزی ابزار قابل تقدیر است.",
  "یک بار نوبت جابه‌جا شد ولی در نهایت راضی هستم.",
  "شینیون مجلسی من را مهمان‌ها تعریف کردند.",
  "لمینت مژه خیلی طبیعی است، دیگر مژه مصنوعی نمی‌خواهم.",
  "امکانات پارکینگ ندارد ولی خود سالن خوب است.",
  "تیم جوان و باانرژی، حتماً دوباره می‌آیم.",
  "نتیجه دکلره مطلوب بود ولی زمان بیشتری گرفت.",
  "میکاپ شب برای مراسم کوتاه بود، کمی اصلاحش کردم.",
  "بهترین سالنی که تا حالا رفتم، ممنون از همه.",
  "قیمت نهایی با آنچه گفته شد تفاوت داشت.",
  "کار تمیز و منظم، ولی انتظارم بیشتر بود.",
  "وقتی با همان ساعت قرار گرفته بود شروع شد.",
  "برای خدمات ناخن عالی است، تنوع رنگ زیاد.",
  "پاکسازی پوست نتیجه‌اش بعد از دو جلسه مشخص شد.",
  "فضای دوستانه و پرسنل خوش‌برخورد.",
  "ریش‌تراشی و خط ریش خیلی دقیق انجام شد.",
  "کوتاهی فید مو عالی شد، دستتان درد نکند.",
  "سالن شلوغ است، حتماً از قبل وقت بگیرید.",
  "پیش‌ثبت نوبت از طریق سایت خیلی راحت است.",
  "هزینهٔ بیعانه منصفانه بود و به‌راحتی پرداخت شد.",
  "متأسفانه وقت دیرتر از ساعت رزرو شروع شد.",
  "مژه‌ها یکدست و قرینه شد، بسیار راضی‌ام.",
  "رنگ ابرو بعد از چند روز پرید، انتظارم بیشتر بود.",
  "امکانات رفاهی خوب و چای و میوه فراموش نشد.",
  "استاد کارش خوب است ولی نوبت‌دهی آنلاین بهتر شود.",
];
const CAMPAIGN_TEXTS = [
  "سلام {name} عزیز، این هفته در {salon} با ۱۵٪ تخفیف روی خدمات مو منتظرت هستیم.",
  "{salon}: وقت عید را از دست نده؛ همین حالا نوبتت را رزرو کن.",
  "یادآوری: نوبت شما در {salon} فردا است. در صورت نیاز جابه‌جاش کنید.",
  "طرح تازهٔ لمینت مژه در {salon} — با قیمت آشنا، کیفیت حرفه‌ای.",
  "{name} گرامی، ماه آینده نوبت قبلی شما یک‌ساله می‌شود؛ به‌یادماندنی‌اش کنیم.",
  "بستهٔ ویژهٔ عروس در {salon}: میکاپ، شینیون و گریم با یک قیمت.",
  "امروز ساعت آزاد زیادی داریم؛ {salon} بی‌انتظار شماست.",
  "نظر شما برای ما مهم است؛ لطفاً دربارهٔ آخرین نوبتتان در {salon} بنویسید.",
];
const TICKETS = [
  ["BOOKING", "نوبت دوبار ثبت شد", "یک نوبت را از طریق تلفن دادم و همان ساعت دوباره در پنل دیده می‌شود."],
  ["PAYMENT", "پرداخت بیعانه موفق نبود", "درگاه پیام خطا داد ولی مبلغ از حساب مشتری کسر شده است."],
  ["TECHNICAL", "پیامک تأیید ارسال نمی‌شود", "برای بعضی شماره‌ها پیامک تأیید نوبت نمی‌رسد؛ پنل پاندینگ می‌ماند."],
  ["GENERAL", "افزودن شعبهٔ جدید", "چطور می‌توانم شعبهٔ دوم را با ساعت کاری جدا اضافه کنم؟"],
  ["COMPLAINT", "کسر کارمزد اشتباه", "کارمزد پلن برای دو ماه یک‌بار کسر شده است."],
  ["TECHNICAL", "خروجی اکسل تاریخ‌ها", "تاریخ‌ها در فایل اکساور به شکل میلادی است."],
  ["BOOKING", "لغو نوبت از سمت مشتری", "مشتری می‌گوید نوبتش را لغو کرده ولی در پنل تأیید شده است."],
  ["GENERAL", "تغییر قیمت خدمات", "می‌خواهم قیمت‌ها را بر حسب تورم به‌روز کنم؛ آیا تاریخچه حفظ می‌شود؟"],
  ["PAYMENT", "فاکتور برای اشتراک", "برای پرداخت اشتراک فاکتور رسمی با شناسهٔ مالیاتی لازم دارم."],
  ["TECHNICAL", "صدای ضبط‌شده پخش نمی‌شود", "در بخش رزرو صوتی، فایل‌های قدیمی باز نمی‌شوند."],
];

/* ── پلن‌ها و رنگ‌مایه‌ها ─────────────────────────────────────────── */
const PALETTE = ["#f472b6", "#db2777", "#a21caf", "#7c3aed", "#0891b2", "#16a34a", "#f97316", "#dc2626", "#e11d48", "#4f46e5", "#0ea5e9", "#c026d3"];
const PLANS = ["FREE", "BASIC", "PRO", "ENTERPRISE"];

/* SLUGهای دمو که می‌مانند و بازنویسی می‌شوند (لینک‌ها و QRهای موجود نشکنند) */
const DEMO_SALONS = [
  ["mah", "سالن زیبایی ماه"], ["rose", "سالن رز"], ["sepideh", "سالن سپیده"], ["golha", "سالن گل‌ها"],
  ["niloofar", "سالن نیلوفر"], ["bahar", "سالن بهار"], ["sahand", "سالن سهند"], ["arian", "سالن آرین"],
];
/** سالن‌هایی که هنر گرافیکی آماده دارند (لوگو و بنر) */
const ART = new Set(["mah", "rose", "niloofar", "bahar", "ava", "gisso"]);
/** و آن‌هایی که تصویر گالری آماده دارند («mah» گالری ندارد) */
const GALLERY_ART = new Set(["rose", "niloofar", "bahar", "ava", "gisso"]);
/** تعداد آواتار پرسنل موجود برای هر سالن */
const STAFF_ART = { mah: 5, ava: 4, niloofar: 4, rose: 3, bahar: 3, gisso: 3 };

/* ── ۱) پاک‌سازی ─────────────────────────────────────────────────── */
/** جدول‌هایی که ردیف‌های این اسکریپت با پیشوند nr در آن‌ها می‌نشیند — فرزند به والد */
const SELF_CLEAN = [
  "webhookDelivery", "webhookConfig", "payment", "invoice", "order", "review", "voiceCall",
  "waitlistEntry", "timeBlock", "holiday", "favorite", "commissionPlan", "subscription",
  "cashRegisterEntry", "salonCustomerMedia", "salonCustomerNote", "salonCustomer", "galleryItem",
  "openingHour", "service", "staff", "branch", "notification", "giftCard", "discount",
  "supportTicket", "transaction", "payout", "wallet", "session", "otp", "auditLog",
];

async function clean() {
  const log = [];
  const kill = async (model, where, label) => {
    const n = await prisma[model].count({ where });
    if (n && !DRY) await prisma[model].deleteMany({ where });
    log.push(`${label}: ${n}`);
  };

  const stressSalons = await prisma.salon.findMany({
    where: { OR: [{ slug: { startsWith: "stress" } }, { name: { contains: "استرس" } }, { city: { contains: "تست" } }, { slug: { in: ["iiiiiiiiiii"] } }] },
    select: { id: true, slug: true },
  });
  const stressSalonIds = stressSalons.map((s) => s.id);
  const demoSlugs = DEMO_SALONS.map(([slug]) => slug);
  const demoSalons = await prisma.salon.findMany({ where: { slug: { in: demoSlugs } }, select: { id: true } });
  const demoSalonIds = demoSalons.map((s) => s.id);
  /** همهٔ فرزندانی که از نو ساخته می‌شوند: سالن‌های استرسی + ۸ سالن دمو */
  const scopeIds = [...stressSalonIds, ...demoSalonIds];

  const stressUsers = await prisma.user.findMany({
    where: {
      OR: [
        { phone: { startsWith: "0999" } },
        { phone: { startsWith: "0998" } },
        { email: { contains: "stress" } },
        { name: { contains: "استرس" } },
        { role: "CUSTOMER", email: { endsWith: "@nobino.ir" } },
      ],
    },
    select: { id: true },
  });
  const stressUserIds = stressUsers.map((u) => u.id);

  // ردیف‌های فرزند — فرزند به والد، به ترتیب معکوس وابستگی
  await kill("webhookDelivery", { config: { salonId: { in: scopeIds } } }, "WebhookDelivery(salon)");
  await kill("webhookConfig", { salonId: { in: scopeIds } }, "WebhookConfig");
  await kill("payment", { invoice: { salonId: { in: scopeIds } } }, "Payment(invoice)");
  await kill("payment", { appointment: { salonId: { in: scopeIds } } }, "Payment(appointment)");
  await kill("payment", { order: { userId: { in: stressUserIds } } }, "Payment(order)");
  await kill("invoice", { salonId: { in: scopeIds } }, "Invoice");
  await kill("order", { salonId: { in: scopeIds } }, "Order(salon)");
  await kill("order", { userId: { in: stressUserIds } }, "Order(user)");
  await kill("review", { salonId: { in: scopeIds } }, "Review");
  await kill("appointment", { salonId: { in: scopeIds } }, "Appointment");
  await kill("voiceCall", { salonId: { in: scopeIds } }, "VoiceCall");
  await kill("waitlistEntry", { salonId: { in: scopeIds } }, "WaitlistEntry");
  await kill("timeBlock", { salonId: { in: scopeIds } }, "TimeBlock");
  await kill("holiday", { salonId: { in: scopeIds } }, "Holiday");
  await kill("favorite", { salonId: { in: scopeIds } }, "Favorite");
  await kill("commissionPlan", { salonId: { in: scopeIds } }, "CommissionPlan");
  await kill("subscription", { salonId: { in: scopeIds } }, "Subscription");
  await kill("campaign", { salonId: { in: scopeIds } }, "Campaign");
  await kill("cashRegisterEntry", { salonId: { in: scopeIds } }, "CashRegisterEntry");
  await kill("salonCustomerMedia", { salonId: { in: scopeIds } }, "SalonCustomerMedia");
  await kill("salonCustomerNote", { customer: { salonId: { in: scopeIds } } }, "SalonCustomerNote");
  await kill("salonCustomer", { salonId: { in: scopeIds } }, "SalonCustomer");
  await kill("galleryItem", { salonId: { in: scopeIds } }, "GalleryItem");
  await kill("openingHour", { salonId: { in: scopeIds } }, "OpeningHour");
  await kill("service", { salonId: { in: scopeIds } }, "Service");
  await kill("staff", { salonId: { in: scopeIds } }, "Staff");
  await kill("branch", { salonId: { in: scopeIds } }, "Branch");
  await kill("notification", { salonId: { in: scopeIds } }, "Notification(salon)");

  // فقط سالن‌های استرسی حذف می‌شوند؛ دموها بازنویسی می‌شوند
  if (stressSalonIds.length && !DRY) await prisma.salon.deleteMany({ where: { id: { in: stressSalonIds } } });
  log.push(`Salon(stress): ${stressSalonIds.length}`);

  // ردیف‌های سراسریِ تستی
  await kill("giftCard", { OR: [{ ownerId: { in: stressUserIds } }, { code: { startsWith: "stress" } }] }, "GiftCard");
  await kill("supportTicket", { OR: [{ userId: { in: stressUserIds } }, { phone: { startsWith: "0999" } }, { phone: { startsWith: "0998" } }] }, "SupportTicket");
  await kill("transaction", { wallet: { ownerId: { in: stressUserIds } } }, "Transaction");
  await kill("payout", { wallet: { ownerId: { in: stressUserIds } } }, "Payout");
  await kill("wallet", { ownerId: { in: stressUserIds } }, "Wallet");
  await kill("session", { userId: { in: stressUserIds } }, "Session");
  await kill("notification", { recipient: { startsWith: "099" } }, "Notification(stress)");
  await kill("otp", { OR: [{ phone: { startsWith: "0999" } }, { phone: { startsWith: "0998" } }] }, "Otp(stress)");
  await kill("auditLog", { actorPhone: { startsWith: "099" } }, "AuditLog(stress)");
  await kill("webhookDelivery", { config: { url: { contains: "stress" } } }, "WebhookDelivery(url)");
  await kill("package", { name: { contains: "استرس" } }, "Package(stress)");
  await kill("setting", { key: { startsWith: "stress." } }, "Setting(stress)");
  // ردیف‌هایی که این اسکریپت قبلاً ساخته (اجرای دوباره امن باشد)
  await kill("appointment", { id: { startsWith: "nr" } }, "Appointment(real)");
  for (const model of SELF_CLEAN) await kill(model, { id: { startsWith: "nr" } }, `${model}(nr)`);

  // خودِ کاربرهای تستی، بعد از تمام فرزندها. ادمین/نماینده/مالک‌های واقعی این‌جا نمی‌آیند.
  // نگهبان: کاربری که سالنِ «خارج از دامنه» دارد حذف نمی‌شود، چون Salon.owner روی Cascade است.
  const risky = await prisma.salon.findMany({
    where: { ownerId: { in: stressUserIds }, id: { notIn: scopeIds } },
    select: { slug: true, name: true, ownerId: true },
  });
  const safeUserIds = stressUserIds.filter((id) => !risky.some((r) => r.ownerId === id));
  if (risky.length) console.log(`   ⚠ مالک سالنِ خارج از دامنه — کاربر حذف نشد: ${risky.map((r) => r.slug).join("، ")}`);
  await kill("user", { id: { in: safeUserIds } }, "User(test)");

  console.log("🧹 پاک‌سازی:");
  console.log("   " + log.filter((l) => !l.endsWith(": 0")).join("\n   "));
  return { stressSalons, stressUserIds: safeUserIds };
}

/* ── ۲) الگوهای متنی محتوا ───────────────────────────────────────── */

const DESC_W = [
  "{name} در {city}: خدمات مو، رنگ و مش، شینیون و میکاپ با کادری آموزش‌دیده. مشاورهٔ پیش از خدمات رایگان است و برای مراسم عروس بستهٔ ویژه داریم.",
  "آرایشگاه حرفه‌ای {name} با محیطی دنج و بهداشتی؛ ابزار یک‌بارمصرف، ضدعفونی روزانه و پذیرش وقت از طریق سایت.",
  "تخصص ما در {name} رنگ و مش و صاف‌کردن مو است. از دکلرهٔ پایه‌ده تا کراتین برزیل، همه با ضمانت بازگشت.",
  "{name}؛ خدمات ناخن، میکاپ شب و پاکسازی پوست در یک سقف. برای مهمانی‌ها و مراسم بستهٔ ترکیبی تهیه کنید.",
  "تیم {name} روی گریم عروس کار می‌کند: تست گریم پیش از مراسم، همکاری با تالار و بستهٔ کامل مو و میکاپ.",
  "در {name} برای هر مشتری وقت اختصاصی در نظر می‌گیریم؛ تاخیر در شروع نوبت با تخفیف جبران می‌شود.",
  "{name} با بیش از ده سال سابقه در {city}؛ خدمات مو، اپیلاسی، ناخن و مراقبت پوست.",
  "محیط {name} خانوادگی و بدون شلوغی است. رزرو آنلاین، یادآوری پیامکی و امکان جابه‌جایی نوبت تا ۲۴ ساعت قبل.",
  "خدمات تخصصی مو در {name}: کوتاهی، مدل، رنگ، مش و درمان موی آسیب‌دیده با برندهای معتبر.",
  "{name}: استودیو عکاسی آرایشگاه، میکاپ artyst و شینیون؛ مناسب عروس‌ها و مراسم رسمی.",
];
const DESC_M = [
  "{name}؛ آرایشگاه مردانه در {city} با خدمات کوتاهی، فید، اصلاح ریش و خط ریش. پذیرش بدون وقت هم داریم، ولی رزرو آنلاین اولویت دارد.",
  "در {name} کوتاهی مو با دستگاه و قیچی، رنگ آمیاک، فید کلاسیک و مدرن و اصلاح ریش انجام می‌شود.",
  "آرایشگاه {name} با کادر مجرب، محیطی تمیز و ساعت کاری منظم؛ کارمزد services نقد و کارت‌به‌کارت.",
  "{name}: تخصص ما فید و سایه، مدل ریش و پاکسازی پوست مردانه است. وقت‌ها را تلفنی یا آنلاین بگیرید.",
  "ریش‌تراشی با حولهٔ گرم، کوتاهی مو و ماساژ صورت در {name}؛ برای جلسات مهم، ساعت مشخص رزرو کنید.",
];
const CRM_NOTES = [
  "به بوی قوی رنگ حساسیت دارد؛ از برندهای بدون آمونیاک استفاده شود.",
  "معمولاً با مترو می‌آید و سر وقت حاضر است.",
  "برای مراسم نامزدی رزرو کرده؛ نتیجهٔ قبلی را خیلی پسندیده بود.",
  "ترجیح می‌دهد آرایشگر ثابت داشته باشد.",
  "سابقهٔ شکستن ناخن دارد؛ زمان کاشت را بیشتر در نظر بگیریم.",
  "پیامک یادآوری را دوست ندارد؛ تماس تلفنی بهتر است.",
  "همیشه برای خدمات پوست وقت آخر هفته می‌گیرد.",
  "مشتری وفادار؛ بیش از ده نوبت در یک سال.",
  "یک‌بار نوبت را در دقیقهٔ آخر لغو کرد؛ بیعانهٔ همان ماه برگشت داده شد.",
  "برای مژه حساسیت چشمی دارد؛ تست قبل از خدمات.",
];
const APPT_NOTES = [
  "همراه با تست رنگ.",
  "درخواست ساعت زودتر از ظهر.",
  "همراه با شامپوی مخصوص خود مشتری.",
  "برای مراسم شب؛ وقت آخر روز.",
  "بیعانه از قبل پرداخت شده.",
  "درخواست آرایشگر مشخص.",
  "هماهنگی با تالار انجام شود.",
  "",
];
const CANCEL_REASONS = [
  "مشتری در سفر است",
  "تغییر برنامهٔ مراسم",
  "بیماری",
  "همپوشانی با نوبت دیگر",
  "تأخیر طولانی در شروع نوبت",
];
const BLOCK_REASONS = ["مرخصی", "کلاس آموزشی", "قرار پزشکی", "جابه‌جایی خانوادگی", "عروضهٔ شخصی"];
const REVIEW_REPLIES = [
  "ممنون از لطف شما؛ منتظر حضور دوباره‌تان هستیم.",
  "سپاس از بازخوردتان. برای کوتاه‌تر شدن زمان انتظار، پذیرش را یک نفره کردیم.",
  "از توجه شما به جزئیات سپاسگزاریم. تیم ما همین را هدف گرفته است.",
  "متأسفیم بابت تأخیر؛ برنامهٔ نوبت‌دهی را اصلاح کردیم.",
  "ممنون که وقت گذاشتید و نوشتید. خوشحال می‌شویم دوباره ببینیمتان.",
];
const HOLIDAYS = [
  ["2026-11-04", "۱۳ آبان"],
  ["2026-11-17", "میلاد پیامبر اکرم"],
  ["2027-01-06", "دههٔ فجر"],
  ["2027-02-11", "۲۲ بهمن"],
  ["2027-03-20", "عید نوروز"],
  ["2027-03-21", "دوم روز نوروز"],
  ["2027-04-02", "روز طبیعت"],
];
const CAMPAIGN_NAMES = [
  "کمپین پاییز مو", "طرح عروس ۱۴۰۵", "یادآوری مشتری‌های راکد", "تخفیف پنجشنبه‌ها",
  ".launch خدمات پوست", "طرح ناخن زمستانه", "قدردانی مشتریان وفادار", "کمپین مژه و ابرو",
];
const VOICE_LINES = [
  "سلام، وقتتون بخیر. {day} ساعت {time} یه وقت {service} می‌خواستم، اگه امکان داره با {staff}.",
  "ببخشید من {name} هستم، مشتری همیشگی. برای {service} یه نوبت آزاد دارید؟",
  "سلام. می‌خواستم نوبت {service} رو جابه‌جا کنم، روز بعد ممكن باشه؟",
  "وقتتون بخیر. برای {service} بیایم، هزینه‌اش چقدر میشه؟ یه وقت بگیرید لطفاً.",
  "سلام، خواستم برای مراسم هفتهٔ بعد {service} و شینیون رزرو کنم.",
];
const BANKS = ["بانک ملی", "بانک ملت", "بانک سامان", "بانک پاسارگاد", "بانک صادرات", "بانک پارسیان"];
const DEVICES = ["کروم ویندوز", "سافاری آیفون", "کروم اندروید", "فایرفاکس لینوکس", "اپل سافاری مک", "کروم تلویزیون"];
const WEBHOOK_EVENTS = ["appointment.created", "appointment.confirmed", "appointment.cancelled", "appointment.completed", "payment.paid", "review.created"];
const CARD_PREFIX = ["610433", "589210", "603799", "627353", "636214", "502908", "177662"];
const CRM_TAGS = ["مو", "ناخن", "پوست", "میکاپ", "عروس", "مداوم", "ویژه", "تخفیفی", "مرجوعی"];
const GALLERY_TITLES = {
  مو: ["رنگ مشبک", "کوتاهی و سشوار", "کراتین براق", "شینیون مجلسی", "بافت موج‌دار"],
  میکاپ: ["میکاپ عروس", "گریم مراسم", "میکاپ شب", "آرایش کلاسیک"],
  ناخن: ["کاشت ژلنی", "فرنچ کلاسیک", "لاک ژل پاییزه", "طراحی روی ناخن"],
  پوست: ["پاکسازی تخصصی", "میکروابریژن", "هایفوتراپی", "مزو و ویتامینه"],
  "مژه و ابرو": ["کاشت مژه", "لمینت طبیعی", "لیفت ابرو", "تتوی فیبر"],
  مردانه: ["فید کلاسیک", "خط ریش اصلاح‌شده", "کوتاهی مدرن", "ریش و سبیل"],
};
const GALLERY_URL = ["hair.svg", "makeup.svg", "nails.svg"];
const REGISTER_NOTES = ["بستهٔ روزانه", "شیفت بعدازظهر", "فروش شب", "هزینهٔ مواد مصرفی", "تسویهٔ دستگاه کارت‌خوان"];

/* ── ۳) ابزارهای تولید ───────────────────────────────────────────── */
const taken = { phone: new Set(), email: new Set(), code: new Set(), pair: new Set(), num: new Set(), token: new Set() };
const MOBILE = ["0912", "0913", "0914", "0915", "0916", "0917", "0918", "0919", "0901", "0902", "0935", "0936", "0937", "0938", "0939"];

function hashDigits(str, len) {
  let h = 2166136261;
  for (const ch of String(str)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return String(h % 10 ** len).padStart(len, "0");
}
/** شمارهٔ همراه ثابت از روی کلید (اجرای دوباره کاربر تکراری نمی‌سازد) */
function fixedPhone(prefixes, key) {
  const base = prefixeArray(prefixes);
  for (let t = 0; t < 40; t++) {
    const p = base[t % base.length] + hashDigits(key + "#" + t, 7);
    if (!taken.phone.has(p)) {
      taken.phone.add(p);
      return p;
    }
  }
  throw new Error("شمارهٔ یکتا پیدا نشد: " + key);
}
const prefixeArray = (x) => (Array.isArray(x) ? x : [x]);
function mobilePhone() {
  for (let t = 0; t < 60; t++) {
    const p = pick(MOBILE) + String(rand(1000000, 9999999));
    if (!taken.phone.has(p)) {
      taken.phone.add(p);
      return p;
    }
  }
  throw new Error("شمارهٔ تستی یکتا پیدا نشد");
}
const landline = (code) => code + String(rand(code === "021" || code === "026" ? 10000000 : 1000000, code === "021" || code === "026" ? 99999999 : 9999999));
const codeOf = (prefix, len = 5) => {
  for (let t = 0; t < 200; t++) {
    const c = `${prefix}${String(rand(0, 10 ** len - 1)).padStart(len, "0")}`;
    if (!taken.code.has(c)) {
      taken.code.add(c);
      return c;
    }
  }
  throw new Error("کد یکتا پیدا نشد: " + prefix);
};
const hex = (n) => randomBytes(n).toString("hex");
const pday = (d) => (d.getDay() + 1) % 7; // شنبه = ۰
const DAYS_FA = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const faDigits = (s) => String(s).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
const toMin = (s) => {
  const [h = "0", m = "0"] = String(s).split(":");
  return Number(h) * 60 + Number(m);
};
const dayShift = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return d;
};
const jitter = (base, spread = 0.12) => Math.max(1, Math.round((base * (1 - spread + Math.random() * spread * 2)) / 10000) * 10000);
const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
const woman = () => `${pick(FIR_W)} ${pick(LAST)}`;
const man = () => `${pick(FIR_M)} ${pick(LAST)}`;
const personName = (kind) => (kind === "M" ? man() : woman());

/* ── ۴) ساخت سالن‌ها در حافظه ────────────────────────────────────── */
/** @returns هر spec شامل id از پیش‌ساخته‌شده و همهٔ فرزندها */
function buildSpecs(demoRows) {
  const bySlug = new Map(demoRows.map((s) => [s.slug, s]));
  const specs = [];
  const seenSlug = new Set(demoRows.filter((s) => !DEMO_SALONS.some(([d]) => d === s.slug)).map((s) => s.slug));

  const add = (slug, brand, kind, fixedName, demo) => {
    if (seenSlug.has(slug)) return;
    seenSlug.add(slug);
    const c = CITY[rand(0, CITY.length - 1)];
    const [city, telCode, lat, lng, districts] = c;
    const name = fixedName || `${pick(kind === "M" ? M_TYPES : W_TYPES)} ${brand}`;
    const row = bySlug.get(slug);
    const spec = {
      id: row ? row.id : nid("s"),
      slug,
      brand,
      kind,
      name,
      city,
      isDemo: !!row,
      existing: row,
      ownerId: row ? row.ownerId : null,
      ownerKey: slug,
      phone: landline(telCode),
      mobile: fixedPhone(["0912", "0990", "0935"], "salon" + slug),
      email: `info@${slug}.ir`,
      instagram: `@${slug}.salon`,
      website: Math.random() < 0.22 ? `https://${slug}.ir` : null,
      whatsapp: null,
      coverColor: pick(PALETTE),
      latitude: Math.round((lat + (Math.random() - 0.5) * 0.08) * 100000) / 100000,
      longitude: Math.round((lng + (Math.random() - 0.5) * 0.08) * 100000) / 100000,
      address: `${city}، ${pick(districts)}، ${pick(STREET)}، پلاک ${rand(1, 180)}`,
      description: fill(pick(kind === "M" ? DESC_M : DESC_W), { name, city }),
      plan: pick(["BASIC", "BASIC", "PRO", "PRO", "PRO", "ENTERPRISE"]),
      customDomain: null,
      isApproved: demo ? true : Math.random() > 0.05,
      depositEnabled: false,
      depositMode: "FIXED",
      depositValue: 0,
      minNoticeMinutes: pick([30, 45, 60, 90, 120]),
      maxAdvanceDays: pick([14, 21, 30, 45, 60]),
      cancelDeadlineHours: pick([6, 12, 24, 48]),
      bufferMinutes: pick([0, 5, 10, 15]),
      hours: [],
      services: [],
      staff: [],
      branches: [],
    };
    spec.whatsapp = spec.mobile;
    // ── ساعت کاری: پنجشنبه بلندتر، جمعه یا بسته یا نیم‌روز
    const openMin = pick([9 * 60, 540, 10 * 60, 630]);
    const closeMin = pick([20 * 60, 1230, 21 * 60, 1320]);
    spec.hours = [0, 1, 2, 3, 4, 5, 6].map((day) => {
      const closed = day === 6 ? Math.random() < 0.55 : false;
      const open = day === 5 ? openMin : openMin + pick([0, 0, 30]);
      const close = day === 5 ? Math.min(22 * 60, closeMin + 60) : day === 4 ? Math.max(open + 120, closeMin - 60) : closeMin;
      return { dayOfWeek: day, openTime: hhmm(open), closeTime: hhmm(close), isClosed: closed };
    });
    // ── شعبه‌ها
    const nb = Math.random() < 0.25 ? rand(2, 3) : 1;
    spec.branches = Array.from({ length: nb }, (_, i) => ({
      id: nid("b"),
      salonId: spec.id,
      name: i === 0 ? "شعبهٔ مرکزی" : `شعبهٔ ${pick(districts)}`,
      city,
      address: i === 0 ? spec.address : `${city}، ${pick(districts)}، ${pick(STREET)}، پلاک ${rand(1, 180)}`,
      phone: landline(telCode),
      isActive: true,
    }));
    // ── خدمات
    const pool = kind === "M" ? SERVICES_M["مردانه"] : Object.values(SERVICES_W).flat();
    const usedSvc = new Set();
    const svcCount = kind === "M" ? rand(5, 7) : rand(6, 9);
    for (let i = 0; i < svcCount; i++) {
      let t = 0;
      let item;
      do item = pick(pool); while (usedSvc.has(item[0]) && ++t < 20);
      if (usedSvc.has(item[0])) break;
      usedSvc.add(item[0]);
      const [svcName, durationMin, basePrice, desc] = item;
      const category = kind === "M" ? "مردانه" : Object.entries(SERVICES_W).find(([, list]) => list.includes(item))?.[0] ?? "مو";
      spec.services.push({
        id: nid("v"),
        salonId: spec.id,
        branchId: pick(spec.branches).id,
        name: svcName,
        durationMin,
        price: jitter(basePrice),
        description: desc ?? null,
        category,
        bufferMin: pick([0, 0, 5, 10, 15]),
        isActive: Math.random() > 0.06,
      });
    }
    // ── پرسنل
    const titles = kind === "M" ? STAFF_TITLES_M : STAFF_TITLES_W;
    const specs_ = kind === "M" ? SPECIALTIES_M : SPECIALTIES_W;
    const staffCount = ART.has(slug) ? STAFF_ART[slug] : rand(2, 4);
    for (let i = 0; i < staffCount; i++) {
      const dayRows = spec.hours.map((h) => ({ day: h.dayOfWeek, open: h.openTime, close: h.closeTime, isClosed: h.isClosed }));
      spec.staff.push({
        id: nid("f"),
        salonId: spec.id,
        branchId: pick(spec.branches).id,
        name: personName(kind),
        title: titles[i % titles.length],
        role: i === 0 ? "MANAGER" : i === staffCount - 1 && Math.random() < 0.4 ? "RECEPTION" : "STYLIST",
        commissionPercent: pick([10, 15, 18, 20, 25, 30, 35]),
        bio: Math.random() < 0.5 ? `${pick(specs_)}؛ ${rand(3, 15)} سال سابقهٔ کاری در ${city}.` : null,
        avatarUrl: ART.has(slug) ? `/seed/${slug}-staff-${Math.min(i, (STAFF_ART[slug] ?? 3) - 1)}.svg` : null,
        specialties: Array.from(new Set([pick(specs_), pick(specs_), ...(Math.random() < 0.5 ? [pick(specs_)] : [])])),
        isActive: true,
        schedule: dayRows,
      });
    }
    // ── بیعانه
    if (Math.random() < 0.42) {
      spec.depositEnabled = true;
      spec.depositMode = Math.random() < 0.6 ? "PERCENT" : "FIXED";
      spec.depositValue = spec.depositMode === "PERCENT" ? pick([10, 15, 20, 25, 30]) : pick([100000, 150000, 200000, 300000, 500000]);
    }
    // ── دامنهٔ اختصاصی برای بعضی سالن‌ها
    const domain = `${slug}.ir`;
    if (Math.random() < 0.18 && !taken.code.has(domain)) {
      spec.customDomain = domain;
      taken.code.add(domain);
    }
    specs.push(spec);
    return spec;
  };

  for (const [slug, name] of DEMO_SALONS) add(slug, name.replace(/^(سالن زیبایی|سالن)\s*/, ""), "W", name, true);
  for (const [slug, brand, kind] of BRAND) add(slug, brand, kind, null, false);
  return specs;
}

/* ── ۵) بقیهٔ جدول‌ها ─────────────────────────────────────────────── */
const R = {};
const add = (key, row) => ((R[key] ||= []).push(row), row);

function buildSalonChildren(spec, customers) {
  // ساعات کاری + تعطیلات
  for (const h of spec.hours) add("hours", { id: nid("h"), salonId: spec.id, ...h });
  for (let i = 0; i < rand(1, 2); i++) {
    const [date, reason] = pick(HOLIDAYS);
    add("holidays", { id: nid("d"), salonId: spec.id, branchId: null, date: new Date(date + "T12:00:00"), isClosed: Math.random() < 0.8, openTime: null, closeTime: null, reason });
  }
  // پرسنل و خدمات و شعبه
  for (const b of spec.branches) add("branches", b);
  for (const v of spec.services) add("services", v);
  for (const f of spec.staff) add("staff", f);

  // گالری
  const catsUsed = Array.from(new Set(spec.services.map((s) => s.category)));
  const galleryCount = GALLERY_ART.has(spec.slug) ? 3 : rand(3, 5);
  for (let i = 0; i < galleryCount; i++) {
    const cat = catsUsed[i % catsUsed.length] || "مو";
    add("gallery", {
      id: nid("g"),
      salonId: spec.id,
      title: pick(GALLERY_TITLES[cat] || GALLERY_TITLES["مو"]),
      imageUrl: GALLERY_ART.has(spec.slug) && i < 3 ? `/seed/${spec.slug}-gallery-${i}.svg` : `/gallery/${GALLERY_URL[i % GALLERY_URL.length]}`,
      type: "image",
      sortOrder: i,
    });
  }

  // وقت‌های رزرو
  const appts = [];
  for (let k = 0; k < 8; k++) {
    const future = k >= 5;
    let start = null;
    for (let try_ = 0; try_ < 14 && !start; try_++) {
      const date = dayShift(future ? rand(1, spec.maxAdvanceDays > 12 ? 12 : spec.maxAdvanceDays) : -rand(1, 45));
      const h = spec.hours[pday(date)];
      if (!h || h.isClosed) continue;
      const svc = pick(spec.services);
      if (!svc) break;
      const open = toMin(h.openTime);
      const latest = toMin(h.closeTime) - svc.durationMin - 30;
      if (latest < open) continue;
      const m = open + Math.floor(rand(0, Math.floor((latest - open) / 30))) * 30;
      const d = new Date(date);
      d.setHours(Math.floor(m / 60), m % 60, 0, 0);
      start = { d, svc, date };
    }
    if (!start) continue;
    const staff = pick(spec.staff);
    const cust = Math.random() < 0.15 ? null : pick(customers);
    const price = start.svc.price;
    const dep = spec.depositEnabled ? (spec.depositMode === "PERCENT" ? Math.round((price * spec.depositValue) / 100 / 1000) * 1000 : Math.min(spec.depositValue, price)) : null;
    let status;
    if (future) status = Math.random() < 0.62 ? "CONFIRMED" : "REQUESTED";
    else {
      const r = Math.random();
      status = r < 0.78 ? "COMPLETED" : r < 0.9 ? "CANCELLED" : "NO_SHOW";
    }
    const created = new Date(start.d);
    created.setDate(created.getDate() - (future ? rand(0, 6) : rand(2, 20)));
    appts.push({
      id: nid("a"),
      salonId: spec.id,
      serviceId: start.svc.id,
      customerId: cust ? cust.id : null,
      employeeId: staff ? staff.id : null,
      branchId: start.svc.branchId ?? null,
      customerName: cust ? cust.name : personName(spec.kind),
      customerPhone: cust ? cust.phone : mobilePhone(),
      startAt: start.d,
      endAt: new Date(start.d.getTime() + (start.svc.durationMin + start.svc.bufferMin) * 60000),
      status,
      channel: "MANUAL",
      note: pick(APPT_NOTES) || null,
      cancelReason: status === "CANCELLED" ? pick(CANCEL_REASONS) : null,
      cancelledAt: status === "CANCELLED" ? created : null,
      depositAmount: dep,
      depositPaid: dep ? status === "COMPLETED" || status === "CONFIRMED" || Math.random() < 0.5 : false,
      priceSnapshot: price,
      createdAt: created,
      _cust: cust,
      _svc: start.svc,
      _staff: staff,
    });
  }
  return appts;
}

function buildMoney(spec, packages) {
  const pkg = packages.find((p) => p.plan === spec.plan) || pick(packages);
  const period = Math.random() < 0.25 ? "YEARLY" : "MONTHLY";
  const price = period === "YEARLY" ? pkg.yearlyPrice || pkg.price * 10 : pkg.price;
  const days = period === "YEARLY" ? 365 : pkg.durationDays;
  const lapsed = Math.random() < 0.22; // یک‌پنجم سالن‌ها اشتراکشان گذشته است
  const startsAt = lapsed ? dayShift(-rand(days + 5, days + 120)) : dayShift(-rand(0, Math.max(1, days - 3)));
  const endsAt = new Date(startsAt.getTime() + days * 86400000);
  spec.subEndsAt = endsAt;
  const expired = lapsed;
  const subId = nid("b");
  add("subs", {
    id: subId, salonId: spec.id, packageId: pkg.id, startsAt, endsAt, period,
    autoRenew: Math.random() < 0.6, status: expired ? (Math.random() < 0.5 ? "EXPIRED" : "CANCELLED") : "ACTIVE",
    cancelledAt: null,
  });
  const orderId = nid("o");
  add("orders", {
    id: orderId, userId: spec.ownerId, salonId: spec.id, packageId: pkg.id, discountId: null,
    amount: price, originalAmount: price, period, autoRenew: Math.random() < 0.5, status: "PAID", createdAt: startsAt,
  });
  const invId = nid("i");
  add("invoices", {
    id: invId, number: invoiceNumber(), salonId: spec.id, subscriptionId: subId, orderId, kind: "SUBSCRIPTION",
    customerName: null, customerPhone: null, description: `${pkg.name} — ${period === "YEARLY" ? "سالانه" : "ماهانه"}`,
    payToken: null, amount: price, originalAmount: price, period, status: "PAID",
    issuedAt: startsAt, dueAt: new Date(startsAt.getTime() + 72 * 3600000), paidAt: startsAt,
  });
  add("payments", paymentRow({ orderId, invoiceId: invId, amount: price, status: "PAID", createdAt: startsAt }));
  return { subId, expired };
}

let invSeq = 0;
function invoiceNumber() {
  for (;;) {
    const n = `INV-1405-${String(++invSeq).padStart(5, "0")}`;
    if (!taken.num.has(n)) {
      taken.num.add(n);
      return n;
    }
  }
}
function paymentRow({ orderId = null, invoiceId = null, appointmentId = null, amount, status, createdAt }) {
  const gateway = pick(["zarinpal", "saman", "mellat", "pasargad", "idpay"]);
  return {
    id: nid("p"), orderId, invoiceId, appointmentId, gateway, amount, status,
    authority: hex(11),
    refId: status === "PAID" ? String(rand(100000000000, 999999999999)) : null,
    cardPan: status === "PAID" ? pick(CARD_PREFIX) + String(rand(100000000, 999999999)) : null,
    payload: { gateway, amount, status, trace: String(rand(10000000, 99999999)) },
    callbackUrl: `https://nobino.app/api/payments/${gateway}/callback`,
    createdAt,
  };
}

/* ── ۶) سید اصلی ─────────────────────────────────────────────────── */
async function seed() {
  const packages = await prisma.package.findMany({ where: { name: { not: { contains: "استرس" } } }, orderBy: { price: "asc" } });
  if (!packages.length) throw new Error("پکیج واقعی SaaS در دیتابیس نیست؛ prisma/seed.mjs را اجرا کنید.");
  const agents = await prisma.user.findMany({ where: { role: "AGENT" }, orderBy: { createdAt: "asc" } });
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  const demoRows = await prisma.salon.findMany({ where: { slug: { in: DEMO_SALONS.map(([s]) => s) } } });
  const otherSalons = await prisma.salon.findMany({ select: { slug: true, customDomain: true } });
  for (const s of otherSalons) if (s.customDomain) taken.code.add(s.customDomain);
  for (const u of await prisma.user.findMany({ select: { phone: true, email: true } })) {
    taken.phone.add(u.phone);
    if (u.email) taken.email.add(u.email);
  }
  for (const r of await prisma.invoice.findMany({ select: { number: true } })) taken.num.add(r.number);

  const specs = buildSpecs(demoRows);
  console.log(`🏷  برنامه: ${specs.length} سالن (${specs.filter((s) => !s.isDemo).length} تازه، ${specs.filter((s) => s.isDemo).length} بازنویسی)`);

  /* الف) مالک‌ها */
  const password = hashPassword(DEMO_PASSWORD);
  for (const spec of specs) {
    if (spec.ownerId) continue;
    const name = personName(spec.kind === "M" ? "M" : "W");
    const phone = fixedPhone(["0912", "0913", "0916", "0917", "0919"], "owner" + spec.slug);
    const email = `owner.${spec.slug}@nobino.ir`;
    const row = { phone, name, email, role: "SALON_OWNER", passwordHash: password, verifiedAt: new Date(), isActive: true };
    if (DRY) {
      spec.ownerId = nid("u");
      continue;
    }
    const u = await prisma.user.upsert({ where: { phone }, update: { name, email, role: "SALON_OWNER", isActive: true }, create: { id: nid("u"), ...row } });
    spec.ownerId = u.id;
  }
  // سالن‌های دمو که مالک ندارند (نباید باشد) — از مالک‌های موجود بردار
  const spareOwner = specs.find((s) => s.ownerId)?.ownerId;
  for (const spec of specs) if (!spec.ownerId) spec.ownerId = spareOwner || admin?.id;

  /* ب) مشتری‌ها */
  const customers = [];
  for (let i = 0; i < 150; i++) {
    const phone = fixedPhone([MOBILE[i % MOBILE.length]], "customer" + i);
    const name = personName(Math.random() < 0.82 ? "W" : "M");
    if (DRY) {
      customers.push({ id: nid("u"), phone, name });
      continue;
    }
    const u = await prisma.user.upsert({
      where: { phone },
      update: { name, role: "CUSTOMER" },
      create: { id: nid("u"), phone, name, role: "CUSTOMER", loyaltyPoints: pick([0, 0, 25, 60, 120, 300]), verifiedAt: new Date(), isActive: true },
    });
    customers.push({ id: u.id, phone: u.phone, name: u.name || name });
  }

  /* پ) سالن‌ها */
  for (const spec of specs) {
    const data = {
      slug: spec.slug, name: spec.name, phone: spec.phone, city: spec.city, address: spec.address, description: spec.description,
      email: spec.email, whatsapp: spec.whatsapp, instagram: spec.instagram, website: spec.website,
      logoUrl: ART.has(spec.slug) ? `/seed/${spec.slug}-logo.svg` : null,
      bannerUrl: ART.has(spec.slug) ? `/seed/${spec.slug}-banner.svg` : null,
      coverColor: spec.coverColor, timezone: "Asia/Tehran", latitude: spec.latitude, longitude: spec.longitude,
      customDomain: spec.customDomain, domainStatus: spec.customDomain ? (Math.random() < 0.6 ? "VERIFIED" : "PENDING") : "NONE",
      domainToken: spec.customDomain ? hex(8) : null,
      isApproved: spec.isApproved, isActive: true, plan: spec.plan,
      minNoticeMinutes: spec.minNoticeMinutes, maxAdvanceDays: spec.maxAdvanceDays,
      cancelDeadlineHours: spec.cancelDeadlineHours, bufferMinutes: spec.bufferMinutes,
      depositEnabled: spec.depositEnabled, depositMode: spec.depositMode, depositValue: spec.depositValue,
      ownerId: spec.ownerId,
    };
    if (DRY) continue;
    await prisma.salon.upsert({ where: { slug: spec.slug }, update: data, create: { id: spec.id, ...data } });
  }

  /* ت) فرزندان */
  const allAppts = [];
  for (const spec of specs) {
    const appts = buildSalonChildren(spec, customers);
    for (const a of appts) add("appts", a);
    allAppts.push({ spec, appts });
    buildMoney(spec, packages);

    // CRM سالن
    const seenCrm = new Set();
    for (let i = 0; i < rand(2, 4); i++) {
      const c = pick(customers);
      if (seenCrm.has(c.phone)) continue;
      seenCrm.add(c.phone);
      const visits = rand(1, 14);
      const spend = visits * pick([280000, 450000, 850000, 1200000, 2100000]);
      const id = nid("c");
      add("crm", {
        id, salonId: spec.id, phone: c.phone, name: c.name, firstName: c.name.split(" ")[0], lastName: c.name.split(" ")[1] ?? null,
        note: Math.random() < 0.45 ? pick(CRM_NOTES) : null, visits, spend, lastVisitAt: dayShift(-rand(1, 120)),
        tags: Array.from(new Set([pick(CRM_TAGS), ...(Math.random() < 0.5 ? [pick(CRM_TAGS)] : [])])),
      });
      if (Math.random() < 0.5) add("crmNotes", { id: nid("n"), customerId: id, authorId: spec.ownerId, note: pick(CRM_NOTES) });
      if (Math.random() < 0.55)
        add("crmMedia", {
          id: nid("m"), salonId: spec.id, customerId: id,
          type: Math.random() < 0.7 ? "photo" : "voice",
          url: `/uploads/${spec.slug}/${hex(6)}.jpg`, name: `${spec.brand}-نمونه‌کار.jpg`, mimeType: "image/jpeg", size: rand(80, 900) * 1024,
        });
    }

    // بلاک زمانی پرسنل + لیست انتظار
    for (let i = 0; i < rand(1, 2); i++) {
      if (!spec.staff.length) break;
      const f = pick(spec.staff);
      const d = dayShift(rand(-10, 15));
      const h = spec.hours[pday(d)] || openHourOf(spec);
      const m = toMin(h.openTime) + rand(0, 5) * 60;
      const s = new Date(d);
      s.setHours(Math.floor(m / 60), m % 60, 0, 0);
      add("blocks", { id: nid("t"), salonId: spec.id, branchId: f.branchId ?? null, staffId: f.id, startAt: s, endAt: new Date(s.getTime() + rand(60, 240) * 60000), reason: pick(BLOCK_REASONS) });
    }
    add("waitlist", {
      id: nid("w"), salonId: spec.id, employeeId: spec.staff.length ? pick(spec.staff).id : null,
      serviceId: spec.services.length ? pick(spec.services).id : null,
      customerName: personName(spec.kind), customerPhone: mobilePhone(), note: Math.random() < 0.4 ? "فقط صبح وقت آزاد دارید" : null,
      status: pick(["WAITING", "WAITING", "NOTIFIED", "BOOKED", "EXPIRED"]), notifiedAt: null,
    });

    // علاقه‌مندی
    for (let i = 0; i < rand(1, 3); i++) {
      const c = pick(customers);
      const key = c.id + spec.id;
      if (taken.pair.has(key)) continue;
      taken.pair.add(key);
      add("favorites", { id: nid("r"), userId: c.id, salonId: spec.id });
    }

    // کمپین پیامکی
    add("campaigns", {
      id: nid("k"), salonId: spec.id, name: pick(CAMPAIGN_NAMES), channel: "SMS", segment: pick(["ALL", "ALL", "RETURNING"]),
      message: fill(pick(CAMPAIGN_TEXTS), { name: pick(customers).name.split(" ")[0], salon: spec.name, city: spec.city }),
      status: pick(["SENT", "SENT", "SCHEDULED", "DRAFT"]),
      scheduledAt: null, sentAt: null, sentCount: 0,
    });
    const camp = R.campaigns[R.campaigns.length - 1];
    if (camp.status === "SENT") {
      camp.sentAt = dayShift(-rand(1, 60));
      camp.sentCount = rand(20, 400);
    } else if (camp.status === "SCHEDULED") camp.scheduledAt = dayShift(rand(1, 20));

    // وب‌هوک
    add("hooks", {
      id: nid("e"), salonId: spec.id, url: `https://${spec.slug}.ir/webhooks/nobino`, secret: `whsec_${hex(8)}`,
      events: WEBHOOK_EVENTS.slice(0, rand(2, WEBHOOK_EVENTS.length)), isActive: Math.random() < 0.85,
    });
    const hook = R.hooks[R.hooks.length - 1];
    for (let i = 0; i < rand(1, 4); i++) {
      const ok = Math.random() < 0.8;
      add("hookDeliveries", {
        id: nid("y"), configId: hook.id, event: pick(hook.events),
        payload: { event: pick(hook.events), salon: spec.slug, at: new Date().toISOString() },
        status: ok ? "SUCCESS" : "FAILED", responseStatus: ok ? 200 : pick([500, 502, 503]),
        attempts: ok ? 1 : rand(1, 3), lastError: ok ? null : "timeout after 5000ms", createdAt: dayShift(-rand(0, 30)),
      });
    }

    // صندوق روزانه
    for (let i = 0; i < 2; i++) {
      const day = dayShift(-rand(0, 25));
      const base = rand(6, 30) * 100000;
      add("cash", {
        id: nid("z"), salonId: spec.id, branchId: pick(spec.branches).id, date: day,
        cashAmount: Math.round(base * 0.35), cardAmount: Math.round(base * 0.45), onlineAmount: Math.round(base * 0.2),
        expenseAmount: rand(0, 6) * 100000, note: pick(REGISTER_NOTES), createdById: spec.ownerId,
      });
    }

    // کارمزد نماینده
    if (agents.length) {
      const agent = agents[rand(0, agents.length - 1)];
      const key = agent.id + spec.id;
      if (!taken.pair.has(key)) {
        taken.pair.add(key);
        add("comms", { id: nid("q"), agentId: agent.id, salonId: spec.id, percent: pick([5, 8, 10, 12, 15, 18, 20]), isActive: true });
      }
    }

    // فاکتور خدمات (بیعانهٔ مشتری)
    for (const a of appts) {
      if (!a.depositAmount) continue;
      const paid = a.depositPaid;
      add("invoices", {
        id: nid("i"), number: invoiceNumber(), salonId: spec.id, subscriptionId: null, orderId: null, kind: "SERVICE",
        customerName: a.customerName, customerPhone: a.customerPhone, description: `بیعانهٔ نوبت — ${a._svc.name}`,
        payToken: hex(9), amount: a.depositAmount, originalAmount: a.depositAmount, period: "MONTHLY",
        status: paid ? "PAID" : "PENDING", issuedAt: a.createdAt, dueAt: new Date(a.startAt.getTime() - 3600000),
        paidAt: paid ? a.createdAt : null,
      });
      add("payments", paymentRow({ invoiceId: R.invoices[R.invoices.length - 1].id, appointmentId: a.id, amount: a.depositAmount, status: paid ? "PAID" : "PENDING", createdAt: a.createdAt }));
    }

    // رزرو صوتی — یک نوبتِ گذشتهٔ هر سالن، تا ۱۰۰ تماس
    for (const a of appts) {
      if ((R.calls || []).length >= 100 || a.status === "CANCELLED" || a.startAt > new Date()) continue;
      const when = `${pad2(a.startAt.getHours())}:${pad2(a.startAt.getMinutes())}`;
      const said = fill(pick(VOICE_LINES), {
        salon: spec.name,
        name: a.customerName,
        day: DAYS_FA[pday(a.startAt)],
        time: faDigits(when),
        service: a._svc.name,
        staff: a._staff ? a._staff.name : "",
      });
      a.channel = "VOICE";
      a.voiceCallId = add("calls", {
        id: nid("c"), salonId: spec.id, audioUrl: `/voice/${hex(6)}.webm`, durationSec: rand(18, 95),
        transcript: said, rawText: said,
        extracted: {
          service: a._svc.name, staff: a._staff ? a._staff.name : null,
          date: `${a.startAt.getFullYear()}-${pad2(a.startAt.getMonth() + 1)}-${pad2(a.startAt.getDate())}`,
          time: when, name: a.customerName, phone: a.customerPhone,
        },
        status: a.status === "COMPLETED" ? "DONE" : "CONFIRMED", error: null,
        createdAt: a.createdAt,
      }).id;
      break;
    }

    // نظر مشتری
    const done = appts.filter((a) => a.status === "COMPLETED" && a._cust).slice(0, 3);
    for (const a of done) {
      const rating = pick([5, 5, 5, 5, 4, 4, 4, 3, 3, 2, 1]);
      const replied = Math.random() < 0.45;
      add("reviews", {
        id: nid("v"), salonId: spec.id, staffId: a.employeeId, customerId: a.customerId, appointmentId: a.id, rating,
        comment: pick(REVIEW_TEXTS), reply: replied ? pick(REVIEW_REPLIES) : null, repliedAt: replied ? dayShift(-rand(0, 20)) : null,
        createdAt: new Date(a.startAt.getTime() + rand(1, 48) * 3600000),
      });
    }

    // پیامک‌ها
    for (const a of appts) {
      const type = a.status === "CANCELLED" ? "CANCEL" : a.status === "REQUESTED" ? "APPOINTMENT_CONFIRM" : "REMINDER";
      const roll = Math.random();
      const status = roll < 0.1 ? "PENDING" : roll < 0.95 ? "SENT" : "FAILED";
      const uniqueKey = `nr:${a.id}:${type}`;
      if (taken.pair.has(uniqueKey)) continue;
      taken.pair.add(uniqueKey);
      add("notifications", {
        id: nid("n"), type, channel: "SMS", recipient: a.customerPhone, userId: a.customerId, salonId: spec.id,
        readAt: null, payload: { appointmentId: a.id, salon: spec.name, when: a.startAt.toISOString() },
        uniqueKey, status, attempts: status === "PENDING" ? 0 : 1,
        lastError: status === "FAILED" ? "ارسال از سمت اپراتور رد شد (INVALID_DESTINATION)" : null,
        nextAttemptAt: status === "PENDING" ? dayShift(1) : a.startAt,
        sentAt: status === "SENT" ? a.startAt : null,
        createdAt: a.createdAt,
      });
    }
  }

  /* ث) جدول‌های سراسری */
  const ownerIds = specs.map((s) => s.ownerId);
  for (let i = 0; i < 100; i++) {
    const c = pick(customers);
    const spec = pick(specs);
    add("gifts", {
      id: nid("gc"), code: codeOf("NB-"), balance: pick([200000, 350000, 500000, 750000, 1000000, 1500000, 2000000]),
      currency: "IRR", ownerId: c.id, salonId: spec.id, expiresAt: dayShift(rand(20, 400)), isActive: Math.random() < 0.9,
    });
  }
  const DISCOUNT_WORDS = ["BAHAR", "EZDIMAR", "NOWRUZ", "MO", "NAB", "VIS", "SARA", " GOL", "TEK", "VIP", "ARUS", "MORVARID"];
  for (let i = 0; i < 100; i++) {
    const percent = pick([5, 10, 12, 15, 20, 25, 30]);
    const word = pick(DISCOUNT_WORDS).trim().replace(/[^A-Z]/g, "") || "NOBINO";
    const maxUses = pick([0, 20, 50, 100, 200]);
    add("discounts", {
      id: nid("dc"), code: codeOf(`${word}${percent}`), percent, maxUses, usedCount: maxUses ? rand(0, maxUses) : rand(0, 40),
      expiresAt: dayShift(rand(-30, 240)), isActive: Math.random() < 0.8,
    });
  }
  for (let i = 0; i < 100; i++) {
    const [category, subject, message] = pick(TICKETS);
    const c = pick(customers);
    const spec = pick(specs);
    const status = pick(["OPEN", "OPEN", "IN_PROGRESS", "CLOSED", "CLOSED"]);
    add("tickets", {
      id: nid("st"), userId: c.id, name: c.name, phone: c.phone, email: null, category, subject: `${subject} (${spec.name})`,
      message: fill(message, { salon: spec.name }), status, priority: pick(["LOW", "NORMAL", "NORMAL", "HIGH"]),
      adminReply: status === "CLOSED" || status === "IN_PROGRESS" ? pick(["همکاران در حال بررسی‌اند؛ نتیجه امشب اعلام می‌شود.", "مشکل از تنظیمات درگاه بود و برطرف شد.", "راهنمای افزودن شعبه در مستندات پنل گذاشته شده است."]) : null,
      repliedAt: status === "CLOSED" ? dayShift(-rand(0, 10)) : null, repliedById: status === "CLOSED" ? admin?.id ?? null : null,
      createdAt: dayShift(-rand(0, 90)),
    });
  }
  // کیف‌پول و تراکنش و برداشت
  const walletOwners = [
    ...agents.map((a) => ({ id: a.id, kind: "agent" })),
    ...[...new Set(ownerIds)].slice(0, 60).map((id) => ({ id, kind: "owner" })),
    ...customers.slice(0, 40).map((c) => ({ id: c.id, kind: "customer" })),
  ];
  for (const w of walletOwners) {
    const wid = nid("wl");
    let bal = 0;
    add("wallets", { id: wid, ownerId: w.id, balance: 0, currency: "IRR" });
    for (let i = 0; i < rand(2, 4); i++) {
      const credit = w.kind === "agent" || Math.random() < 0.55;
      const amount = rand(1, 40) * 100000;
      bal = Math.max(0, bal + (credit ? amount : -amount));
      add("txs", {
        id: nid("tx"), walletId: wid, kind: credit ? "CREDIT" : "DEBIT",
        reason: credit ? (w.kind === "agent" ? "COMMISSION_EARNING" : pick(["REFUND", "ADMIN_ADJUSTMENT"])) : pick(["PACKAGE_PURCHASE", "COMMISSION_PAYOUT"]),
        amount, balanceAfter: bal, refType: credit ? "Commission" : "Order", refId: nid("ref"),
        description: credit ? "واریز کارمزد فروش پلن" : "پرداخت اشتراک سالن", createdAt: dayShift(-rand(1, 200)),
      });
    }
    R.wallets[R.wallets.length - 1].balance = bal;
  }
  // برداشت‌ها — هر کیف‌پول پرجمعیت نهایتاً یک درخواست دارد تا موجودی معتبر بماند
  let payouts = 0;
  for (let round = 0; round < 2 && payouts < 100; round++) {
    for (const wl of R.wallets) {
      if (payouts >= 100 || wl.balance < 100000) continue;
      const amount = Math.min(wl.balance, rand(1, Math.max(1, Math.floor(wl.balance / 100000))) * 100000);
      const status = pick(["REQUESTED", "PROCESSING", "PAID", "PAID", "PAID", "REJECTED"]);
      add("payouts", {
        id: nid("po"), walletId: wl.id, amount, method: pick(["BANK", "BANK", "CARD"]),
        bankInfo: `${pick(BANKS)} — IR${hashDigits(wl.id + round, 20)}`, status, requestedAt: dayShift(-rand(1, 120)),
        processedAt: status === "PAID" || status === "REJECTED" ? dayShift(-rand(0, 30)) : null,
      });
      if (status === "PAID") wl.balance -= amount;
      payouts++;
    }
  }
  // OTP / نشست / گزارش رسیدگی
  for (let i = 0; i < 100; i++) {
    const phone = Math.random() < 0.5 ? pick(customers).phone : pick(specs).mobile;
    const used = Math.random() < 0.6;
    add("otps", {
      id: nid("ot"), phone, code: String(rand(1000, 9999)), purpose: pick(["LOGIN", "LOGIN", "VERIFY", "EMAIL_LOGIN"]),
      attempts: used ? 1 : rand(0, 3), expiresAt: dayShift(used ? -rand(1, 20) : rand(0, 3)), usedAt: used ? dayShift(-rand(1, 20)) : null,
      verified: used, createdAt: dayShift(-rand(1, 30)),
    });
  }
  const allUsers = [...ownerIds, ...customers.map((c) => c.id), ...(admin ? [admin.id] : [])];
  for (let i = 0; i < 100; i++) {
    add("sessions", {
      id: nid("ss"), userId: pick(allUsers), tokenHash: createHash("sha256").update(hex(16)).digest("hex"),
      expiresAt: dayShift(rand(1, 60)), device: pick(DEVICES), ip: `5.${rand(200, 250)}.${rand(1, 250)}.${rand(1, 250)}`,
    });
  }
  const ACTIONS = ["approve_salon", "suspend_salon", "settings_update", "support_login", "plan_change", "payout_approve", "ticket_reply"];
  for (let i = 0; i < 120; i++) {
    const spec = pick(specs);
    const action = pick(ACTIONS);
    add("audits", {
      id: nid("al"), actorId: admin?.id ?? null, actorPhone: admin?.phone ?? null, action,
      entityType: action === "settings_update" ? "Setting" : action === "payout_approve" ? "Payout" : action === "ticket_reply" ? "SupportTicket" : "Salon",
      entityId: action === "settings_update" ? nid("ref") : spec.id,
      before: action === "plan_change" ? { plan: "FREE" } : null,
      after: action === "plan_change" ? { plan: spec.plan } : action === "suspend_salon" ? { isActive: false } : null,
      ip: `185.${rand(80, 130)}.${rand(1, 250)}.${rand(1, 250)}`, createdAt: dayShift(-rand(0, 90)),
    });
  }

  if (DRY) {
    console.log("🧪 حالت خشک — چیزی نوشته نشد.");
    for (const [key, rows] of Object.entries(R)) console.log(`   ${key}: ${rows.length}`);
    return;
  }

  /* ج) درج فرزندان به ترتیب وابستگی */
  for (const a of R.appts || []) {
    delete a._cust;
    delete a._svc;
    delete a._staff;
  }
  const INSERT_ORDER = [
    ["branch", "branches"], ["openingHour", "hours"], ["service", "services"], ["staff", "staff"],
    ["galleryItem", "gallery"], ["holiday", "holidays"], ["salonCustomer", "crm"],
    ["salonCustomerNote", "crmNotes"], ["salonCustomerMedia", "crmMedia"],
    ["voiceCall", "calls"], ["appointment", "appts"], ["review", "reviews"],
    ["timeBlock", "blocks"], ["favorite", "favorites"], ["waitlistEntry", "waitlist"],
    ["campaign", "campaigns"], ["commissionPlan", "comms"], ["webhookConfig", "hooks"],
    ["webhookDelivery", "hookDeliveries"], ["cashRegisterEntry", "cash"], ["subscription", "subs"],
    ["order", "orders"], ["invoice", "invoices"], ["giftCard", "gifts"], ["discount", "discounts"],
    ["wallet", "wallets"], ["transaction", "txs"], ["payout", "payouts"],
    ["supportTicket", "tickets"], ["payment", "payments"], ["notification", "notifications"],
    ["otp", "otps"], ["session", "sessions"], ["auditLog", "audits"],
  ];
  for (const [model, key] of INSERT_ORDER) {
    const data = R[key] || [];
    if (!data.length) continue;
    for (let i = 0; i < data.length; i += 400) await prisma[model].createMany({ data: data.slice(i, i + 400) });
    console.log(`   ✓ ${model}: ${data.length}`);
  }

  /* چ) پایان اشتراک روی خود سالن + تنظیماتی که به سالن تستی اشاره داشتند */
  for (const spec of specs) {
    if (!spec.subEndsAt) continue;
    await prisma.salon.update({ where: { id: spec.id }, data: { subscriptionEndsAt: spec.subEndsAt } });
  }
  const def = await prisma.setting.findUnique({ where: { key: "miniapps.default_salon" } });
  if (def && !(await prisma.salon.findFirst({ where: { slug: def.value } }))) {
    await prisma.setting.update({ where: { key: "miniapps.default_salon" }, data: { value: "mah" } });
    console.log(`   ⚙ miniapps.default_salon → mah (قبلاً: ${def.value})`);
  }
}

const openHourOf = (spec) => spec.hours.find((h) => !h.isClosed) || { openTime: "10:00", closeTime: "20:00" };

/* ── ۷) گزارش پایانی ─────────────────────────────────────────────── */
const REPORT_MODELS = [
  "user", "salon", "branch", "service", "staff", "openingHour", "galleryItem", "holiday", "timeBlock",
  "appointment", "voiceCall", "review", "favorite", "waitlistEntry", "salonCustomer", "salonCustomerNote",
  "salonCustomerMedia", "campaign", "commissionPlan", "webhookConfig", "webhookDelivery", "cashRegisterEntry",
  "subscription", "order", "invoice", "payment", "giftCard", "discount", "wallet", "transaction", "payout",
  "supportTicket", "notification", "otp", "session", "auditLog", "package", "setting",
];
async function report() {
  console.log("\n📊 وضعیت جداول پس از سید:");
  const bad = [];
  for (const model of REPORT_MODELS) {
    const n = await prisma[model].count();
    const flag = model === "package" || model === "setting" ? "•" : n >= 100 ? "✓" : "!";
    if (flag === "!") bad.push(`${model}: ${n}`);
    console.log(`   ${flag} ${model.padEnd(20)} ${n}`);
  }
  if (bad.length) console.log("   ⚠ کمتر از ۱۰۰: " + bad.join("، "));
}

/* ── ۸) اجرا ─────────────────────────────────────────────────────── */
async function main() {
  const t0 = Date.now();
  if (!ONLY_SEED) await clean();
  if (!ONLY_CLEAN) await seed();
  if (!DRY) await report();
  console.log(`⏱ پایان در ${((Date.now() - t0) / 1000).toFixed(1)} ثانیه`);
}

main()
  .catch((e) => {
    console.error("🛑 خطا:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
