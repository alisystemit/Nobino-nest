import { smsProviderMeta } from "@/lib/sms/providers";
import { sttProviderMeta } from "@/lib/ai/stt";
import { gatewayCredentialMeta } from "@/lib/payments/gateway-config";

/**
 * کاتالوگ تنظیمات — منبع واحد حقیقت برای «چه چیزی در پنل سوپرادمین قابل تنظیم است».
 *
 * چرا لازم بود؟ پنل پیشین فقط ردیف‌های موجود در جدول `Setting` را نمایش می‌داد؛
 * یعنی کلیدی که هنوز ساخته نشده بود (مثلاً کلید Groq یا مرچنت‌کد زرین‌پال) هیچ‌جا
 * برای وارد کردن وجود نداشت و درگاه‌ها هم اصلاً از `Setting` نمی‌خواندند.
 * حالا هر کلیدی که کد یا اسکریپت‌ها مصرف می‌کنند اینجا اعلام می‌شود و پنل از همین
 * فهرست کارت می‌سازد. ترتیب اولویت در همه‌جا یکی است:
 *
 *   تنظیم پویا (جدول Setting) ← متغیر محیطی معادل (فقط برای سازگاری با kیت استقرار)
 *
 * `readOnly: true` یعنی آن مقدار فقط از متغیر محیطی خوانده می‌شد و در پنل
 * صرفاً نمایش داده می‌شود (بالا/پایین بودنش)؛ تلاش برای ذخیره‌اش رد می‌شود.
 */

export type CatalogFieldType = "secret" | "string" | "number" | "boolean" | "select";

export interface CatalogField {
  /** کلید کامل در جدول Setting، مثل `payments.zarinpal.merchant_id` */
  key: string;
  label: string;
  type: CatalogFieldType;
  /** نام متغیر محیطی جایگزین */
  env?: string;
  /** برای type=select */
  options?: string[];
  placeholder?: string;
  hint?: string;
  /** فقط‌خواندنی (مصرف‌شونده از env در بوت‌استرپ؛ در پنل نمایش وضعیت) */
  readOnly?: boolean;
}

export interface CatalogCard {
  id: string;
  title: string;
  description?: string;
  fields: CatalogField[];
}

export interface CatalogSection {
  id: string;
  title: string;
  emoji: string;
  description?: string;
  /** اگر این بخش یک «فعال» سراسری دارد، کلیدش (برای رادیو/سلکت در پنل) */
  activeKey?: string;
  /** برچسب گزینه‌های activeKey */
  activeLabels?: { value: string; label: string }[];
  /** فیلد select مربوط به activeKey؛ پنل آن را بالای کارت‌ها نمایش می‌دهد */
  activeField?: CatalogField;
  cards: CatalogCard[];
}

const boolField = (key: string, label: string, opts: Partial<CatalogField> = {}): CatalogField => ({
  key,
  label,
  type: "select",
  options: ["true", "false"],
  ...opts,
});

/* ─── ۱) پیامک ─────────────────────────────────────────────────────── */

const smsSection = (): CatalogSection => ({
  id: "sms",
  title: "سرویس‌های پیامک",
  emoji: "📲",
  description: "سرویس فعال را انتخاب و کلیدهای همان سرویس را وارد کنید؛ مقدار پویا بر env اولویت دارد.",
  activeKey: "sms.active_provider",
  activeLabels: smsProviderMeta.map((p) => ({ value: p.id, label: p.name })),
  cards: [
    ...smsProviderMeta.map((p) => ({
      id: p.id,
      title: p.name,
      description: p.description,
      fields: p.fields.map((f) => ({
        key: `${p.settingsPrefix}${f.key}`,
        label: f.label,
        type: f.type as CatalogFieldType,
        placeholder: f.placeholder,
      })),
    })),
    {
      id: "templates",
      title: "متن‌های پیامک",
      description: "قالب‌های ارسالی؛ {salon}، {time}، {code}، {customer} و {plan} جایگزین می‌شوند.",
      fields: [
        { key: "sms.template.confirm", label: "تأیید نوبت", type: "string" },
        { key: "sms.template.reminder", label: "یادآوری نوبت", type: "string" },
        { key: "sms.template.cancel", label: "لغو نوبت", type: "string" },
        { key: "sms.template.waitlist", label: "ازاد شدن ظرفیت (waitlist)", type: "string" },
        { key: "sms.template.sub_active", label: "فعال‌سازی اشتراک", type: "string" },
        { key: "sms.template.sub_expired", label: "انقضای اشتراک", type: "string" },
      ],
    },
    {
      id: "extras",
      title: "گزینه‌های پیامک",
      fields: [
        { key: "sms.cost_per_message", label: "هزینهٔ هر پیامک (تومان)", type: "number", hint: "برای برآورد هزینه در گزارش پیامک پنل." },
        boolField("sms.show_sent_codes", "نمایش کد OTP ارسال‌شده در محیط توسعه", {
          hint: "فقط برای تست؛ در پروداکش خاموش بماند.",
        }),
      ],
    },
  ],
});

