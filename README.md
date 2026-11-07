# Nobino — نسخهٔ NestJS

سامانهٔ نوبت‌دهی و مدیریت سالن (رزرو آنلاین، پنل سالن، پنل سوپرادمین، رزرو صوتی،
پرداخت و پیامک).

| بخش | فناوری |
|---|---|
| بک‌اند | NestJS 11 + Prisma 6 + PostgreSQL |
| فرانت | React 19 + Vite 7 + Tailwind 4 |
| اجرا | PM2 + nginx (VPS)، Docker، یا PaaS |

> راهنمای کامل استقرار و همهٔ جزئیات سرور: [`docs/deploy.md`](docs/deploy.md)
> — چک‌لیست امنیتی پیش از پروداکشن: [`DEPLOYMENT_CHECKLIST.md`](DEPLOYMENT_CHECKLIST.md)

---

## ۱) نصب تک‌خطی (VPS تازه — پیشنهادی)

روی یک سرور **Ubuntu 22.04/24.04** یا **Debian 12** با دسترسی root و دامنه‌ای که
رکورد `A` (و رکورد wildcard برای ساب‌دامین سالن‌ها) به همان سرور اشاره می‌کند:

```bash
curl -fsSL https://raw.githubusercontent.com/alisystemit/Nobino-nest/master/install.sh | sudo bash -s -- --domain example.com
```

`example.com` را با دامنهٔ خودتان عوض کنید. همین یک فرمان این کارها را انجام می‌دهد:

1. نصب پیش‌نیازها (`git`, `curl`, `openssl`) و Node.js 24 از NodeSource
2. نصب PM2 و PostgreSQL، ساخت دیتابیس `nobino` با رمز تصادفی
3. دریافت کد در `/opt/nobino` و ساخت خودکار `.env` (بدون `CHANGE_ME`)
4. ساخت swap روی سرورهای کم‌رم، تنظیم فایروال (SSH/80/443/8443)
5. بیلد بک‌اند و فرانت + راه‌اندازی سرویس PM2 + vhost انجینیکس
6. بررسی سلامت و در پایان ساخت **اولین سوپرادمین**

اگر می‌خواهید سوپرادمین بدون پرسش ساخته شود (مناسب CI/اسکریپت):

```bash
curl -fsSL https://raw.githubusercontent.com/alisystemit/Nobino-nest/master/install.sh | sudo ADMIN_PHONE=09121110000 ADMIN_PASSWORD='YourStrong#Pass' bash -s -- --domain example.com
```

> رمز را در متغیر محیطی بدهید تا در `ps` و تاریخچهٔ shell نماند.
> اگر `sudo` رمز می‌خواهد، اول یک‌بار `sudo -v` بزنید و بعد فرمان را اجرا کنید.
> برای دیدن مراحل بدون تغییر سرور، `--dry-run` اضافه کنید.

### گزینه‌های نصب تک‌خطی

| گزینه | پیش‌فرض | توضیح |
|---|---|---|
| `--domain <دامنه>` | — (اجباری) | دامنهٔ سایت؛ ساب‌دامین سالن‌ها `<slug>.<دامنه>` می‌شود |
| `--app-dir <مسیر>` | `/opt/nobino` | مسیر نصب |
| `--branch <شاخه>` | `master` | شاخهٔ گیت برای نصب |
| `--port <پورت>` | `3100` | پورت داخلی بک‌اند (nginx جلوی آن است) |
| `--pg-password <رمز>` | تصادفی | رمز یوزر دیتابیس |
| `--database-url <url>` | — | برای دیتابیس آماده/بیرونی |
| `--admin-phone`, `--admin-password` | پرسش تعاملی | ساخت سوپرادمین اولیه |
| `--no-admin` | — | ساخت سوپرادمین را رد کن |
| `--no-firewall` | — | ufw را تغییر نده |
| `--with-postgres` | — | حتی اگر Postgres هست، دیتابیس/یوزر `nobino` بساز |
| `--dry-run` | — | فقط چاپ مراحل، بدون تغییر |

