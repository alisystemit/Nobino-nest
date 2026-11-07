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
5. بیلد بک‌اند و فرانت + راه‌اندازی سرویس PM2 + پیکربندی nginx
6. بررسی سلامت (سوپرادمین فقط اگر با پرچم/متغیر داده باشید ساخته می‌شود)

> برای **SSL و HTTPS** کافی است بعد از نصب، این فرمان را در ترمینال اجرا کنید
> (گواهی wildcard مستقیماً از **Let's Encrypt** با چالش DNS گرفته می‌شود):
>
> ```bash
> sudo bash /opt/nobino/deploy/ssl.sh --domain example.com --email you@example.com
> ```
>
> جزئیات و کانفیگ nginx در بخش ۵ آمده است.

اگر می‌خواهید سوپرادمین در همان اجرا و بدون پرسش ساخته شود:

```bash
curl -fsSL https://raw.githubusercontent.com/alisystemit/Nobino-nest/master/install.sh | sudo bash -s -- --domain example.com --admin-phone 09121110000 --admin-password 'YourStrong#Pass'
```

> پرچم‌ها در `ps` و تاریخچهٔ shell دیده می‌شوند. برای امنیت بیشتر، نصب را بدون
> آن‌ها انجام دهید و بعد از پایان نصب سوپرادمین را جدا بسازید:
>
> ```bash
> cd /opt/nobino
> sudo env ADMIN_PHONE=09121110000 ADMIN_PASSWORD='YourStrong#Pass' node scripts/create-admin.mjs
> ```

> اگر `sudo` رمز می‌خواهد، اول یک‌بار `sudo -v` بزنید و بعد فرمان را اجرا کنید.
> اگر با کاربر `root` وارد شده‌اید، `sudo` لازم نیست و می‌توانید `| bash -s -- ...` بزنید.
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
| `--admin-phone`, `--admin-password` | — | ساخت سوپرادمین اولیه (اگر ندهید بعداً دستی بسازید) |
| `--no-admin` | — | ساخت سوپرادمین را رد کن |
| `--no-firewall` | — | ufw را تغییر نده |
| `--with-postgres` | — | حتی اگر Postgres هست، دیتابیس/یوزر `nobino` بساز |
| `--tls` | — | بعد از نصب SSL بگیر و HTTPS را فعال کن (نیازمند `--email`؛ در اجرای pipe فقط با `--ssl-mode http`) |
| `--email <ایمیل>` | — | ایمیل حساب Let's Encrypt برای هشدار انقضا |
| `--ssl-mode <حالت>` | `dns` | `dns` (wildcard تعاملی، Let's Encrypt) / `http` (فقط دامنهٔ ریشه) / `cloudflare` (اختیاری، تمدید خودکار) |
| `--dns-credentials <مسیر>` | — | فایل اعتبارنامهٔ Cloudflare برای `--ssl-mode cloudflare` (اختیاری) |
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
> اگر پورت Vite را عوض نکرده‌اید، بهتر است `APP_URL` و `SITE_URL` را هم
> `http://localhost:5175` بگذارید تا لینک‌های مطلق درست ساخته شوند.

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

افزودن HTTPS بعد از نصب در بخش ۵ توضیح داده شده است.

---

## ۵) SSL و HTTPS (Let's Encrypt + nginx)

### چرا گواهی wildcard؟

آدرس عمومی هر سالن `<slug>.example.com` است؛ پس گواهی باید هم `example.com` و
هم `*.example.com` را پوشش دهد. Let's Encrypt برای wildcard فقط چالش **DNS** را
می‌پذیرد. بنابراین:

- رکورد `A` برای `example.com` و رکورد wildcard (`*`) به IP سرور لازم است.
- گواهی باید wildcard باشد، وگرنه ساب‌دامین سالن‌ها خطای گواهی می‌دهند.

بررسی DNS قبل از شروع:

```bash
dig +short example.com
dig +short test.example.com     # باید همان IP سرور را بدهد
```

> DNS می‌تواند روی هر ارائه‌دهنده‌ای باشد (ثبت‌کنندهٔ دامنه، Cloudflare،
> ArvanCloud و…). مهم این است که رکورد `A` برای دامنه و رکورد wildcard به IP
> همین سرور اشاره کنند.

همهٔ حالت‌های زیر گواهی را از **Let's Encrypt** می‌گیرند؛ Cloudflare فقط یک
گزینهٔ اختیاری برای خودکارکردن چالش DNS است و استفاده از آن لازم نیست.

### روش ۱ — DNS دستی با Let's Encrypt (پیش‌فرض و پیشنهادی)

بدون نیاز به هیچ API یا سرویس خارجی:

```bash
sudo bash /opt/nobino/deploy/ssl.sh --domain example.com --email you@example.com
```

اسکریپت متوقف می‌شود و دو رکورد `TXT` برای `_acme-challenge.example.com` نشان
می‌دهد. هر دو مقدار را با هم در پنل DNS ثبت کنید، چند دقیقه صبر کنید و
`Enter` بزنید.

این اسکریپت به‌صورت خودکار:

1. `certbot` را از **snap** (نسخهٔ رسمی) نصب می‌کند و اگر snap نبود به apt برمی‌گردد
2. گواهی `example.com` + `*.example.com` را از Let's Encrypt صادر می‌کند
3. هوک تمدید (`reload-nginx.sh`) را نصب می‌کند
4. vhost را با بلوک ۴۴۳ بازسازی می‌کند

> ⚠️ این روش تعاملی است و باید در ترمینال اجرا شود (در `curl | bash` نمی‌شود
> رکورد TXT را دستی ثبت کرد). بعد از نصب یک‌بار در ترمینال اجرا کنید.

> این حالت **تمدید خودکار ندارد**؛ هر ~۹۰ روز باید همین فرمان را دوباره اجرا
> کنید. اگر تمدید خودکار می‌خواهید، روش ۳ را ببینید.

### روش ۲ — فقط دامنهٔ ریشه (HTTP-01)

اگر ساب‌دامین سالن‌ها را استفاده نمی‌کنید و می‌خواهید همه‌چیز غیرتعاملی باشد:

```bash
sudo bash /opt/nobino/deploy/ssl.sh --domain example.com --email you@example.com --mode http
```

> ⚠️ در این حالت فقط `example.com` معتبر است و `mah.example.com` خطای گواهی
> می‌دهد. برای سامانهٔ نوبینو که آدرس سالن‌ها ساب‌دامین است، روش wildcard لازم است.

### روش ۳ (اختیاری) — تمدید خودکار با پلاگین DNS

اگر DNS دامنه روی Cloudflare است و می‌خواهید گواهی wildcard خودکار تمدید شود،
می‌توانید از پلاگین DNS استفاده کنید. گواهی همچنان از **Let's Encrypt** صادر
می‌شود و Cloudflare فقط رکورد چالش را خودکار ثبت می‌کند.

یک API Token با دسترسی `Zone → DNS → Edit` برای همان Zone بسازید و فایل
اعتبارنامه را با مجوز 600 ذخیره کنید:

```bash
sudo mkdir -p /etc/letsencrypt
printf 'dns_cloudflare_api_token = %s\n' 'YOUR_CF_TOKEN' | sudo tee /etc/letsencrypt/cloudflare.ini
sudo chmod 600 /etc/letsencrypt/cloudflare.ini
```

سپس:

```bash
sudo bash /opt/nobino/deploy/ssl.sh \
  --domain example.com \
  --email you@example.com \
  --mode cloudflare \
  --dns-credentials /etc/letsencrypt/cloudflare.ini
```

این اسکریپت `certbot` و پلاگین `certbot-dns-cloudflare` را (از snap، با
`snap connect`) نصب می‌کند، گواهی را می‌گیرد، هوک تمدید را می‌گذارد،
`snap.certbot.renew.timer` را فعال می‌کند و vhost را با بلوک ۴۴۳ بازسازی می‌کند.

یا همهٔ این‌ها را در همان نصب تک‌خطی بخواهید:

```bash
curl -fsSL https://raw.githubusercontent.com/alisystemit/Nobino-nest/master/install.sh | sudo bash -s -- --domain example.com --tls --email you@example.com --ssl-mode cloudflare --dns-credentials /etc/letsencrypt/cloudflare.ini
```

### صدور دستی گواهی (بدون اسکریپت)

```bash
# نسخهٔ رسمی certbot از snap (پیشنهادی)
sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/local/bin/certbot

sudo certbot certonly --manual --preferred-challenges dns \
  --cert-name example.com \
  -d example.com -d '*.example.com' \
  --email you@example.com --agree-tos --no-eff-email
```

> جایگزین با apt: `sudo apt-get install -y certbot python3-certbot-nginx`
> (روی توزیع‌های قدیمی نسخهٔ قدیمی‌تری نصب می‌شود؛ snap پیشنهاد می‌شود.)
>
> این هم همان گواهی Let's Encrypt است؛ فقط به‌جای اسکریپت، certbot را دستی
> اجرا می‌کنید.

بعد از صدور، nginx را با گواهی جدید بازسازی کنید:

```bash
sudo bash /opt/nobino/deploy/install.sh --domain example.com --tls --skip-build
```

### چه کانفیگی در nginx ساخته می‌شود؟

`install.sh --tls` وجود این دو فایل را بررسی می‌کند:

```
/etc/letsencrypt/live/example.com/fullchain.pem
/etc/letsencrypt/live/example.com/privkey.pem
```

اگر موجود باشند، به‌جای `nobino.conf.template` از
[`deploy/nginx/nobino.tls.conf.snippet`](deploy/nginx/nobino.tls.conf.snippet)
استفاده می‌کند و فایل نهایی را در
`/etc/nginx/sites-available/nobino.conf` می‌نویسد. اگر گواهی نباشد، فقط HTTP
نصب می‌شود و هشدار می‌دهد.

بلوک مشترک upstream (از [`deploy/nginx/nobino.upstream.conf.part`](deploy/nginx/nobino.upstream.conf.part)):

```nginx
upstream nobino_backend {
    server 127.0.0.1:3100 fail_timeout=10s;
    keepalive 16;
}
```

هدایت HTTP به HTTPS (چالش ACME مستثنی است):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name example.com *.example.com;

    location ^~ /.well-known/acme-challenge/ {
        root /var/lib/letsencrypt;
        default_type "text/plain";
        allow all;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}
```

بلوک اصلی HTTPS:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name example.com *.example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:20m;
    ssl_session_timeout 1d;

    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    root /opt/nobino/frontend/dist;
    index index.html;
    client_max_body_size 12m;
    charset utf-8;
    server_tokens off;

    access_log /var/log/nginx/nobino.ssl.access.log;
    error_log  /var/log/nginx/nobino.ssl.error.log warn;

    location /api/ {
        proxy_pass http://nobino_backend;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection        "";
        proxy_read_timeout 120s;
    }

    location ^~ /uploads/ {
        alias /opt/nobino/public/uploads/;
        try_files $uri @nobino_backend_tls;
        expires 30d;
        add_header Cache-Control "public";
    }

    location ^~ /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri @nobino_backend_tls;
    }

    location / {
        try_files $uri $uri/index.html $uri.html /index.html;
        add_header Cache-Control "no-cache";
    }
}
```

> نسخهٔ کامل و به‌روز (شامل `/voice/`، `sw.js`، manifest، sitemap و فونت‌ها)
> همان فایل `nobino.tls.conf.snippet` است؛ آن را دستی ویرایش نکنید و از
> `install.sh --tls` برای بازتولید استفاده کنید.

اعمال تغییرات:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### تمدید خودکار

```bash
sudo certbot certificates                 # فهرست گواهی‌ها و تاریخ انقضا
sudo certbot renew --dry-run              # تست تمدید
systemctl list-timers | grep -E 'certbot|snap.certbot'   # زمان‌بند تمدید
```

اگر certbot از snap نصب شده باشد، تمدید با `snap.certbot.renew.timer` انجام
می‌شود؛ در نسخهٔ apt با `certbot.timer`. هوک نصب‌شده در
`/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` بعد از هر تمدید موفق،
nginx را reload می‌کند. برای حالت DNS دستی، تمدید خودکار وجود ندارد و باید
`deploy/ssl.sh` را دوباره اجرا کنید.

### بررسی نهایی و عیب‌یابی

```bash
curl -sI https://example.com | head -5
curl -s "https://example.com/api/health?db=1"
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null \
  | openssl x509 -noout -subject -dates
```

| نشانه | علت احتمالی | راه‌حل |
|---|---|---|
| `DNS problem: NXDOMAIN` | رکورد DNS هنوز منتشر نشده | `dig +short _acme-challenge.example.com TXT` و چند دقیقه صبر |
| `nginx: cannot load certificate` | مسیر گواهی غلط یا گواهی صادر نشده | `ls /etc/letsencrypt/live/example.com/` و اجرای دوبارهٔ `install.sh --tls` |
| خطای گواهی روی `mah.example.com` | گواهی wildcard صادر نشده | `--mode dns` (یا در صورت استفاده از Cloudflare، `--mode cloudflare`) — نه `http` |
| `403` روی `/.well-known/acme-challenge` | ریشهٔ اشتباه یا پورت ۸۰ بسته | بلوک ACME در nginx و `ufw allow 80` |
| `ERR_TOO_MANY_REDIRECTS` | `SITE_URL` ناهماهنگ یا گواهی نصب‌نشده | `SITE_URL=https://example.com` و اجرای `install.sh --tls` |
| تمدید خودکار اجرا نمی‌شود | حالت `dns` دستی | هر ۹۰ روز دستی تمدید کنید یا (اختیاری) از پلاگین DNS مانند `cloudflare` استفاده کنید |

> بعد از فعال‌سازی HTTPS، در `.env` مقدار `SITE_URL` و `APP_URL` را
> `https://example.com` بگذارید و سرویس را restart کنید. کوکی نشست به‌صورت
> خودکار از `X-Forwarded-Proto` تشخیص داده می‌شود.

---

## ۶) اجرا با داکر (اپ + PostgreSQL)

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

## ۷) استقرار روی PaaS (Railway / Render / Fly / …)

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

## ۸) متغیرهای محیطی مهم

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

## ۹) بعد از نصب — چک‌لیست

```bash
sudo pm2 status
sudo pm2 logs nobino-api --lines 40
curl -s "http://127.0.0.1:3100/api/health?db=1"
curl -s "https://example.com/api/health?db=1"
```

> اگر خودتان با کاربر `root` کار می‌کنید، `sudo` لازم نیست.

- [ ] ورود مدیران با موبایل/رمز سوپرادمین در `https://<دامنه>` کار می‌کند
- [ ] از «تنظیمات سیستم» کلید پیامک، درگاه پرداخت و هوش مصنوعی را پر کرده‌اید
- [ ] رکورد DNS wildcard (`*.example.com`) به سرور اشاره می‌کند
- [ ] HTTPS فعال است و صفحهٔ یک سالن روی `https://<slug>.<دامنه>` باز می‌شود
      (`sudo bash /opt/nobino/deploy/ssl.sh --domain <دامنه> --email <ایمیل>`)
- [ ] آپلود تصویر/صدا ذخیره و نمایش داده می‌شود
- [ ] بکاپ روزانهٔ دیتابیس و `public/uploads` تنظیم شده است

---

## ۱۰) به‌روزرسانی، توقف و بکاپ

```bash
# به‌روزرسانی (pull + npm ci + بیلد + بکاپ + migrate + restart)
sudo bash /opt/nobino/deploy/update.sh

# بازگشت به نسخهٔ قبل
sudo bash /opt/nobino/deploy/update.sh --rollback --yes

# توقف سرویس
sudo pm2 stop nobino-api

# بکاپ دستی
pg_dump "$DATABASE_URL" | gzip > /backups/nobino-$(date +%F).sql.gz
rsync -a /opt/nobino/public/uploads/ /backups/uploads/
```

استقرار خودکار با `git push` هم پشتیبانی می‌شود:
[`docs/ops-console.md`](docs/ops-console.md).

---

## ۱۱) عیب‌یابی سریع

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

## ۱۲) ساختار پروژه

```
backend/        بک‌اند NestJS (routes، controllerها، lib)
frontend/       فرانت React/Vite (+ mini-app)
prisma/         schema، migrations، seed
scripts/        شروع/بیلد/بکاپ/ASR/ساخت ادمین
deploy/         نصب، به‌روزرسانی، PM2، قالب env
deploy/ssl.sh   دریافت گواهی Let's Encrypt و فعال‌سازی HTTPS
deploy/nginx/   قالب vhost دامنه + wildcard و بلوک TLS
docs/           مستندات فنی و استقرار
install.sh      نصب‌کنندهٔ تک‌خطی (این مخزن را روی VPS نصب می‌کند)
```

## مستندات بیشتر

- استقرار و سرور: [`docs/deploy.md`](docs/deploy.md)
- کنسول عملیات و استقرار با git push: [`docs/ops-console.md`](docs/ops-console.md)
- پشتیبان‌گیری و بازگردانی: [`docs/backups.md`](docs/backups.md)
- مدل محلی گفتار: [`docs/asr-local.md`](docs/asr-local.md)
- API موبایل و مینی‌اپ: [`docs/mobile-api.md`](docs/mobile-api.md) و [`docs/miniapp.md`](docs/miniapp.md)