/* ─── ۲) هوش مصنوعی و صدا ─────────────────────────────────────────── */

const aiSection = (): CatalogSection => ({
  id: "ai",
  title: "هوش مصنوعی و گفتار",
  emoji: "🎙️",
  description:
    "کلیدهای AI و زنجیرهٔ تبدیل گفتار به متن. ربات‌ها به ترتیب `stt.order` امتحان می‌شوند و در نهایت به Mock محلی می‌رسند، پس ثبت نوبت با قطعی سرویس نمی‌شکند.",
  activeKey: "voice.provider",
  activeLabels: [
    { value: "mock", label: "Mock (بدون سرویس خارجی)" },
    { value: "openai", label: "OpenAI Whisper" },
  ],
  cards: [
    {
      id: "core",
      title: "تنظیمات پایهٔ AI",
      fields: [
        boolField("ai.enabled", "هوش مصنوعی فعال باشد", {
          hint: "خاموش = بدون فراخوانی LLM؛ متن‌ها از قواعد محلی ساخته می‌شوند.",
        }),
        {
          key: "openai.api_key",
          label: "کلید OpenAI (مشترک LLM و Whisper)",
          type: "secret",
          env: "OPENAI_API_KEY",
          hint: "یک کلید برای هر دو مسیر گفتار→متن و تولید متن کافی است.",
        },
        { key: "llm.model", label: "مدل متنی (chat)", type: "string", placeholder: "gpt-4o-mini" },
        { key: "stt.order", label: "ترتیب ربات‌های تبدیل گفتار", type: "string", placeholder: "groq,huggingface,cloudflare,deepgram,openai", hint: "با کاما جدا کنید؛ نام‌های ناشناخته نادیده گرفته می‌شوند." },
      ],
    },
    {
      id: "llm",
      title: "سرویس تولید متن (LLM)",
      description: "سرویسی که جملات هوشمند را می‌سازد (دستیار سایت، تحلیل کسب‌وکار، تولید محتوا). خالی = خودکار (اولین سرویسی که کلیدش پر باشد).",
      fields: [
        {
          key: "ai.provider",
          label: "سرویس متن",
          type: "select",
          options: ["", "openai", "groq", "deepseek", "custom"],
          hint: "openai | groq | deepseek | custom — خالی یعنی انتخاب خودکار.",
        },
        { key: "ai.model", label: "مدل سراسری (اختیاری)", type: "string", placeholder: "خالی = پیش‌فرض هر سرویس", hint: "اگر مدل مخصوص یک سرویس خالی باشد، این مقدار جایگزین می‌شود." },
        { key: "ai.openai.model", label: "مدل OpenAI", type: "string", placeholder: "gpt-4o-mini" },
        { key: "ai.deepseek.key", label: "کلید DeepSeek", type: "secret", env: "DEEPSEEK_API_KEY", hint: "از platform.deepseek.com بگیرید؛ قیمت پایین و کیفیت فارسی خوب." },
        { key: "ai.deepseek.model", label: "مدل DeepSeek", type: "string", placeholder: "deepseek-chat" },
        { key: "ai.custom.key", label: "کلید سرویس سفارشی", type: "secret", env: "AI_CUSTOM_API_KEY", hint: "هر سرویس سازگار با OpenAI: OpenRouter، آوال‌ای، پروکسی داخلی…" },
        { key: "ai.custom.base_url", label: "آدرس سرویس سفارشی", type: "string", env: "AI_CUSTOM_BASE_URL", placeholder: "http://localhost:11434/v1", hint: "بدون /chat/completions در انتها؛ مثلاً پایانهٔ Ollama یا OpenRouter." },
        { key: "ai.custom.model", label: "مدل سرویس سفارشی", type: "string", placeholder: "مثلاً llama3 یا gpt-4o-mini" },
      ],
    },
    ...sttProviderMeta.map((p) => ({
      id: `stt-${p.id}`,
      title: p.label,
      description: p.free ? "ربات رایگان — برای حجم پایین مناسب است." : "سرویس پولی.",
      fields: [
        ...p.fields.map((f) => ({ key: f.key, label: f.label, type: f.type as CatalogFieldType, env: f.env, placeholder: f.placeholder })),
        { key: `stt.${p.id}.model`, label: "مدل", type: "string" as CatalogFieldType, placeholder: p.modelDefault },
        boolField(`stt.${p.id}.enabled`, "این ربات فعال باشد"),
      ].filter((f, i, arr) => arr.findIndex((x) => x.key === f.key) === i),
    })),
  ],
});