متغیرهای محیطی جایگزین: `NOBINO_REPO`، `NOBINO_BRANCH`، `NOBINO_APP_DIR`.

---

## ۲) پیش‌نیازها

- **Node.js ≥ 20.19** (پیشنهادی: 22 یا 24) و `npm`
- **PostgreSQL 14+** (پیشنهادی: 16)
- `git`
- پورت‌های آزاد: `3100` (API) و در توسعه `5175` (Vite)

نسخهٔ Node را چک کنید:

```bash
node -v   # باید 20.19 یا بالاتر باشد
```

---

## ۳) نصب برای توسعه (لوکال — ویندوز/لینوکس/مک)

### گام ۱ — دریافت کد و نصب وابستگی‌ها

```bash
git clone https://github.com/alisystemit/Nobino-nest.git
cd Nobino-nest
npm install
npm --prefix backend install
npm --prefix frontend install
```

### گام ۲ — دیتابیس PostgreSQL

اگر PostgreSQL روی سیستم دارید، یک دیتابیس بسازید:

```sql
CREATE USER nobino WITH PASSWORD 'nobino';
CREATE DATABASE nobino OWNER nobino;
```

یا سریع با داکر:

```bash
docker run -d --name nobino-pg \
  -e POSTGRES_USER=nobino \
  -e POSTGRES_PASSWORD=nobino \
  -e POSTGRES_DB=nobino \
  -p 5432:5432 postgres:16-alpine
```

### گام ۳ — فایل `.env`

```bash
cp .env.example .env
```

حداقل این مقادیر را پر کنید:

```env
DATABASE_URL="postgresql://nobino:nobino@localhost:5432/nobino?schema=public"
JWT_SECRET="<خروجی openssl rand -base64 32>"
CRON_SECRET="<یک رمز تصادفی دیگر>"
```

ساخت رمز:

```bash
openssl rand -base64 32
```

> در توسعه، `SMS_PROVIDER=mock` و `VOICE_PROVIDER=mock` بمانند؛ پیامک/صدا فقط لاگ می‌شوند.

### گام ۴ — ساخت جدول‌ها و دادهٔ نمونه

```bash
npm run db:generate
npm run db:push          # یا: npm run db:migrate
npm run seed             # دادهٔ پایه (ادمین 09120000000 / Admin@1234)
npm run seed:demo        # اختیاری: دادهٔ نمایشی بیشتر
```

### گام ۵ — اجرا

```bash
npm run dev
```

| سرویس | آدرس |
|---|---|
| فرانت (Vite) | http://localhost:5175 |
| API + سلامت | http://localhost:3100/api/health |

`npm run dev` خودش Prisma Client و بک‌اند را می‌سازد. توقف:

```bash
npm run stop
```

روی سیستم‌های کم‌رم می‌توانید از اجرای سریع (بدون بیلد مجدد) استفاده کنید:
`npm run dev:fast`.

### ساخت سوپرادمین دلخواه (جایگزین seed)

```bash
ADMIN_PHONE=09121110000 ADMIN_PASSWORD='YourStrong#Pass' node scripts/create-admin.mjs
```

بازنشانی رمز همان شماره:

```bash
ADMIN_PHONE=09121110000 ADMIN_PASSWORD='NewStrong#Pass' node scripts/create-admin.mjs --force-reset
```

> روی ویندوز اگر اسکریپت‌های `.sh` را اجرا می‌کنید از Git Bash یا WSL استفاده کنید؛
> فرمان‌های `npm run ...` در PowerShell هم کار می‌کنند.

---

## ۴) نصب روی سرور به‌صورت دستی

اگر نمی‌خواهید از تک‌خطی استفاده کنید:

```bash
git clone https://github.com/alisystemit/Nobino-nest.git /opt/nobino
sudo bash /opt/nobino/deploy/bootstrap.sh --domain example.com
```

یا وقتی `.env` را خودتان آماده کرده‌اید:

