# استقرار نوبینو (نسخهٔ NestJS) — سرور و PaaS

دو مسیر پشتیبانی‌شده دارد: **سرور خودتان** (Ubuntu/Debian با nginx + PM2) و
**پلتفرم داکری/PaaS** (Railway، Render، اَبر آراس، سرخس، VPS داکردار و…).
هر دو از یک کد و یک اسکریپت شروع (`scripts/paas-start.mjs`) استفاده می‌کنند؛
تفاوت فقط در این است که SPA را nginx سرو می‌کند یا خودِ بک‌اند.

---

## ۰) یک‌خطی‌های شروع سریع

**سرور Ubuntu/Debian (نصب کامل):**
```bash
git clone <repo-url> /opt/nobino && cd /opt/nobino
cp deploy/env.production.example .env && nano .env      # DATABASE_URL، JWT_SECRET، دامنه
sudo bash deploy/install.sh --domain nobino.ir
```

**سرور Ubuntu/Debian (با HTTPS، بعد از صدور گواهی wildcard):**
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot certonly --manual --preferred-challenges dns -d nobino.ir -d '*.nobino.ir'
sudo bash deploy/install.sh --domain nobino.ir --tls
```

**به‌روزرسانی بعدی:**
```bash
sudo bash deploy/update.sh
```

**اجرای کامل با داکر (اپ + PostgreSQL) روی یک سرور:**
```bash
git clone <repo-url> nobino && cd nobino
cp deploy/env.production.example .env && nano .env       # POSTGRES_PASSWORD و دامنه
docker compose up -d --build
curl "http://127.0.0.1:3100/api/health?db=1"
```

**PaaS فقط با Dockerfile (Railway / Render / اَبر آراس / Fly.io):**
```
Dockerfile:  Dockerfile           پورت: 3100 (PORT را پلتفرم ست می‌کند)
Build command:  npm run build
Start command:  npm start
```

**خشک‌کردن install.sh قبل از اجرا روی سرور واقعی:**
```bash
sudo bash deploy/install.sh --domain nobino.ir --dry-run
```

---

## ۱) معماری پروداکشن

```
            ┌── /api/*  ───────────────►  NestJS (127.0.0.1:PORT)
کاربر ──► nginx                          │  ├─ route handlerها (controllerهای تولیدی)
            │                            │  ├─ /uploads/*  (public/uploads)
            ├── /uploads/* ── دیسک       │  ├─ کران‌ها (@nestjs/schedule)
            ├── /assets/*  ── دیسک       │  └─ /api/health
            └── بقیه ─── frontend/dist   │
                                          └── در حالت PaaS: خودِ بک‌اند SPA را سرو می‌کند (SERVE_FRONTEND=1)
```

* مسیر **ساب‌دامین سالن‌ها** (`mah.nobino.ir`) فرم canonical آدرس عمومی هر سالن است؛
  برای همین nginx هم `nobino.ir` و هم `*.nobino.ir` را سرو می‌کند و DNS هم باید
  رکورد wildcard داشته باشد.
* آپلودها وقتی `BLOB_READ_WRITE_TOKEN` ست نشده باشد در `public/uploads` (و صداها در
  `public/voice`) روی دیسک می‌نشینند؛ مسیرشان نسبت به **cwd** سرویس حل می‌شود، پس
  سرویس باید از ریشهٔ پروژه اجرا شود (همان کاری که `deploy/ecosystem.config.cjs` و
  ایمیج داکر انجام می‌دهند).
* کران‌ها داخل پروسهٔ Nest اجرا می‌شوند؛ بنابراین **فقط یک instance** لازم است.
  `instances > 1` یا cluster mode باعث تکرار پیامک یادآوری می‌شود.

---

## ۲) متغیرهای محیطی

الگوی کامل با توضیح فارسی: [`deploy/env.production.example`](../deploy/env.production.example)
(و فهرست همهٔ درگاه‌های پرداخت در [`.env.example`](../.env.example)).

| متغیر | چرا | مقدار پیشنهادی |
|---|---|---|
| `DATABASE_URL` | اتصال Prisma | `postgresql://user:pass@localhost:5432/nobino?schema=public` |
| `JWT_SECRET` | امضای نشست‌ها | خروجی `openssl rand -base64 32` |
| `SITE_URL` / `APP_URL` | لینک مطلق، OG، canonical، کوکی Secure | `https://nobino.ir` |
| `ROOT_DOMAIN` | فرم ساب‌دامین آدرس سالن‌ها | `nobino.ir` |
| `CRON_SECRET` | محافظت `/api/cron/*` (و اجازۀ اجرای کران داخلی) | رمز تصادفی دیگر |
| `PORT` / `HOST` | پورت داخلی | VPS: `3100` — PaaS: پلتفرم خودش ست می‌کند |
| `SERVE_FRONTEND` | سرو SPA از همان پورت (برای PaaS تک‌پورت لازم است) | `1` |
| `DB_SETUP` | `auto` / `migrate` / `push` / `skip` | `auto` |
| `VITE_ROOT_DOMAIN`، `VITE_SITE_URL` | فقط موقع `vite build` داخل باندل می‌نشیند | `nobino.ir`، `https://nobino.ir` |
| `PAYMENT_CALLBACK_BASE` | آدرس بازگشت درگاه | `https://nobino.ir/api/payments/callback` |
| `SMS_PROVIDER` + کلید | پیامک یادآوری | `kavenegar` / `smsdotir` |
| `BLOB_READ_WRITE_TOKEN` | ذخیرهٔ ابری صوت/گالری | خالی = دیسک (`public/uploads`) |

دو نکتهٔ مهم:
1. `load-env` **جای‌نگهدار `${...}` را باز نمی‌کند**؛ همهٔ مقادیر باید کامل نوشته شوند.
2. متغیرهای `VITE_*` بعد از تغییر، فقط با بیلد دوبارهٔ فرانت اثر می‌کنند
   (`node scripts/build-release.mjs --skip-install`).

---

## ۳) سرور خودی (Ubuntu 22.04/24.04، Debian 12)

```bash
sudo bash deploy/install.sh --domain nobino.ir \
     [--port 3100] [--app-dir /opt/nobino] [--copy] [--user deployer] \
     [--tls] [--demo-seed] [--skip-build] [--skip-nginx] [--dry-run]
```

کارهایی که انجام می‌دهد (و کارهایی که **انجام نمی‌دهد**):

1. پیش‌بررسی روت، فایل `.env`، و `DATABASE_URL` (اگر `postgresql://` نباشد می‌ایستد).
2. نصب **فقط** آنچه لازم است: `curl ca-certificates gnupg git rsync`، Node.js ≥ 20
   (اگر نسخهٔ موجود کمتر از 20 باشد از NodeSource)، nginx و PM2.
   به PHP، MySQL/MariaDB، سرویس‌های دیگر، `/var/www/html`، DNS یا اعتبارنامهٔ
   دیتابیس‌های موجود **دست نمی‌زند**.
3. `npm ci` در ریشه/backend/frontend → `prisma generate` → `scripts/build-release.mjs`.
4. هم‌راستایی schema: اگر `prisma/migrations` باشد `migrate deploy`، وگرنه
   `db push` (پروژهٔ فعلی migration ندارد؛ دربارهٔ ساختش در بخش ۷).
5. سرویس PM2 با نام `nobino-api` از روى `deploy/ecosystem.config.cjs` (تولیدشده از
   قالب `deploy/ecosystem.config.cjs.template`) + `pm2 save` + `pm2 startup`.
6. vhost اِج‌انجی‌اِکس در `/etc/nginx/sites-available/nobino.conf` با
   `server_name nobino.ir *.nobino.ir` (فایل‌های دیگر و `default` حذف/تغییر نمی‌شوند)؛
   `nginx -t` و بعد `systemctl reload nginx`.
7. بررسی سلامت با `curl http://127.0.0.1:PORT/api/health?db=1`.

**پس از نصب:**
```bash
pm2 status && pm2 logs nobino-api --lines 40     # وضعیت و لاگ
curl -s "http://127.0.0.1:3100/api/health?db=1"  # سلامت + وضعیت DB
```

**بازگشت به حالت قبل (بدون حذف اپ‌های دیگر):**
```bash
sudo pm2 delete nobino-api
sudo rm /etc/nginx/sites-enabled/nobino.conf && sudo nginx -s reload
```

---

## ۴) داکر و PaaS

**ایمیج:** `Dockerfile` چند-مرحله‌ای (Node 24 slim، کاربر غیرریشه، healthcheck داخلی).
خروجی نهایی شامل `backend/dist`، `frontend/dist`، `prisma/`، `scripts/` و
`node_modules` ریشه/بک‌اند است؛ `node_modules` فرانت در ایمیج نمی‌آید.

```bash
docker build -t nobino .
docker run --rm -p 3100:3100 --env-file .env nobino
```

**PaaS با build/start command (Render، Railway، Fly، اَبر آراس و…):**

| تنظیم | مقدار |
|---|---|
| Build command | `npm ci && npm run build` (یا فقط `npm run build` اگر پلتفرم خودش `npm ci` می‌کند) |
| Start command | `npm start` → `node scripts/paas-start.mjs` |
| Port | از env `PORT` می‌خواند (پیش‌فرض 3100) |
| Healthcheck | `GET /api/health` (و `?db=1` برای readyness با دیتابیس) |
| Databases | یک PostgreSQL managed؛ فقط `DATABASE_URL` را بدهید |

`scripts/paas-start.mjs` در بوت: در نبودِ خروجی، بیلد می‌کند → `prisma generate` →
آماده‌سازی دیتابیس (`DB_SETUP=auto`) → `node backend/dist/main.js` با
`SERVE_FRONTEND=1` → و بعد از بالا آمدن، یک `prerender` خلفی برای صفحات سالن‌ها.

**مهاجرت از Next.js/Vercel:** در این نسخه `vercel.json` و `NEXT_PUBLIC_*`
خوانده نمی‌شوند؛ کران‌ها درون‌پروسه‌ای‌اند (نه Vercel Cron) و `_not-found`/middleware
Next جای خود را به nginx + میدل‌ور Nest داده‌اند.

**دیتابیس:** `docker-compose.yml` یک `postgres:16-alpine` با volume
`pgdata` می‌سازد و `DATABASE_URL` را خودش می‌چسباند. اگر دیتابیس جدا/managed است،
فقط `DATABASE_URL` را در `.env` بدهید و سرویس `db` را در compose اجرا نکنید.
**volume آپلود:** `uploads` و `voice` در compose واریز شده‌اند؛ روی پلتفرم‌هایی
که filesystem دائمی ندارند یا `BLOB_READ_WRITE_TOKEN` بدهید یا volume مانده بگذارید،
وگرنه با هر deploy فایل‌های گالری پاک می‌شوند.

---

## ۵) بررسی پس از استقرار (چک‌لیست)

```bash
H=https://nobino.ir
curl -s "$H/api/health?db=1" | head -c 400   # status ok، db up، servingSpa true
curl -sI "$H/api/health" | head -3            # no-store
curl -s "$H/" | grep -o '<title>[^<]*'        # صفحهٔ اصلی + prerender
curl -s "$H/sitemap.xml" | head -5             # sitemap از build
curl -s -o /dev/null -w '%{http_code}\n' "$H/dashboard"     # 200 (shell اسپا)
curl -s -o /dev/null -w '%{http_code}\n' "$H/api/nope"      # 404 (نه html)
```

- [ ] ورود با شماره موبایل و OTP روی دامنهٔ واقعی کار می‌کند (کوکی Secure از
      `X-Forwarded-Proto` تشخیص داده می‌شود).
- [ ] لینک یک سالن به فرم `https://<slug>.nobino.ir` باز می‌شود و همان صفحهٔ سالن را
      نشان می‌دهد (QR/میان‌بر نصب همین را می‌سازد).
- [ ] آپلود تصویر گالری در `public/uploads` (or Blob) ذخیره و نمایش داده می‌شود.
- [ ] `pm2 logs` (یا لاگ کانتینر) خطای کران ندارد؛ اگر `CRON_SECRET` خالی باشد
      کران عملاً اجرا **نمی‌شود** و فقط هشدار می‌دهد.
- [ ] یک رزرو تستی + پیامک یادآوری (یا لاگ mock) وصل است.
- [ ] بکاپ روزانه: `pg_dump` + `public/uploads`.

---

## ۶) کران، پشتیبان‌گیری و مقیاس

کران‌های داخلی (همان مسیرهای `/api/cron/*`، با هدر `x-cron-secret`):

| کار | زمان‌بندی |
|---|---|
| `cron/reminders` (پیامک یادآوری) | هر ساعت |
| `cron/notifications` | هر ۵ دقیقه |
| `cron/holds` (آزادسازی هول‌ها) | هر ۱۰ دقیقه |
| `cron/waitlist` | دقیقه ۱۵ هر ساعت |
| `cron/subscriptions` (انقضا/تمدید) | ساعت 02:00 |

اگر چند instance اجرا می‌کنید، کران داخلی را غیرفعال کنید و از crontab با
`AUTOMATION_BASE_URL` استفاده کنید (محافظ `/api/cron/*` هدر `Authorization: Bearer`
را با مقدار `CRON_SECRET` — یا تنظیم پویای `cron.secret` در پنل ادمین — مقایسه می‌کند):
```cron
*/5 * * * *  curl -s -H "Authorization: Bearer $CRON_SECRET" https://nobino.ir/api/cron/notifications
0  * * * *   curl -s -H "Authorization: Bearer $CRON_SECRET" https://nobino.ir/api/cron/reminders
```

پشتیبان‌گیری:
```bash
pg_dump "$DATABASE_URL" | gzip > /backups/nobino-$(date +%F).sql.gz
rsync -a public/uploads/ /backups/uploads/
```

---

## ۷) محدودیت‌ها و نکات شناخته‌شده

1. **`prisma/migrations` در مخزن نیست** (تا امروز با `db push` ساخته شده). مسیر
   `auto` همان `db push` را انتخاب می‌کند که برای راه‌اندازی بی‌خطر است ولی برای
   پروداکشن قابل‌تکرار نیست. برای تبدیل به migration:
   ```bash
   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > /tmp/init.sql
   mkdir -p prisma/migrations/0_init && cp /tmp/init.sql prisma/migrations/0_init/migration.sql
   printf 'provider = "postgresql"\n' > prisma/migrations/migration_lock.toml
   # روی دیتابیس موجود (بدون از دست دادن داده):
   npx prisma migrate resolve --applied 0_init
   ```
   از آن به بعد `DB_SETUP=auto` همان `migrate deploy` را انتخاب می‌کند.
2. **اگر دیتابیس بالا نباشد، Nest در `onModuleInit` کرش می‌کند**
   (`PrismaClientInitializationError: Can't reach database server`). پس DB باید
   قبل از اپ آماده باشد (compose با `depends_on: service_healthy` این را انجام می‌دهد؛
   PM2 با autorestart تلاش مجدد می‌کند).