/* ─── ۳) درگاه‌های پرداخت ─────────────────────────────────────────── */

const paymentsSection = (): CatalogSection => ({
  id: "payments",
  title: "درگاه‌های پرداخت",
  emoji: "🏦",
  description:
    "اعتبارنامهٔ هر درگاه از همین‌جا قابل تنظیم است. تا وقتی `حالت شبیه‌سازی` روشن است تراکنش شبیه‌سازی می‌شود؛ برای پرداخت واقعی آن را روی false بگذارید.",
  activeKey: "payments.default_gateway",
  activeLabels: [{ value: "sandbox", label: "شبیه‌سازی (تست)" }, ...gatewayCredentialMeta.map((g) => ({ value: g.id, label: g.name }))],
  cards: gatewayCredentialMeta.map((g) => ({
    id: g.id,
    title: g.name,
    fields: g.fields.map((f) => ({
      key: `payments.${g.id}.${f.key}`,
      label: f.label,
      type: f.type as CatalogFieldType,
      env: f.env,
      hint: f.hint,
      ...(f.type === "boolean" ? { options: ["true", "false"] } : {}),
    })),
  })),
});

/* ─── ۴) ایمیل ────────────────────────────────────────────────────── */

const emailSection = (): CatalogSection => ({
  id: "email",
  title: "ایمیل (SMTP)",
  emoji: "✉️",
  description: "با nodemailer ارسال می‌شود؛ اگر host خالی باشد به فرستندهٔ Mock (لاگ) برمی‌گردد.",
  cards: [
    {
      id: "smtp",
      title: "سرور SMTP",
      fields: [
        { key: "email.smtp_host", label: "سرور (host)", type: "string", placeholder: "smtp.example.com" },
        { key: "email.smtp_port", label: "پورت", type: "number", placeholder: "587" },
        { key: "email.smtp_user", label: "نام کاربری", type: "string" },
        { key: "email.smtp_pass", label: "رمز عبور", type: "secret" },
        { key: "email.from", label: "فرستنده (From)", type: "string", placeholder: "noreply@nobino.ir" },
      ],
    },
  ],
});

/* ─── ۵) اسکریپت‌ها، کران و سرور ───────────────────────────────────── */

