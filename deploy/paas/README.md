# deploy/paas

چیزی در این پوشه نیست، و این عمدی است: نسخهٔ NestJS روی هر پلتفرم Heroku-مانند
با همان دو فایل ریشهٔ مخزن بالا می‌آید، پس manifest اختصاصی‌ای برای نوشتن نمی‌ماند.

- `Procfile` (ریشه) → `web: node scripts/paas-start.mjs`
- `Dockerfile` (ریشه) → `CMD ["node", "scripts/paas-start.mjs"]`
- فایل‌هایی مثل `render.yaml`، `railway.json` یا manifest پلتفرم‌های ایرانی هم
  لازم نیستند: تنها ورودی پلتفرم متغیرهای محیطی‌اند (`DATABASE_URL`,
  `JWT_SECRET`, `CRON_SECRET`, `SITE_URL`, `ROOT_DOMAIN`) که در
  `deploy/env.production.example` با توضیح فارسی فهرست شده‌اند. `PORT` را
  خودِ پلتفرم می‌دهد و `scripts/paas-start.mjs` همان را می‌خواند.

اگر روزی پلتفرمی manifest اختصاصی خواست (مثلاً `vercel.json` با rewrite برای
SPA)، فایلش را همین‌جا بگذارید و ردیفش را به جدول فایل‌های `docs/deploy.md`
اضافه کنید.
