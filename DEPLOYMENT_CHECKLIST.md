# چک‌لیست استرار پروداکشن نوبینو

## ⚠️ وضعیت فعلی: **آماده توسعه، نه پروداکشن**

### نکته مهم:
پروژه از نظر فنی **عالی و استاندارد** است، اما قبل از رفتن به سرور واقعی و مشتریان واقعی، تنظیمات امنیتی و سرویس‌ها باید آپدیت شوند.

---

## مراحل قبل از استقرار واقعی

### ۱. امنیت (حتمی - اولویت بالا)

#### فوری:
- [ ] **JWT_SECRET**: `openssl rand -base64 32` را اجرا کنید و مقدار جدید را در `.env` بگذارید
  ```bash
  # مثال: JWT_SECRET="a8f3e2b1c6d5e4f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3"
  ```
  
- [ ] **POSTGRES_PASSWORD**: اگر از Docker استفاده می‌کنید، در `docker-compose.yml` تغییر دهید
- [ ] **CRON_SECRET**: مقدار قوی تصادفی بگذارید (جدای از JWT_SECRET)
- [ ] **NODE_ENV**: از `"development"` به `"production"` تغییر دهید

#### جزئی:
- [ ] `APP_URL` و `SITE_URL` را به دامنه واقعی (مثلاً `https://nobino.ir`) تغییر دهید
- [ ] `ROOT_DOMAIN` را به دامنه ریشه (مثلاً `nobino.ir`) تغییر دهید
- [ ] `PAYMENT_CALLBACK_BASE` را به `https://yourdomain.com/api/payments/callback` تغییر دهید

---

### ۲. دیتابیس

- [ ] DATABASE_URL را به دیتابیس تولیدی تغییر دهید
- [ ] از PostgreSQL 16+ استفاده کنید
- [ ] پشتیبان‌گیری از SSL (`?sslmode=require`) را در connection string اضافه کنید
- [ ] دسترسی‌ها را محدود کنید (به جای `0.0.0.0` از IP مشخص استفاده کنید)

---

### ۳. دامنه و DNS

#### الزامی:
- [ ] دامنه واقعی خود را ثبت کنید (مثلاً `nobino.ir`)
- [ ] رکورد A یا CNAME به IP سرور اضافه کنید
- [ ] **رکورد wildcard** `*.yourdomain.com` را تنظیم کنید (برای ساب‌دامین‌های سالن‌ها)

#### تست:
```bash
# پس از تنظیم DNS، بررسی کنید:
dig +short yourdomain.com        # باید IP سرور را بگیرید
dig +short test.yourdomain.com   # باید همان IP را بگیرید
```

---

### ۴. درگاه‌های پرداخت

#### قبل از شروع:
⚠️ همه درگاه‌ها روی حالت **sandbox** هستند. قبل از deploy واقعی حتماً `SANDBOX="false"` کنید.

#### پیشنهادی (یکی را انتخاب کنید):

**گزینه ۱ - زرین‌پال (پرکاربردترین):**
```env
ZARINPAL_MERCHANT_ID="your-merchant-id"
ZARINPAL_SANDBOX="false"  # بعد از تست واقعی
```

**گزینه ۲ - ملت (بانک‌های دولتی):**
```env
MELLAT_TERMINAL_ID="your-terminal-id"
MELLAT_USERNAME="your-username"
MELLAT_PASSWORD="your-password"
MELLAT_SANDBOX="false"
```

**گزینه ۳ - پاسارگاد (سریع‌ترین):**
```env
PASARGAD_TERMINAL_ID="your-terminal-id"
PASARGAD_USERNAME="your-username"
PASARGAD_PASSWORD="your-password"
PASARGAD_SHA_KEY="your-sha-key"
PASARGAD_SANDBOX="false"
```

---

### ۵. SMS (برای یادآوری نوبت)

#### اجباری اگر می‌خواهید پیامک بفرستید:
- [ ] یکی از سرویس‌های زیر را انتخاب کنید:
  - کاوه‌نگار (پرکاربردترین)
  - اس ام اس.آی‌آر
  - فراز اس ام اس (Ippanel)
  - قاصدک
  - یا سایر سرویس‌ها

**مثال - کاوه‌نگار:**
```env
SMS_PROVIDER="kavenegar"
KAVENEGAR_API_KEY="your-api-key-from-kavenegar"
```

#### نکته:
سرویس **mock** فقط لاگ می‌نویسد و پیامک واقعی نمی‌فرستد. روی production باید تغییر دهید.

---

### ۶. صدا هوشمند (اختیاری)

اگر می‌خواهید از قابلیت رزرو تلفنی استفاده کنید:

**گزینهٔ الف — مدل محلی و رایگان (پیشنهادی، بدون کار دستی):**

مدل و ffmpeg خودکار آماده می‌شوند (در داکر: اولین بوت در volume `asr_models`؛
بدون داکر: `npm start` در پس‌زمینه). برای بررسی/عیب‌یابی:

```bash
npm run asr:check    # مدل + ffmpeg + sherpa-onnx-node
```

ترتیب STT پیش‌فرض با `local` شروع می‌شود. جزئیات:
[`docs/asr-local.md`](docs/asr-local.md)