const automationSection = (): CatalogSection => ({
  id: "automation",
  title: "اسکریپت‌ها و کران",
  emoji: "⏰",
  description:
    "کران‌های داخلی (`cron-jobs.service`) و مسیرهای `/api/cron/*` با هدر `Authorization: Bearer <cron.secret>` محافظت می‌شوند؛ اسکریپت بیرونی (جانشین Vercel Cron) هم همان مقدار را باید بفرستد.",
  cards: [
    {
      id: "cron",
      title: "کلید محافظت کران",
      fields: [
        {
          key: "cron.secret",
          label: "CRON_SECRET",
          type: "secret",
          env: "CRON_SECRET",
          hint: "خالی = کران اجرا نمی‌شود. اگر از پنل مقدار تازه‌ای بگذارید، همان را در هدر اسکریپت کران هم به‌کار ببرید.",
        },
      ],
    },
    {
      id: "runtime",
      title: "متغیرهای محیطی سرور (فقط‌خواندنی)",
      description: "این‌ها در زمان بوت خوانده می‌شوند و فقط از .env/محیط قابل تغییرند؛ پنل فقط پر/خالی بودنشان را نشان می‌دهد.",
      fields: [
        { key: "env:DATABASE_URL", label: "DATABASE_URL", type: "string", env: "DATABASE_URL", readOnly: true },
        { key: "env:JWT_SECRET", label: "JWT_SECRET", type: "string", env: "JWT_SECRET", readOnly: true },
        { key: "env:PORT", label: "PORT (پورت API)", type: "string", env: "PORT", readOnly: true, hint: "پیش‌فرض 3100" },
        { key: "env:CORS_ORIGIN", label: "CORS_ORIGIN", type: "string", env: "CORS_ORIGIN", readOnly: true },
        { key: "env:NEXT_PUBLIC_SITE_URL", label: "SITE_URL (دامنهٔ عمومی)", type: "string", env: "NEXT_PUBLIC_SITE_URL", readOnly: true },
        { key: "env:NEXT_PUBLIC_ROOT_DOMAIN", label: "ROOT_DOMAIN (ساب‌دامین سالن‌ها)", type: "string", env: "NEXT_PUBLIC_ROOT_DOMAIN", readOnly: true },
        { key: "env:AUTOMATION_BASE_URL", label: "AUTOMATION_BASE_URL (برای اسکریپت کران)", type: "string", env: "AUTOMATION_BASE_URL", readOnly: true },
        { key: "env:PAYMENT_SANDBOX", label: "PAYMENT_SANDBOX (پیش‌فرض همه درگاه‌ها)", type: "string", env: "PAYMENT_SANDBOX", readOnly: true },
      ],
    },
  ],
});

/* ─── ۶) ذخیره‌سازی فایل ──────────────────────────────────────────── */

const storageSection = (): CatalogSection => ({
  id: "storage",
  title: "ذخیره‌سازی فایل",
  emoji: "🗄️",
  description: "صوت و تصویر گالری؛ با توکن Vercel Blob روی ابر، و در غیر این صورت در `backend/public/uploads` ذخیره می‌شود.",
  cards: [
    {
      id: "blob",
      title: "Vercel Blob",
      fields: [
        { key: "storage.blob_token", label: "BLOB_READ_WRITE_TOKEN", type: "secret", env: "BLOB_READ_WRITE_TOKEN" },
        { key: "storage.blob_store", label: "BLOB_STORE_ID", type: "string", env: "BLOB_STORE_ID" },
      ],
    },
  ],
});

/* ─── ۷) عمومی و تماس با ما ───────────────────────────────────────── */

const generalSection = (): CatalogSection => ({
  id: "general",
  title: "عمومی",
  emoji: "⚙️",
  cards: [
    {
      id: "site",
      title: "پیام و اطلاعات تماس",
      description: "بنر اطلاعیه و فوتر/راهنمای سایت از همین مقادیر خوانده می‌شوند.",
      fields: [
        { key: "general.announcement", label: "متن اطلاعیه (بنر سایت)", type: "string", hint: "خالی = بنر نمایش داده نمی‌شود." },
        { key: "home.sample_salons", label: "اسلاگ سالن‌های نمونه", type: "string", placeholder: "mah,bahar", hint: "با کاما جدا کنید؛ همین‌ها در بخش «سالن نمونه» صفحهٔ اصلی نمایش داده می‌شوند. خالی = mah." },
        { key: "contact.email", label: "ایمیل پشتیبانی", type: "string", placeholder: "support@nobino.ir" },
        { key: "contact.phone", label: "شماره تلفن", type: "string", placeholder: "021-12000000" },
        { key: "contact.address", label: "آدرس", type: "string", placeholder: "تهران، ایران" },
      ],
    },
  ],
});