3. **بیلد با یک خطای تایپ بیرونی مواجه است**: `backend/src/lib/campaign-middleware.ts`
   (خط ۱۰ و ۱۵، `let gd = gd + …` → Duplicate identifier). این فایل import نشده و
   خروجی tsc را مختل نمی‌کند، ولی `npm run build:backend` را با کد ۲ می‌بندد.
   `scripts/build-release.mjs` برای همین خطاهای تایپ را «هشدار» می‌گیرد و معتبر بودن
   بیلد را با «وجود dist + بوت موفق سرور» می‌سنجد (با `--strict` سخت می‌گیرید).
   اصلاح یک‌خطی پیشنهادی: `let gd2 = gd + (gm > 2 ? (leap ? 1 : 0) : 0);`
   (در session دیگری باز است؛ دست نزده‌ایم.)
4. **دسترسی ادمین**: در محیط توسعه نام‌کاربری/رمز super-admin وجود ندارد؛ پنل ادمین
   فقط تا guard احراز هویت قابل آزمودن است. روی سرور باید کاربر ادمین را با
   `prisma` یا مسیر ثبت‌نام و ارتقای نقش بسازید.
5. **سرعت**: باندل SPA حدود ۱.۱MB (300KB gzip) است؛ اگر خواستید split کنید،
   `manualChunks` در `frontend/vite.config.ts`. nginx کش `/assets/*` را یک‌ساله
   و `sw.js` را `no-store` نگه می‌دارد تا PWA به‌روز بماند.

