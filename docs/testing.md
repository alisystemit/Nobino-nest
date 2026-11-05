# تست‌های خودکار (Nobino-nest)

این کپی (NestJS + Vite) برخلاف کپی Next.js هیچ سطح تستی نداشت؛ اسکریپت‌های
`scripts/*.test.mjs` و `scripts/e2e-*.cjs` نسخهٔ Next در این مخزن وجود ندارند و
بازنویسی‌شان خواسته شده بود. دو فایل زیر جایشان را می‌گیرند و با `node:test`
بدون هیچ وابستگی تست اضافه اجرا می‌شوند:

```
npm test            # هر دو دسته (۲۶ تست)
npm run test:wiring # فقط سازگاری manifest/کنترلر (سریع، بدون بیلد و دیتابیس)
```

`npm run verify` هم به انتهایش `npm test` اضافه شده است، پس بیلد انتشار دیگر
بدون تست نمی‌گذرد.

## ۱) `scripts/wiring.test.mjs` — سازگاری سیم‌کشی بک‌اند

بدون سرور، بدون دیتابیس، بدون بیلد. چیزی که در این پروژه «فرار» است و با دست
آسان بهم می‌ریزد را می‌سنجد:

| تست | چه چیزی را می‌گیرد |
| --- | --- |
| شکل manifest | `url === /api/<path>` با تبدیل `[x] → :x`، یکتا بودن path/url/module، روش‌های معتبر |
| فایل روت | هر مدول `@/routes/api/…` فایلش هست؛ هیچ فایل روت یتیمی بیرون از manifest نمانده |
| exportها | به‌ازای هر `methods` یک `export function GET/POST/…` وجود دارد و متد اضافه export نشده |
| کنترلرها | مجموعهٔ `(متد، url)` هر کنترلر تولیدشده دقیقاً با manifest یکی است (یادت نرود `npm run gen:controllers`) |
| استثناها | فقط `pages.controller.ts` و `admin/ai/{status,test}.controller.ts` دستی‌اند؛ بقیه تولیدی |
| مسیرهای `/api` در کد | هر رشتهٔ `"/api/…"` در `frontend/src`، `backend/src` و `scripts` یا در manifest است یا در یکی از کنترلرهای دستی (یا `/api/health` که `ops-middleware` می‌دهد) |
| کران‌ها | هر `this.fire("…")` در `CronJobsService` مسیرش را در manifest دارد |

## ۲) `scripts/smoke.test.mjs` — منطق خالص + سرور واقعی

بخش اول روی خروجی بیلد بک‌اند (`backend/dist/lib/**`) است و تابع‌های تجاریِ
بدون اثر جانبی را می‌سنجد: هش/راستی‌آزمایی رمز، `PASSWORD_MIN`، نیمه‌شب محلی تهران
و اجزای روز، تعریف سقف پلن‌ها (`plan.limit.<PLAN>.<key>`، قالب «تا ۳ کارمند»،
ارقام فارسی)، سقف آپلود/CRM (نگاشت بایت↔مگابایت)، نامک سالن، نشانی سالن
(ساب‌دامین محلی، `/s/<slug>`، میزبان خودِ سالن و دامنهٔ VERIFIED/PENDING)،
تقویم جلالی (رفت و برگشت، `۱۳ آبان ۱۴۰۵`)، پنجرهٔ روز و صفحه‌بندی/قیمت.

بخش دوم `backend/dist/main.js` را با `SERVE_FRONTEND=1` روی پورت تصادفی بالا
می‌آورد و این را چک می‌کند:

- `/api/health?db=1` زنده است و همان پورت را گزارش می‌دهد؛
- نوک‌های عمومی ۲۰۰ می‌دهند: `/api/packages`، `/api/salons/search`،
  `/api/mini/config`، `/api/mini/featured`، `/api/public/upload-limits`
  (و سقف‌ها به‌صورت مگابایت به کلاینت می‌رسد)؛
- `/api/pages/home` برای لودرِ شناخته‌شده ۲۰۰ و `/api/pages/<ناشناس>` ۴۰۴ است (نه ۵۰۰)؛
- نوک‌های نگه‌داشته بدون توکن ۴۰۱ می‌دهند: `/api/salons`، `/api/admin/users`،
  `/api/admin/audit`، `/api/notifications`؛
- ورود سوپرادمین seed (`admin@nobino.ir` / `Admin@1234`) توکن می‌دهد و با همان
  توکن `/api/admin/users` و `/api/admin/ai/status` (شکل پاسخ: `switchOn` و
  `llmProviders[]` که `AiSettings.tsx` مصرف می‌کند) باز می‌شود؛
- SPA در `/` و fallback مسیر عمیق `/packages` کار می‌کند؛
- در لاگ بوت خطای حل‌ونصب Nest یا `UnhandledPromiseRejection` نباشد.

### حالت‌های skip (نه fail)

| شرط | رفتار |
| --- | --- |
| `backend/dist` نیست | همهٔ تست‌های این فایل skip می‌شوند؛ با `npm run build:backend` فعال می‌شوند |
| PostgreSQL بالا نیست | بخش HTTP skip با پیام «دیتابیس در دسترس نیست»؛ تست‌های خالص اجرا می‌مانند |
| `frontend/dist/index.html` نیست | فقط تست سرو SPA skip |

نتیجهٔ اجرای واقعی روی محیط توسعه (بیلد تازه + دیتابیس محلی): ۲۶ تست، ۲۶ سبز.