/* ─── ۸) مینی‌اپ پیام‌رسان‌ها ───────────────────────────────────────── */

const miniappsSection = (): CatalogSection => ({
  id: "miniapps",
  title: "مینی‌اپ پیام‌رسان‌ها",
  emoji: "🧩",
  description:
    "نسخهٔ مینی‌اپِ «صفحهٔ سالن» و «مدیریت سالن» برای داخل بله، تلگرام، ایتا و وایتا. آدرس /mini روی سایت همیشه ساخته می‌شود؛ اینجا مشخص می‌کنید کدام پیام‌رسان فعال باشد و لینک رسمی نصبش از پنل پیام‌رسان چه باشد. مینی‌اپ سالن‌محور است: فهرست یا جست‌وجوی سالن‌ها وجود ندارد و هر کاربر فقط سالن خودش را می‌بیند (سالن‌دار → سالن خودش، مشتری → آخرین سالنی که از آن نوبت گرفته، مهمان → سالن پیش‌فرض پایین این بخش). تنظیمات هر سالن (مثل صفحهٔ عمومی) در همان سالن می‌ماند و این‌جا فقط سطح پلتفرم است.",
  cards: [
    {
      id: "miniapps-base",
      title: "تنظیمات پایه",
      fields: [
        {
          key: "miniapps.base_url",
          label: "دامنهٔ عمومی مینی‌اپ",
          type: "string",
          placeholder: "خالی = آدرس اصلی سایت",
          hint: "اگر مینی‌اپ را روی دامنه/ساب‌دامین دیگری بالا می‌آورید اینجا بنویسید (با https). خالی = SITE_URL.",
        },
        {
          key: "miniapps.default_salon",
          label: "اسلاگ سالن پیش‌فرض صفحهٔ خانه",
          type: "string",
          placeholder: "mah",
          hint: "همان بخش آخر آدرس عمومی سالن (نوبینو/…/s/mah). وقتی کاربر وارد نشده باشد یا سالنی به حسابش وصل نباشد، خانهٔ مینی‌اپ همین سالن را نشان می‌دهد. خالی = صفحهٔ خانه پیام «سالنی برای نمایش نیست» و دکمهٔ ورود را نشان می‌دهد.",
        },
        boolField("miniapps.manage_tab", "تب «مدیریت سالن» برای آرایشگران فعال باشد", {
          hint: "با خاموش کردن، کاربرها فقط سالن خودشان و نوبت‌های خودشان را می‌بینند.",
        }),
        {
          key: "miniapps.featured",
          label: "اسلاگ‌های ویژه (فقط برای endpoint /api/mini/featured)",
          type: "string",
          placeholder: "mah,bahar",
          hint: "در صفحهٔ خانهٔ مینی‌اپ نمایش داده نمی‌شوند؛ این فهرست فقط برای لینک‌های کمپین و ربات‌هایی است که خودشان اسلاگ را از /api/mini/featured می‌خوانند.",
        },
      ],
    },
    {
      id: "miniapps-brand",
      title: "ظاهر و برندینگ مینی‌اپ",
      description: "این مقادیر فقط صفحهٔ /mini را می‌سازند؛ سایت اصلی و پنل سالن دست‌نخورده می‌مانند.",
      fields: [
        { key: "miniapps.title", label: "نام نمایشی مینی‌اپ", type: "string", placeholder: "نوبینو", hint: "خالی = «نوبینو»." },
        { key: "miniapps.subtitle", label: "زیرعنوان (شعار کوتاه)", type: "string", placeholder: "نوبتگیری آسان از پیام‌رسان" },
        { key: "miniapps.accent", label: "رنگ اصلی", type: "string", placeholder: "#e11d63", hint: "کد hex سه یا شش رقمی. رنگ دکمه‌ها، هایلایت‌ها و نوار پایین." },
        { key: "miniapps.hero_text", label: "متن خوش‌آمد (اختیاری)", type: "string", placeholder: "سلام! سالن موردنظرت رو انتخاب کن 👈", hint: "خالی = پیام پیش‌فرض نمایش داده می‌شود." },
        { key: "miniapps.support_phone", label: "شماره پشتیبانی (نمایش در تب «من»)", type: "string", placeholder: "021-12000000" },
        boolField("miniapps.show_prices", "قیمت خدمات نمایش داده شود", {
          hint: "خاموش = مینی‌اپ قیمت‌ها را نشان نمی‌دهد (مناسب سالن‌هایی که نرخ روز اعلام می‌کنند).",
        }),
      ],
    },
    {
      id: "miniapps-features",
      title: "ویژگی‌ها و امنیت ورود",
      fields: [
        boolField("miniapps.allow_booking", "امکان رزرو نوبت از مینی‌اپ"),
        boolField("miniapps.allow_reviews", "نمایش نظر مشتریان در صفحهٔ سالن"),
        boolField("miniapps.require_login", "رزرو نوبت فقط با ورود (OTP) انجام شود", {
          hint: "خاموش = مهمان هم می‌تواند نوبت بگیرد (نام و شماره تلفن کافی است).",
        }),
        boolField("miniapps.silent_login", "ورود بی‌حس با تأیید امضای پیام‌ران (initData)", {
          hint: "روشن = اگر توکن ربات تنظیم شده باشد، کاربر پیام‌رسان بدون وارد کردن شماره وارد می‌شود. برای تلگرام و بله.",
        }),
      ],
    },
    {
      id: "miniapps-telegram",
      title: "تلگرام (Telegram Mini App)",
      description: "از @BotFather با دستور /newapp ساخته می‌شود؛ آدرس رسمی به شکل t.me/<ربات>/<نام‌اپ> است.",
      fields: [
        boolField("miniapps.telegram.enabled", "مینی‌اپ تلگرام فعال باشد"),
        { key: "miniapps.telegram.bot", label: "نام کاربری ربات (بدون @)", type: "string", placeholder: "nobinobot" },
        { key: "miniapps.telegram.app", label: "نام اپلیکیشن (app shortname)", type: "string", placeholder: "nobino", hint: "همان نامی که BotFather در /newapp می‌سازد." },
        { key: "miniapps.telegram.link", label: "لینک نهایی (اختیاری)", type: "string", placeholder: "https://t.me/nobinobot/nobino", hint: "اگر پر شود، همین لینک نمایش داده می‌شود؛ وگرنه از الگوی t.me/<ربات>/<نام‌اپ> ساخته می‌شود." },
        { key: "miniapps.telegram.token", label: "توکن ربات (راستی‌آزمایی initData)", type: "secret", hint: "اختیاری؛ فقط برای اعتبارسنجی امضای داده‌های ورودی تلگرام." },
      ],
    },
    {
      id: "miniapps-bale",
      title: "بله (Bale Mini App)",
      description: "از @BotFather بله ثبت می‌شود؛ آدرس رسمی به شکل ble.ir/<ربات>?startapp=<پارامتر> است (docs.bale.ai/miniapp).",
      fields: [
        boolField("miniapps.bale.enabled", "مینی‌اپ بله فعال باشد"),
        { key: "miniapps.bale.bot", label: "نام کاربری ربات (بدون @)", type: "string", placeholder: "nobino_bot" },
        { key: "miniapps.bale.app", label: "پارامتر startapp", type: "string", placeholder: "nobino", hint: "مقداری که هنگام ثبت مینی‌اپ در بله تعیین کرده‌اید." },
        { key: "miniapps.bale.link", label: "لینک نهایی (اختیاری)", type: "string", placeholder: "https://ble.ir/nobino_bot?startapp=nobino", hint: "اگر پر شود، همین لینک نمایش داده می‌شود." },
        { key: "miniapps.bale.token", label: "توکن ربات (اختیاری)", type: "secret", hint: "اختیاری؛ برای راستی‌آزمایی initData بله." },
      ],
    },
    {
      id: "miniapps-eitaa",
      title: "ایتا (Eitaa)",
      description: "ایتا الگوی رسمی «مینی‌اپ» مثل تلگرام ندارد؛ لینک ربات از ایتا کپی و در فیلد پایین وارد شود.",
      fields: [
        boolField("miniapps.eitaa.enabled", "مینی‌اپ ایتا فعال باشد"),
        { key: "miniapps.eitaa.bot", label: "نام کاربری ربات (بدون @)", type: "string", placeholder: "nobino_bot" },
        { key: "miniapps.eitaa.app", label: "نام اپ/مسیر (اختیاری)", type: "string", placeholder: "nobino" },
        { key: "miniapps.eitaa.link", label: "لینک نهایی ایتا", type: "string", placeholder: "https://eitaa.com/nobino_bot", hint: "اگر خالی باشد، از نام کاربری ربات ساخته می‌شود." },
        { key: "miniapps.eitaa.token", label: "توکن (اختیاری)", type: "secret", hint: "در حال حاضر برای راستی‌آزمایی امضا استفاده نمی‌شود." },
      ],
    },
    {
      id: "miniapps-wita",
      title: "وایتا (WITA)",
      description: "اپ وایتا لینک نصب متفاوتی دارد؛ لینک نهایی را از پنل توسعه‌دهندهٔ وایتا کپی کنید.",
      fields: [
        boolField("miniapps.wita.enabled", "مینی‌اپ وایتا فعال باشد"),
        { key: "miniapps.wita.bot", label: "نام کاربری ربات/کانال (بدون @)", type: "string", placeholder: "nobino" },
        { key: "miniapps.wita.app", label: "نام اپ در وایتا", type: "string", placeholder: "nobino" },
        { key: "miniapps.wita.link", label: "لینک نهایی وایتا", type: "string", placeholder: "https://wita.ir/…", hint: "برخلاف تلگرام/بله، لینک وایتا را باید خودتان از پنل وایتا وارد کنید." },
        { key: "miniapps.wita.token", label: "توکن (اختیاری)", type: "secret" },
      ],
    },
  ],
});