**گزینهٔ ب — سرویس ابری (OpenAI Whisper):**

- [ ] OpenAI API Key داشته باشید
- [ ] مقادیر زیر را در `.env` بگذارید:

```env
VOICE_PROVIDER="openai"
OPENAI_API_KEY="sk-..."
OPENAI_MODEL="whisper-1"
```

---

### ۷. آپلودها (گالری و صداها)

#### گزینه ۱ - ذخیره در دیسک (ساده‌ترین برای شروع):
```yaml
# در docker-compose.yml حتماً volume بگذارید:
volumes:
  - uploads:/app/public/uploads
  - voice:/app/public/voice
```
⚠️ در غیر این صورت با هر restart فایل‌ها پاک می‌شوند.

#### گزینه ۲ - ذخیره در ابر (بهتر برای استقرارهای بزرگ):
```env
BLOB_READ_WRITE_TOKEN="your-vercel-blob-token"
BLOB_STORE_ID="your-store-id"
```

---

### ۸. تست‌های ضروری قبل از deploy

#### قبل از هر کار:
```bash
# بررسی متغیرهای امنیتی
grep -E "(JWT_SECRET|POSTGRES|CHANGE_ME)" .env

# بیلد کنید
npm run build:release

# تست کنید (با دیتابیس لوکال)
docker compose exec app npm run test:smoke
```

#### تست نهایی:
- [ ] ورود با شماره و OTP کار کند
- [ ] ثبت سالن جدید کار کند
- [ ] نوبت‌دهی و ارسال پیامک یادآوری کار کند
- [ ] پرداخت تستی (sandbox) انجام شود
- [ ] آپلود تصویر و صدا ذخیره شود
- [ ] صفحه‌های سالن روی ساب‌دامین باز شوند (مثلاً `test.yourdomain.com`)

---

### ۹. استقرار

#### روش ۱ - Docker (سریع‌ترین):
```bash
# روی سرور:
cp deploy/env.production.example .env
# متغیرها را پر کنید
docker compose up -d --build
docker compose logs -f app
```

#### روش ۲ - VPS با Bootstrap (کامل‌ترین):
```bash
# روی سرور خام (Ubuntu/Debian):
git clone <repo> /opt/nobino
cd /opt/nobino
sudo bash deploy/bootstrap.sh --domain yourdomain.com
```

#### روش ۳ - PaaS (Railway/Render):
```yaml
# Build command:
npm ci && npm run build:release

# Start command:
npm start

# Port: 3100 (خودش از env می‌خواند)
```

---

### ۱۰. پس از deploy

#### فوری:
```bash
# وضعیت سلامت بررسی کنید:
curl https://yourdomain.com/api/health?db=1

# لاگ‌ها را نگاه کنید:
pm2 logs nobino-api --lines 100
```

#### تست‌های نهایی:
```bash
# پیامک تستی:
curl -X POST https://yourdomain.com/api/admin/sms/test \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"provider":"kavenegar","phone":"09120000000","message":"Test"}'

# پرداخت تستی (sandbox):
curl https://yourdomain.com/api/payments/mock-pay
```

---

### ۱۱. سؤالات مهم قبل از deploy

- [ ] آیا برای دیتابیس **پشتیبان‌گیری روزانه** برنامه‌ریزی شده؟
- [ ] آیا برای آپلودها **پشتیبان‌گیری جداگانه** دارید؟
- [ ] آیا برای **SSL/HTTPS** (Let's Encrypt) برنامه دارید؟
- [ ] آیا **Rate Limiting** را تنظیم کرده‌اید؟
- [ ] آیا **WAF** (مثل Cloudflare) را فعال می‌کنید؟
- [ ] آیا **سرویس مانیتورینگ** (مثل UptimeRobot) دارید؟
- [ ] آیا **اپ‌دیت خودکار** دارید (`sudo apt upgrade -y` روزانه)؟

---

## نتیجه نهایی

| جنبه | وضعیت فعلی | پس از تنظیم |
|------|-----------|------------|
| کد و ساختار | ✅ عالی | ✅ عالی |
| امنیت | ⚠️ توسعه | ✅ قوی |
| دیتابیس | ✅ کامل | ✅ کامل |
| درگاه پرداخت | ⚠️ Sandbox | ✅ واقعی |
| SMS | ⚠️ Mock | ✅ واقعی |
| استقرار | ✅ اسکریپت‌ها آماده | ✅ اجرا شود |

---

## پیشنهاد نهایی

پروژه **فوق‌العاده کامل** است و می‌تواند هزاران مشتری واقعی را مدیریت کند.

**ولی قبل از deploy واقعی:**
1. تنظیمات امنیتی را دقیق انجام دهید (JWT, DB, CRON)
2. درگاه پرداخت را روی sandbox تست کنید
3. پیامک را با چند شماره واقعی تست کنید
4. پشتیبان‌گیری را قبل از اولین مشتری راه اندازی کنید
5. در یک محیط تست (staging) ۲-۳ روز کامل تست کنید

**اگر این مراحل را انجام دهید، پروژه کاملاً برای هزاران مشتری واقعی آماده است.**