```bash
git clone https://github.com/alisystemit/Nobino-nest.git /opt/nobino
cd /opt/nobino
cp deploy/env.production.example .env
nano .env                 # DATABASE_URL، JWT_SECRET، CRON_SECRET، دامنه
sudo bash deploy/install.sh --domain example.com
```

افزودن HTTPS پس از صدور گواهی (wildcard):

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot certonly --manual --preferred-challenges dns -d example.com -d '*.example.com'
sudo bash deploy/install.sh --domain example.com --tls
```

---

## ۵) اجرا با داکر (اپ + PostgreSQL)

```bash
git clone https://github.com/alisystemit/Nobino-nest.git
cd Nobino-nest
cp deploy/env.production.example .env
nano .env                 # POSTGRES_PASSWORD، SITE_URL، ROOT_DOMAIN، JWT_SECRET، CRON_SECRET
docker compose up -d --build
curl "http://127.0.0.1:3100/api/health?db=1"
docker compose logs -f app
```

ساخت سوپرادمین داخل کانتینر:

```bash
docker compose exec app node scripts/create-admin.mjs --phone 09121110000 --password 'YourStrong#Pass'
```

> پوشه‌های `uploads`، `voice` و `asr_models` به‌صورت volume نگه‌داری می‌شوند تا با
> هر `rebuild` پاک نشوند.

---

## ۶) استقرار روی PaaS (Railway / Render / Fly / …)

| تنظیم | مقدار |
|---|---|
| Build command | `npm ci && npm run build:release` |
| Start command | `npm start` |
| Port | از متغیر `PORT` (پیش‌فرض `3100`) |
| Healthcheck | `GET /api/health` (و `?db=1` برای بررسی دیتابیس) |
| Database | یک PostgreSQL managed؛ فقط `DATABASE_URL` را بدهید |

> فرمان `npm run build` تنها کافی نیست؛ چون `--skip-install` دارد و `tsc`/`vite`
> را نصب نمی‌کند. فرمان امن همان `npm ci && npm run build:release` است.

---

## ۷) متغیرهای محیطی مهم

فهرست کامل در [`.env.example`](.env.example) (توسعه) و
[`deploy/env.production.example`](deploy/env.production.example) (پروداکشن) است.

| متغیر | کاربرد |
|---|---|
| `DATABASE_URL` | اتصال Prisma به PostgreSQL |
| `JWT_SECRET` | امضای نشست‌ها — حداقل ۳۲ کاراکتر تصادفی |
| `CRON_SECRET` | محافظت از `/api/cron/*`؛ خالی = کران اجرا نمی‌شود |
| `APP_URL` / `SITE_URL` | دامنهٔ عمومی؛ لینک مطلق، OG، canonical، کوکی Secure |
| `ROOT_DOMAIN` | دامنهٔ ریشهٔ ساب‌دامین سالن‌ها |
| `PORT` / `HOST` | پورت داخلی API (VPS: `3100`) |
| `SERVE_FRONTEND` | `1` = بک‌اند، SPA را هم سرو می‌کند (PaaS تک‌پورت) |
| `DB_SETUP` | `auto` / `migrate` / `push` / `skip` |
| `PAYMENT_DEFAULT_GATEWAY` / `PAYMENT_SANDBOX` | درگاه پرداخت و حالت تست |
| `PAYMENT_CALLBACK_BASE` | آدرس بازگشت درگاه |
| `SMS_PROVIDER` + کلید | `kavenegar` / `smsdotir` / … یا `mock` |
| `BLOB_READ_WRITE_TOKEN` | ذخیرهٔ ابری فایل‌ها؛ خالی = دیسک محلی |

نکته: جای‌نگهدار `${...}` داخل `.env` باز نمی‌شود؛ همهٔ مقادیر را کامل بنویسید.

---

## ۸) بعد از نصب — چک‌لیست

```bash
pm2 status
pm2 logs nobino-api --lines 40
curl -s "http://127.0.0.1:3100/api/health?db=1"
curl -s "https://example.com/api/health?db=1"
```

- [ ] ورود مدیران با موبایل/رمز سوپرادمین در `https://<دامنه>` کار می‌کند
- [ ] از «تنظیمات سیستم» کلید پیامک، درگاه پرداخت و هوش مصنوعی را پر کرده‌اید
- [ ] رکورد DNS wildcard (`*.example.com`) به سرور اشاره می‌کند
- [ ] HTTPS فعال است و صفحهٔ یک سالن روی `https://<slug>.<دامنه>` باز می‌شود
- [ ] آپلود تصویر/صدا ذخیره و نمایش داده می‌شود
- [ ] بکاپ روزانهٔ دیتابیس و `public/uploads` تنظیم شده است

---

## ۹) به‌روزرسانی، توقف و بکاپ

```bash
# به‌روزرسانی (pull + npm ci + بیلد + بکاپ + migrate + restart)
sudo bash /opt/nobino/deploy/update.sh

# بازگشت به نسخهٔ قبل
sudo bash /opt/nobino/deploy/update.sh --rollback --yes

# توقف سرویس
pm2 stop nobino-api

# بکاپ دستی
pg_dump "$DATABASE_URL" | gzip > /backups/nobino-$(date +%F).sql.gz
rsync -a /opt/nobino/public/uploads/ /backups/uploads/
```

استقرار خودکار با `git push` هم پشتیبانی می‌شود:
[`docs/ops-console.md`](docs/ops-console.md).

---

## ۱۰) عیب‌یابی سریع

| نشانه | علت احتمالی | راه‌حل |
|---|---|---|
| `502 Bad Gateway` | سرویس PM2 پایین است یا پورت فرق دارد | `pm2 status`، `pm2 logs nobino-api`، `curl 127.0.0.1:3100/api/health` |
| خطای Prisma `P1001` | دیتابیس پایین است یا `DATABASE_URL` غلط | `pg_isready`، host/port/رمز را بررسی کنید |
| `⚠️ CRON_SECRET تنظیم نشده` | کران‌ها اجرا نمی‌شوند | `CRON_SECRET` را در `.env` بگذارید و سرویس را restart کنید |
| پیامک می‌رود ولی کد نمی‌آید | `SMS_PROVIDER=mock` | provider و کلید واقعی را ست کنید |
| ساب‌دامین سالن ۴۰۴ می‌دهد | DNS wildcard یا `ROOT_DOMAIN` | `dig +short test.example.com` و بیلد دوبارهٔ فرانت |
| `ERR_TOO_MANY_REDIRECTS` | `SITE_URL=https` بدون گواهی نصب‌شده | بعد از صدور گواهی `install.sh --tls` را اجرا کنید |
| آپلودها بعد از deploy پاک شدند | فایل‌سیستم موقت | volume بگذارید یا `BLOB_READ_WRITE_TOKEN` بدهید |

---

## ۱۱) ساختار پروژه

```
backend/        بک‌اند NestJS (routes، controllerها، lib)
frontend/       فرانت React/Vite (+ mini-app)
prisma/         schema، migrations، seed
scripts/        شروع/بیلد/بکاپ/ASR/ساخت ادمین
deploy/         نصب، به‌روزرسانی، nginx، PM2، قالب env
docs/           مستندات فنی و استقرار
install.sh      نصب‌کنندهٔ تک‌خطی (این مخزن را روی VPS نصب می‌کند)
```

## مستندات بیشتر

- استقرار و سرور: [`docs/deploy.md`](docs/deploy.md)
- کنسول عملیات و استقرار با git push: [`docs/ops-console.md`](docs/ops-console.md)
- پشتیبان‌گیری و بازگردانی: [`docs/backups.md`](docs/backups.md)
- مدل محلی گفتار: [`docs/asr-local.md`](docs/asr-local.md)
- API موبایل و مینی‌اپ: [`docs/mobile-api.md`](docs/mobile-api.md) و [`docs/miniapp.md`](docs/miniapp.md)