export function settingsSections(): CatalogSection[] {
  const sections = [
    smsSection(),
    aiSection(),
    paymentsSection(),
    emailSection(),
    automationSection(),
    storageSection(),
    generalSection(),
    miniappsSection(),
  ];
  // فیلد select «سرویس/درگاه فعال» به‌صورت یکنواخت از activeLabels ساخته می‌شود
  for (const s of sections) {
    if (!s.activeKey) continue;
    s.activeField = {
      key: s.activeKey,
      label: s.id === "payments" ? "درگاه پیش‌فرض" : s.id === "sms" ? "سرویس فعال" : "درایور فعال",
      type: "select",
      options: (s.activeLabels ?? []).map((o) => o.value),
      hint: s.id === "payments" ? "درگاه انتخابی در صفحهٔ پرداخت اگر کاربر چیزی انتخاب نکند." : undefined,
    };
  }
  return sections;
}

/** همهٔ فیلدها به‌صورت تخت (برای اعتبارسنجی و متادیتای PATCH) */
export function catalogFields(): { section: CatalogSection; card: CatalogCard; field: CatalogField }[] {
  const out: { section: CatalogSection; card: CatalogCard; field: CatalogField }[] = [];
  for (const section of settingsSections()) {
    if (section.activeField) {
      const synthetic: CatalogCard = { id: `${section.id}-active`, title: section.activeField.label, fields: [section.activeField] };
      out.push({ section, card: synthetic, field: section.activeField });
    }
    for (const card of section.cards) for (const field of card.fields) out.push({ section, card, field });
  }
  return out;
}

export interface CatalogMeta {
  group: string;
  type: string;
  isSecret: boolean;
  description: string;
  options?: string[];
  readOnly: boolean;
  env?: string;
}

/** متادیتای یک کلید برای ذخیرهٔ صحیح (به‌ویژه رمزنگاری secretها) */
export function catalogMetaFor(key: string): CatalogMeta | undefined {
  const found = catalogFields().find((e) => e.field.key === key);
  if (!found) return undefined;
  const { field, section } = found;
  return {
    group: section.id,
    type: field.type,
    isSecret: field.type === "secret",
    description: field.label,
    options: field.options,
    readOnly: Boolean(field.readOnly),
    env: field.env,
  };
}

/** آیا این کلید اصلاً در کاتالوگ هست؟ (برای رد کردن کلیدهای دلخواه/) */
export function isKnownSettingKey(key: string): boolean {
  return catalogFields().some((e) => e.field.key === key);
}
