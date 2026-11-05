# نشانی سالن‌ها از کجا ساخته می‌شود (Nobino-nest)

قاعدهٔ پروژه: نشانی canonical هر سالن فرم **ساب‌دامین** است —
`http://mah.localhost:3100/` در توسعه (با پورت) و `https://mah.nobino.ir/` در
انتشار. فرم مسیر (`/s/mah`) فقط بازگشتی است (میزبان IP، دامنهٔ بدون ساب‌دامین).

## دو مبنای متفاوت، هر جای خودش

| مبنا | از کجا | کجا استفاده می‌شود |
| --- | --- | --- |
| سمت کلاینت | `window.location` (پروتکل + میزبان + پورت) | `subdomainUrl()` در `frontend/src/lib/subdomain.ts`، `salonPublicUrl()` در `frontend/src/components/SalonQrCard.tsx`، `salonPublicAddress()` در `frontend/src/dashmini/lib/public-url.ts` |
| سمت سرور | اوریجین **همان درخواست** و در نبودِ درخواست، `SITE_URL` | `salonPublicUrl()` در `backend/src/lib/salon-url.ts` (پاسخ `/api/admin/salons/<id>` و `publicUrl` لودر `dashboard-salon`) و پایهٔ `miniUrl` در `backend/src/lib/mini/config.ts` |

سمت کلاینت همیشه پورت را نگه می‌دارد، پس هر دو نسخهٔ توسعه
(`:5175` با Vite و `:3100` با بیلدِ سرو‌شده توسط API) نشانی درست می‌گیرند.

سمت سرور تا پیش از این فقط `SITE_URL` را می‌دید: روی `:3100` پنل ادمین
`http://mah.localhost:5175` و `/api/mini/config` همان `:5175` را می‌داد. حالا
`publicOrigin()` در `backend/src/lib/site-origin.ts` اوریجینِ درخواست جاری را
از `requestStore` (AsyncLocalStorage که `run-route.ts` پرش می‌کند) می‌خواند و
`salon-url.ts` / `mini/config.ts` از همان استفاده می‌کنند.

## قانون پذیرش میزبان (Host-header)

`requestOriginOrNull()` فقط در دو حالت میزبان درخواست را می‌پذیرد:

۱) میزبان محلی: `localhost`، `*.localhost`، `127.x`، `[::1]` — لازم برای توسعه،
   چون پورت (`:3100` یا `:5175`) بخشی از نشانی است؛
۲) میزبان زیرِ `ROOT_DOMAIN` تنظیم‌شده (`nobino.ir` → `mah.nobino.ir`).

هر میزبان دیگری (هدر Host دست‌کاری‌شده) رد می‌شود و `SITE_URL`ِ تنظیم‌شده
جایش را می‌گیرد. بیرون از یک HTTP request — کران‌ها، پیامک، صف، پری‌رندرِ
داخلی — `requestOriginOrNull()` مقدار `null` می‌دهد و همان `SITE_URL` استفاده
می‌شود؛ عمداً این‌طور است که لینکِ بیرون‌از-درخواست به میزبانِ تصادفی گره نخورد.

## چیزی که عمداً درخواست‌آگاه نشد

متادیتای سئوی صفحهٔ عمومی سالن (`page-loaders.ts` → `loadSalon`: JSON-LD و
canonical مطلق) همچنان از `SITE_URL` ساخته می‌شود. دلیل: پری‌رندر به
`http://127.0.0.1:<port>` درخواست می‌زند (`frontend/prerender.mjs`) و اگر لودر
میزبان درخواست را می‌پسندید، نشانی حلقهٔ باز در صفحاتِ بیلد‌شده می‌سوخت — همان
نقصی که `absPrefix`/`isLoopback` برای جلوگیری از آن نوشته شده است. پس:

- روی سرور واقعی `SITE_URL` (و `ROOT_DOMAIN`) باید دامنهٔ نهایی باشد؛
- اگر در توسعه می‌خواهید JSON-LD هم `:3100` بگیرد، در `.env` بنویسید
  `SITE_URL="http://localhost:3100"` (هر دو پورت یک SPA را سرو می‌کنند).

لودرهای احراز هویت‌شده (مثل `dashboard-salon`) پری‌رندر نمی‌شوند، پس
`publicUrl` همان‌جا درخواست‌آگاه است و نشانی «:5175» نشان نمی‌دهد.

## تست

`scripts/smoke.test.mjs` سه سطح این را می‌سنجد: تابع خالص (پذیرش میزبان محلی با
پورت، رد هدر جعلی، بازگشت به `SITE_URL` بیرون از درخواست، `mah.mah` نشدن)؛
سطح HTTP با `Host:` دلخواه روی سرور ساخته‌شده (`/api/mini/config` و
`/api/pages/dashboard-salon`)؛ و اینکه با هدر جعلی هیچ‌کدام از آن میزبان‌ها در
نشانی نمی‌نشیند. اجرا: `npm run test:smoke` (یا `npm test`).