---

## ۸) عیب‌یابی سریع

| نشانه | علت احتمالی | کار |
|---|---|---|
| `502 Bad Gateway` | سرویس PM2/کانتینر پایین است یا PORT فرق دارد | `pm2 status`، `pm2 logs nobino-api`، `curl 127.0.0.1:PORT/api/health` |
| بوت با P1001 | دیتابیس پایین است یا `DATABASE_URL` غلط | `pg_isready`، بررسی host/port/رمز، در compose منتظر health بودن `db` |
| `⚠️ CRON_SECRET تنظیم نشده` | کران‌ها اجرا نمی‌شوند | در `.env` مقدار بدهید و سرویس را restart کنید |
| پیامک می‌رود ولی کد نمی‌آید | `SMS_PROVIDER=mock` | provider و کلید را ست کنید و restart |
| صفحهٔ سالن روی ساب‌دامین ۴۰۴/صفحهٔ اصلی | DNS wildcard یا `ROOT_DOMAIN`/`VITE_ROOT_DOMAIN` | `dig +short mah.nobino.ir`، بیلد دوبارهٔ فرانت |
| `ERR_TOO_MANY_REDIRECTS` | بلوک TLS + پروتکل `SITE_URL=https` با هم ولی گواهی نصب‌نشده | `install.sh --tls` را بعد از صدور گواهی اجرا کنید |
| آپلودها بعد از deploy پاک شدند | filesystem کانتینر موقت است | volume بگذارید یا `BLOB_READ_WRITE_TOKEN` |

---

## ۹) فایل‌های این بسته

| فایل | نقش |
|---|---|
| `Dockerfile`، `.dockerignore` | ایمیج تک‌پروسه (API + SPA) |
| `docker-compose.yml` | اپ + PostgreSQL + volumeها |
| `Procfile` | پلتفرم‌های Heroku-مانند (`web: node scripts/paas-start.mjs`) |
| `scripts/paas-start.mjs` | نقطهٔ شروع: دیتابیس → سرور → prerender |
| `scripts/build-release.mjs` | نصب/bیلد هر دو سمت + smoke-test بوت |
| `deploy/install.sh` | نصب‌کنندهٔ تک‌فرمان VPS |
| `deploy/update.sh` | به‌روزرسانی (pull → بیلد → migrate → restart) |
| `deploy/ecosystem.config.cjs.template` | قالب سرویس PM2 |
| `deploy/nginx/*.conf.*` | vhost دامنه + wildcard، بلوک TLS، upstream |
| `deploy/env.production.example` | چک‌لیست متغیرهای پروداکشن |
