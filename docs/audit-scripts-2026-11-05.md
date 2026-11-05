# ممیزی سخت‌گیرانهٔ لایهٔ اسکریپت — 2026-11-05

**محدوده:** `scripts/*.mjs`، `scripts/*.test.mjs`، `deploy/*.sh`، `backend/scripts/*.mjs`، `frontend/scripts/*.mjs`، `frontend/prerender.mjs`، `prisma/seed.mjs`، و اسکریپت‌های رهاشده در `logs/` و ریشهٔ مخزن.

**وضعیت: فقط مستند.** در این جلسه هیچ فایل کدی تعمیر نشد. هیچ باگی در این گزارش «رفع‌شده» نیست. «پیشنهاد»ها صرفاً جهت تصمیم‌گیری‌اند.

---

## ۱) نتیجه در یک نگاه

**36 finding**: ۳ بحرانی، ۱۰ بالا، ۱۴ متوسط، ۶ پایین، ۳ بهداشتی. (۴ موردِ اخیر از رندِ تست‌های seed اضافه شد: ME-13، ME-14، HG-3 و گسترش CR-3.)

سه چیزی که همین حالا در پروداکشن ضربه می‌زند:

1. **هر بار که سرویس بالا می‌آید، `sitemap.xml` و `robots.txt` از `frontend/dist` پاک می‌شوند** و canonical/og نسبی می‌شوند. دلیل: `paas-start.mjs` و `build-release.mjs` مبنای سئو را **فقط از `process.env`** می‌خوانند، در حالی که `VITE_SITE_URL` فقط در `.env` است. (CR-1)
2. **قالب `.env` با دامنه/مسیر نامتعارف خراب یا کاملاً خالی نوشته می‌شود** و چون `>` فایل را قبل از خطای `sed` خالی کرده، اجرای بعدی bootstrap می‌گوید «`.env` از قبل وجود دارد؛ دست نمی‌زنیم». (HI-7)
3. **استقرار «موفق» گزارش می‌شود بدون اینکه ثابت شود سرویس بالا آمده** — health فقط `warn` می‌دهد و `update.sh` با کد ۰ خارج می‌شود؛ در تست من سلامتِ نسخهٔ خراب را یک پروسهٔ *دیگر* روی همان پورت تأیید کرد. (HI-3)

---

## ۲) روش

- ایستاخوانی کامل ۲۲ اسکریپت (زیر) + `prisma/seed.mjs` + ۱۷ فایل `logs/*.mjs`.
- **تست داینامیک در سندباکس**: clone/کپی مخزن در پوشهٔ موقت، `pg_dump`/`pg_restore`/`psql`/`systemctl`/`ufw`/`nginx`/`pm2`/`apt-get` با stubهای ساختگی جای‌گزین شدند تا مسیرهای واقعی (نه `--dry-run`) اجرا شوند؛ خروجی‌های زیر عیناً از این اجراهاست.
- مانیفست/تولیدکده: خروجی `gen-controllers.mjs` و `prerender.mjs` بایت‌به‌بایت diff شد.
- «اثبات‌شده» = خروجی اجرا دارد. «کدخوانی» = منطق روشن است ولی اجرای کاملش در سندباکس ممکن نبود (علامت‌دار).

فایل‌های تحت ممیزی (تعداد خط): `build-release.mjs` 284 · `paas-start.mjs` 179 · `create-admin.mjs` 133 · `dev-start.mjs`/`dev-stop.mjs` · `seed-demo.mjs` 647 · `seed-real.mjs` 1281 · `seed-stress.mjs` 544 · `backups.test.mjs` 403 · `deploy-update.test.mjs` 373 · `smoke.test.mjs` 409 · `wiring.test.mjs` 194 · `seo.test.mjs` 147 · `links.test.mjs` 139 · `bootstrap.sh` 327 · `install.sh` 350 · `update.sh` 256 · `gen-controllers.mjs` 164 · `port-routes.mjs` 95 · `port-pages.mjs` 41 · `vite-build.mjs` 26 · `prerender.mjs` 253.

---

## ۳) جدول فهرست

| ID | شدت | محل | خلاصه |
|---|---|---|---|
| CR-1 | بحرانی | [scripts/paas-start.mjs:172](file:///C:/laragon/www/Nobino-nest/scripts/paas-start.mjs#L172) + [scripts/build-release.mjs:160](file:///C:/laragon/www/Nobino-nest/scripts/build-release.mjs#L160) | مبنا لوکال → حذف sitemap/robots در هر بوت/بیلد |
| CR-2 | بحرانی | [deploy/update.sh:137](file:///C:/laragon/www/Nobino-nest/deploy/update.sh#L137) | `pg_restore` بدون `--exit-on-error`؛ بازگردانی نصفه = «موفق» |
| CR-3 | بحرانی | [scripts/seed-real.mjs:335](file:///C:/laragon/www/Nobino-nest/scripts/seed-real.mjs#L335) · [scripts/seed-demo.mjs:210](file:///C:/laragon/www/Nobino-nest/scripts/seed-demo.mjs#L210) | شرط‌های حذفِ گسترده، دادهٔ واقعی را می‌بَرَد |
| HI-1 | بالا | [deploy/update.sh:90](file:///C:/laragon/www/Nobino-nest/deploy/update.sh#L90) · [:137](file:///C:/laragon/www/Nobino-nest/deploy/update.sh#L137) [:197](file:///C:/laragon/www/Nobino-nest/deploy/update.sh#L197) | رمز DB در argv/خروجی؛ ماسک فقط در dry-run |
| HI-2 | بالا | [deploy/update.sh:140](file:///C:/laragon/www/Nobino-nest/deploy/update.sh#L140) | rollback → detached HEAD → استقرار بعدی می‌میرد |
| HI-3 | بالا | [deploy/update.sh:246](file:///C:/laragon/www/Nobino-nest/deploy/update.sh#L246) · [deploy/install.sh:333](file:///C:/laragon/www/Nobino-nest/deploy/install.sh#L333) | استقرار موفق بدون اثبات بوت |
| HI-4 | بالا | [scripts/build-release.mjs:262](file:///C:/laragon/www/Nobino-nest/scripts/build-release.mjs#L262) | DB پایین → smoke رد، `ok("release آماده است")`، exit 0 |
| HI-5 | بالا | [deploy/install.sh:203](file:///C:/laragon/www/Nobino-nest/deploy/install.sh#L203) | `--dry-run` همیشه می‌میرد؛ پیش‌آزمون روی سرور خام ممکن نیست |
| HI-6 | بالا | [deploy/bootstrap.sh:214](file:///C:/laragon/www/Nobino-nest/deploy/bootstrap.sh#L214) | dry-run قبل از بررسی dry، تعاملی `read` می‌کند |
| HI-7 | بالا | [deploy/bootstrap.sh:222-236](file:///C:/laragon/www/Nobino-nest/deploy/bootstrap.sh#L222) | `&` و `|` در دامنه → `.env` خراب/خالی و قفل‌شده |
| HI-8 | بالا | [deploy/bootstrap.sh:80](file:///C:/laragon/www/Nobino-nest/deploy/bootstrap.sh#L80) | `rand_secret` با `|| true` مقدار خالی می‌دهد و گیت `CHANGE_ME` رد می‌شود |
| HI-9 | بالا | [scripts/seed-stress.mjs](file:///C:/laragon/www/Nobino-nest/scripts/seed-stress.mjs) | بدون هیچ گارد پروداکشن؛ `--clean-settings` حذف بدون تأیید |
| HI-10 | بالا | [deploy/install.sh:304](file:///C:/laragon/www/Nobino-nest/deploy/install.sh#L304) | بازنویستی vhost قبل از `nginx -t`؛ نسخهٔ قبلی قابل بازگردانی نیست |
| ME-1 | متوسط | [scripts/build-release.mjs:29](file:///C:/laragon/www/Nobino-nest/scripts/build-release.mjs#L29) | پرچم ناشناخته بی‌صدا نادیده (تایپ غلط = `npm install` کامل) |
| ME-2 | متوسط | [scripts/build-release.mjs:35](file:///C:/laragon/www/Nobino-nest/scripts/build-release.mjs#L35) | `SMOKE_PORT=abc` → پورت `NaN` و ۳۰ ثانیه انتظار |
| ME-3 | متوسط | [scripts/create-admin.mjs:102](file:///C:/laragon/www/Nobino-nest/scripts/create-admin.mjs#L102) | `--force-reset` با شمارهٔ نادرست = no-op با exit 0 |
| ME-4 | متوسط | [scripts/create-admin.mjs:76](file:///C:/laragon/www/Nobino-nest/scripts/create-admin.mjs#L76) | ردِّ فرمت‌هایی که خود اپ می‌پذیرد؛ رقم فارسی → پیام تهی |
| ME-5 | متوسط | [deploy/install.sh:57](file:///C:/laragon/www/Nobino-nest/deploy/install.sh#L57) · [deploy/bootstrap.sh:59](file:///C:/laragon/www/Nobino-nest/deploy/bootstrap.sh#L59) | `$2: unbound variable`؛ update.sh درست اعتبارسنجی می‌کند |
| ME-6 | متوسط | [deploy/install.sh:67](file:///C:/laragon/www/Nobino-nest/deploy/install.sh#L67) · [deploy/bootstrap.sh:70](file:///C:/laragon/www/Nobino-nest/deploy/bootstrap.sh#L70) | `--help` کد اسکریپت را چاپ می‌کند |
| ME-7 | متوسط | [scripts/dev-start.mjs:70](file:///C:/laragon/www/Nobino-nest/scripts/dev-start.mjs#L70) | `shell:true` با مسیر مطلق + ق `.dev.pids` بی‌اعتبار + موفقیت کاذب |
| ME-8 | متوسط | [scripts/paas-start.mjs:85-109](file:///C:/laragon/www/Nobino-nest/scripts/paas-start.mjs#L85) | `db push` در هر بوت؛ شکست‌ها فقط `warn` |
| ME-9 | متوسط | [scripts/backups.test.mjs:20](file:///C:/laragon/www/Nobino-nest/scripts/backups.test.mjs#L20) · [scripts/smoke.test.mjs:24](file:///C:/laragon/www/Nobino-nest/scripts/smoke.test.mjs#L24) | `npm test` سبز با دسته‌های skip‌شده |
| ME-10 | متوسط | [backend/scripts/gen-controllers.mjs:88](file:///C:/laragon/www/Nobino-nest/backend/scripts/gen-controllers.mjs#L88) · [backend/scripts/port-routes.mjs:43](file:///C:/laragon/www/Nobino-nest/backend/scripts/port-routes.mjs#L43) · [frontend/scripts/port-pages.mjs:37](file:///C:/laragon/www/Nobino-nest/frontend/scripts/port-pages.mjs#L37) | کنترلر بی‌یتیم/اسکریپت‌های مردهٔ ENOENT |
| ME-11 | متوسط | [frontend/prerender.mjs:211](file:///C:/laragon/www/Nobino-nest/frontend/prerender.mjs#L211) + [scripts/paas-start.mjs:171](file:///C:/laragon/www/Nobino-nest/scripts/paas-start.mjs#L171) | خروج ۰ بدون صفحه + `stdio:"ignore"` = هشدارها گم می‌شوند |
| ME-12 | متوسط | [scripts/seed-real.mjs:31](file:///C:/laragon/www/Nobino-nest/scripts/seed-real.mjs#L31) | گارد پروداکشن حساس به بزرگی/کوچکی (با بقیه ناسازگار) |
| ME-13 | متوسط | [scripts/seed-real.mjs:23](file:///C:/laragon/www/Nobino-nest/scripts/seed-real.mjs#L23) · [scripts/seed-demo.mjs:18](file:///C:/laragon/www/Nobino-nest/scripts/seed-demo.mjs#L18) | `new PrismaClient()` قبل از گارد پروداکشن (اتصال زودهنگام) |
| ME-14 | متوسط | [scripts/seed-real.mjs:26-28](file:///C:/laragon/www/Nobino-nest/scripts/seed-real.mjs#L26) · [scripts/seed-stress.mjs:96](file:///C:/laragon/www/Nobino-nest/scripts/seed-stress.mjs#L96) | پرچم ناشناخته/تایپو = اجرای کامل پاک‌سازی+seed؛ `--help` ندارد |
| LO-1 | پایین | [frontend/prerender.mjs:216](file:///C:/laragon/www/Nobino-nest/frontend/prerender.mjs#L216) | `/login` در sitemap در حالی که `noindex` است |
| LO-2 | پایین | [frontend/prerender.mjs:181](file:///C:/laragon/www/Nobino-nest/frontend/prerender.mjs#L181) | fallback عمیق با canonical/noindex یکسان برای همهٔ مسیرها |
| LO-3 | پایین | [scripts/paas-start.mjs:140](file:///C:/laragon/www/Nobino-nest/scripts/paas-start.mjs#L140) | `process.exit(code ?? 0)` — کشته‌شده با سیگنال = خروج ۰ |
| LO-4 | پایین | [deploy/update.sh:125](file:///C:/laragon/www/Nobino-nest/deploy/update.sh#L125) | rollback با هر فایل untracked مسدود (از جمله `--backup-dir` داخل مخزن) |
| LO-5 | پایین | [backend/scripts/gen-controllers.mjs:115-135](file:///C:/laragon/www/Nobino-nest/backend/scripts/gen-controllers.mjs#L115) | ۵ ددلاین کران سخت‌کد؛ کران تازه در مانیفست بی‌صدا نادیده |
| LO-6 | پایین | [scripts/create-admin.mjs:64](file:///C:/laragon/www/Nobino-nest/scripts/create-admin.mjs#L64) · [:106](file:///C:/laragon/www/Nobino-nest/scripts/create-admin.mjs#L106) | خط چسبیده + `exit(0)` دور‌زدنِ `$disconnect` |
| HG-1 | بهداشت | `logs/*.mjs` (17 فایل) | ابزارهای یک‌بارمصرف زیر .gitignore — از دید Review پنهان |
| HG-2 | بهداشت | [deploy/bootstrap.sh:296](file:///C:/laragon/www/Nobino-nest/deploy/bootstrap.sh#L296) | رمز سوپرادمین روی argv (در `ps` دیده می‌شود) برخلاف راهنمای خود `create-admin.mjs` |

---

## ۴) بحرانی

### CR-1 — هر بوت/بیلد، sitemap و robots را از دیست پاک می‌کند

**محل:** [scripts/paas-start.mjs:156-172](file:///C:/laragon/www/Nobino-nest/scripts/paas-start.mjs#L156) · [scripts/build-release.mjs:159-164](file:///C:/laragon/www/Nobino-nest/scripts/build-release.mjs#L159) · [frontend/prerender.mjs:231-241](file:///C:/laragon/www/Nobino-nest/frontend/prerender.mjs#L231)

`paas-start.mjs` یک `fromEnvFile()` دارد که `.env.production` و `.env` را می‌خواند (خطوط 35-44) ولی آن را **فقط** برای هشدار `DATABASE_URL` به کار می‌گیرد (خط 52). بلوک prerender در خط 172 از `env` استفاده می‌کند که کپی `process.env` است (خط 31):

```js
env: { ...env, PRERENDER_API: env.PRERENDER_API || base, VITE_SITE_URL: env.VITE_SITE_URL || env.SITE_URL || base },
```

`base` برابر `http://127.0.0.1:${PORT}` است. زیر PM2/systemd هیچ‌کدام از `VITE_SITE_URL`/`SITE_URL` در محیط پروسه نیست (فقط در `.env` هستند — و `.env` در گیت‌ایگنور است و PM2 آن را export نمی‌کند)، پس مبنا لوکال می‌شود. `build-release.mjs:160` هم همین اشتقاق را دارد: برای `DATABASE_URL`/`JWT_SECRET` از `envValue()` (خط 76) که فایل env را می‌خواند استفاده می‌کند، ولی برای مبنا مستقیم `process.env`.

وقتی مبنا لوکال است، `prerender.mjs` هم canonical/og را نسبی می‌کند و **هم `sitemap.xml` و `robots.txt` موجود را `rmSync` می‌کند** (خط 234-238).

**بازتولید (سندباکس، با `.env` حاوی `VITE_SITE_URL="https://nobino.ir"`):**
```bash
node scripts/paas-start.mjs   # با wrapper که env فرزندِ prerender را ثبت می‌کرد
cat prerender-env.json
```
خروجی مشاهده‌شده:
```json
{"VITE_SITE_URL":"http://127.0.0.1:39124","SITE_URL":null,"PRERENDER_API":"http://127.0.0.1:39124"}
```
و در همان اجرا:
```
prerender: sitemap.xml کهنه از دیست حذف شد (مبنا لوکال است)
prerender: sitemap.xml/robots.txt نوشته نشد (مبنا لوکال) — با VITE_SITE_URL دوباره اجرا کنید.
```
نسخهٔ `build-release.mjs` هم `VITE_SITE_URL=undefined` چاپ کرد (case 6b).

**پیامد:** در هر `pm2 restart` (که `update.sh` خط 234 آن را صدا می‌زند) یا بوت کانتینر، فایل سئوی سایت ناپدید می‌شود و canonical همهٔ صفحات عمومی/سالن‌ها نسبی می‌شود. `robots.txt` نبودن = crawl نامحدودِ `/api/` و `/dashboard/` (قواعد Disallow دقیقاً در همان فایل از دست رفته بودند).

**پیشنهاد (اجرا نشده):** مبنا را با همان `envValue()` از فایل env بخوان؛ و `prerender.mjs` در حالت لوکال به‌جای حذف، فقط بنویسد و هشدار بدهد (یا `--keep-crawlers`).

---

### CR-2 — rollback: بازگردانی نصفهٔ دیتابیس «موفق» اعلام می‌شود

**محل:** [deploy/update.sh:137-146](file:///C:/laragon/www/Nobino-nest/deploy/update.sh#L137)

```bash
run pg_restore --clean --if-exists --no-owner --no-privileges --dbname="${DB_DISPLAY:-...}" "$dump" \
  || die "pg_restore ناموفق بود؛ ادامه ندهید ..."
```

`--exit-on-error` و `--single-transaction` هیچ‌کدام نیستند. رفتار مستند PostgreSQL (از صفحهٔ رسمی `pg_restore`):

> «Exit if an error is encountered while sending SQL commands to the database. The default is to continue and to display a count of errors at the end of the restoration.»

یعنی اگر هر آبجکتی (sequence، FK، index، trigger) خطا بدهد، `pg_restore` با کد ۰ خارج می‌شود. اسکریپت بعدش `git checkout "$commit"` (خط 140) را اجرا و در خط 146 می‌گوید «دیتابیس و کد به قبل از آخرین ارتقا برگشت» و **همان نسخه را دوباره build و restart می‌کند**.

**چرا بحرانی:** مسیر rollback تنها راه بازگشت داده است و دقیق‌ترین لحظه را با نتیجهٔ نیمه‌کاره و پیام موفقیت تمام می‌کند (مثلاً `--clean` جدول‌ها را می‌اندازد و بعد از خطای first-failure بقیه INSERT اجرا نمی‌شوند، ولی اسکریپت با همان فرض «بازگشت موفق» ادامه می‌دهد).

**پیشنهاد:** `--exit-on-error --single-transaction` + شمارش خطاهای stderr + تأیید صریح (`--yes`) قبل از `git checkout`.

---

### CR-3 — seedها با شرط‌های گسترده، دادهٔ واقعی را حذف می‌کنند

**محل:** [scripts/seed-real.mjs:275](file:///C:/laragon/www/Nobino-nest/scripts/seed-real.mjs#L275) · [:330](file:///C:/laragon/www/Nobino-nest/scripts/seed-real.mjs#L330) · [:335-342](file:///C:/laragon/www/Nobino-nest/scripts/seed-real.mjs#L335) · [:1223](file:///C:/laragon/www/Nobino-nest/scripts/seed-real.mjs#L1223) · [scripts/seed-demo.mjs:210](file:///C:/laragon/www/Nobino-nest/scripts/seed-demo.mjs#L210)

```js
await kill("discount", { OR: [{ code: { startsWith: "WELCOME" } }, { code: { contains: "stress", mode: "insensitive" } }] }, "Discount(تستی)");
await kill("supportTicket", { OR: [{ userId: { in: stressUserIds } }, { phone: { startsWith: "0999" } }, { phone: { startsWith: "0998" } }, { subject: { contains: "موضوع تیکت" } }] }, "SupportTicket");
```

- `code startsWith "WELCOME"`: هر کوپن واقعی که با WELCOME شروع شود (کمپین خوش‌آمدگویی) حذف می‌شود — ربطی به پیشوند `stress` ندارد.
- `giftCard`: ردیف‌ها با `code: { contains: "stress", mode: "insensitive" }` ([خط 334](file:///C:/laragon/www/Nobino-nest/scripts/seed-real.mjs#L334)) — کارت‌هدیهٔ واقعی که کدش این رشته را داشته باشد نابود می‌شود.
- `supportTicket` علاوه بر پیش‌شماره‌ها با `subject: { contains: "موضوع تیکت" }` هم مقایسه می‌شود (همان خط 336) — یک موضوع تیکتِ قالب‌ریخته/واقعی پاک می‌شود.
- `phone startsWith 0999 / 0998`: این‌ها پیش‌شمارهٔ واقعی موبایل ایران‌اند؛ هر **تیکت پشتیبانی** ([خط 336](file:///C:/laragon/www/Nobino-nest/scripts/seed-real.mjs#L336)) و هر **ردیف OTP** ([خط 342](file:///C:/laragon/www/Nobino-nest/scripts/seed-real.mjs#L342))ِ مشتری واقعی با آن پیش‌شماره پاک می‌شود.
- سالن‌ها با `slug startsWith "stress"` یا `name contains "استرس"` یا `city contains "تست"` شناسایی و `salon.deleteMany` می‌شوند ([خط 275](file:///C:/laragon/www/Nobino-nest/scripts/seed-real.mjs#L275) → [:330](file:///C:/laragon/www/Nobino-nest/scripts/seed-real.mjs#L330)) — یک سالن واقعی با نام/شهر شامل آن رشته‌ها حذف می‌شود.
- حلقهٔ `SELF_CLEAN` (خطوط 258-263 و 361) هر ردیفی در 28 جدول که `id` آن با `nr` شروع شود حذف می‌کند؛ اگر یکبار آن پیشوند با شناسهٔ واقعی برخورد کند، حذف انبوه بدون هشدار رخ می‌دهد.
- **گسترده‌ترین مورد**: [خط 285-296](file:///C:/laragon/www/Nobino-nest/scripts/seed-real.mjs#L285) فهرست `stressUsers` را با این OR می‌سازد: `phone startsWith "0999"/"0998"`، `email contains "stress"`، `name contains "استرس"` و **`{ role: "CUSTOMER", email: { endsWith: "@nobino.ir" } }`** — یعنی هر مشتری واقعی با ایمیل دامنهٔ اصلی. همان فهرست بعداً در خط 334 (GiftCard)، 336 (SupportTicket)، 337 (Transaction)، 338 (Payout)، 339 (Wallet)، 340 (Session) مصرف می‌شود. نتیجه روی دیتابیس واقعی: **صفر شدن موجودی کیف پول مشتریان، پاک شدن تاریخچهٔ تراکنش/برداشت و خروج همه از sessionها**.
- `recipient / actorPhone startsWith "099"`: [خط 341](file:///C:/laragon/www/Nobino-nest/scripts/seed-real.mjs#L341) `notification` را با `recipient: { startsWith: "099" }` و [خط 343](file:///C:/laragon/www/Nobino-nest/scripts/seed-real.mjs#L343) `auditLog` را با `actorPhone: { startsWith: "099" }` می‌بَرَد — کل زنجیرهٔ ممیزی و اطلاعیه‌های هر کاربری با پیش‌شمارهٔ 099 (بدون هیچ قید سالن/پیشوند تست).
- [scripts/seed-real.mjs:1223](file:///C:/laragon/www/Nobino-nest/scripts/seed-real.mjs#L1223): `prisma.wallet.deleteMany({ where: { ownerId: { in: ... } } })` بدون هیچ سقف/لاگِ قابل‌بازگشت.
- [scripts/seed-demo.mjs:210](file:///C:/laragon/www/Nobino-nest/scripts/seed-demo.mjs#L210): `staff.deleteMany({ where: { salonId, NOT: { id: { in: canonicalStaffIds } } } })` — اگر روی دیتابیس واقعی اجرا شود، **همهٔ پرسنلی که سالن‌دار از داشبورد اضافه کرده** در همان سالنِ DEMO_SALONS پاک می‌شود (توضیح کد می‌گوید «امن است چون نوبتی اشاره ندارد»؛ پرسنل بدون نوبتِ امروز هم پاک می‌شود).

گارد پروداکشن جلوی اجرای خودکار نمی‌گیرد، چون: (الف) `scripts/seed-stress.mjs` اصلاً گارد ندارد (HI-9)، (ب) `ALLOW_PROD_SEED=1` در bootstrap/paas-start از راه `AUTO_SEED` قابل روشن شدن است، (ج) در محیط استیجینگِ متصل به دادهٔ نیمه‌واقعی، گاردی وجود ندارد.

**پیشنهاد:** حذف‌ها را به کلید/پیشوند اختصاصی `nr`/`stress-` محدود کنید (`code: { startsWith: "stress-" }`) و برای هر `deleteMany` یک `--i-know-what-im-deleting` بخواهید.

---

## ۵) بالا (HIGH)

### HI-1 — رمز دیتابیس در اجرای واقعی، بدون ماسک، روی خط فرمان

**محل:** [deploy/update.sh:88-91](file:///C:/laragon/www/Nobino-nest/deploy/update.sh#L88) · [:137](file:///C:/laragon/www/Nobino-nest/deploy/update.sh#L137) · [:197](file:///C:/laragon/www/Nobino-nest/deploy/update.sh#L197)

```bash
DB_DISPLAY="$DB_TARGET"
if $DRY_RUN; then DB_DISPLAY="$(mask_url "$DB_TARGET")"; fi
```

ماسک **فقط** در dry-run اعمال می‌شود؛ در اجرای واقعی `--dbname=postgresql://user:PASS@host/db` به argv پروسهٔ فرزند داده می‌شود. هر کسی با `ps auxe` (یا لاگ ابزارهای مانیتورینگ، یا `set -x`) رمز را می‌بیند. libpq خودش `PGPASSFILE`/`~/.pgpass` یا متغیر `PGPASSWORD` را می‌پذیرد؛ نیازی به عبور رمز در argv نیست.

**خروجی اثبات‌شده (stub سندباکس، اجرای واقعی):**
```
[stub pg_restore] ... --dbname=postgresql://nobino:S3cr3tPass@localhost:5432/nobino ...
```

**بازتولید:** `bash deploy/update.sh --rollback=/path/to.dump --yes` با `DATABASE_URL` دارای رمز (در سندباکس من با stub). صحتِ مثبت: در `--dry-run` شمارتوکن رمز در خروجی `grep -c S3cr3t` = **0** بود.

### HI-2 — rollback مخزن را روی detached HEAD می‌گذارد و استقرار بعدی را می‌کُشد

**محل:** [deploy/update.sh:140](file:///C:/laragon/www/Nobino-nest/deploy/update.sh#L140) (`git checkout "$commit"`) و [:154-158](file:///C:/laragon/www/Nobino-nest/deploy/update.sh#L154) (`git pull --ff-only`)

`git checkout <sha>` شاخه را ترک می‌کند. در همان اجرا `DO_PULL=false` (خط 144) تنظیم می‌شود، اما اجرای **بعدی** `update.sh` با `$DO_PULL=true` به `git pull` می‌رسد روی HEAD جداافتاده.

**بازتولید (سندباکس):** `update.sh --rollback --yes` (موفق) ← سپس `update.sh --yes`:
```
— git pull (HEAD) —
error: You are not currently on a branch.
EXIT=1
```
**پیامد:** اپراتور بعد از یک فاجعه، بار دوم هم شکست می‌خورد و باید دستی `git checkout master` بزند؛ پیام خطا به او نمی‌گوید چرا.

### HI-3 — استقرار موفق بدون اثبات بالا آمدن سرویس

**محل:** [deploy/update.sh:244-252](file:///C:/laragon/www/Nobino-nest/deploy/update.sh#L244) · [deploy/install.sh:325-333](file:///C:/laragon/www/Nobino-nest/deploy/install.sh#L325)

```bash
sleep 3
if H="$(curl -fsS --max-time 12 "http://127.0.0.1:$PORT/api/health?db=1" ...)"; then ok "سرور سالم است"; else warn "سلامت تأیید نشد ..."; fi
```

سه ایراد: (۱) شکستِ سلامت فقط `warn` است و اسکریپت با کد ۰ تمام می‌شود؛ (۲) `sleep 3` یک‌بار است، در حالی که بوت با `prisma generate`/migrate می‌تواند ده‌ها ثانیه طول بکشد؛ (۳) پروب روی `127.0.0.1:$PORT` نمی‌تواند پروسهٔ deployments‌شده را از **هر پروسهٔ دیگری که روی همان پورت گوش می‌دهد** تشخیص دهد.

**اثبات (۳) در سندباکس:** health probe پاسخ ۲۰۰ گرفت، در حالی که پاسخ از اپ زندهٔ نشستِ دیگر روی :3100 می‌آمد، نه از پروسه‌ای که همین الان build و restart شده بود.

**پیشنهاد:** PID/`pm2 describe` را با listen owner تطبیق بدهید؛ چرخه‌ی retry با deadline و `exit 1` در شکست.

### HI-4 — `install.sh --dry-run` همیشه می‌میرد

**محل:** [deploy/install.sh:203-204](file:///C:/laragon/www/Nobino-nest/deploy/install.sh#L203)

```bash
[[ -f "$APP_DIR/backend/dist/main.js" ]] || die "backend/dist/main.js نیست؛ بدون --skip-build اجرا کنید."
[[ -f "$APP_DIR/frontend/dist/index.html" ]] || die "frontend/dist/index.html نیست؛ بیلد فرانت انجام نشده."
```

این دو بررسی بیرون از هر شاخهٔ `$DRY_RUN`/`--skip-build` هستند. روی سرور تازه‌کلون‌شده `dist/` در گیت نیست (gitignore) → `--dry-run` و `--skip-build` **هر دو** تقریباً همیشه در همان لحظه می‌میرند، دقیقاً همان مسیری که برای «پیش‌آزمون بدون تغییر سرور» طراحی شده بود.

**بازتولید:** `bash deploy/install.sh --dry-run` روی کپی تمیز مخزن → `❌ backend/dist/main.js نیست...` با `EXIT=1`.

**پیشنهاد:** `if ! $DRY_RUN && ! $SKIP_BUILD; then ... fi`.

### HI-5 — `bootstrap.sh --dry-run` روی سرور دارای Postgres، تعاملی می‌شود و می‌میرد

**محل:** [deploy/bootstrap.sh:210-219](file:///C:/laragon/www/Nobino-nest/deploy/bootstrap.sh#L210)

```bash
  else
    printf '  DATABASE_URL موجود این سرور را وارد کنید: '
    read -r DBURL_IN || true
    DBURL="${DBURL_IN:-}"
    [[ -n "$DBURL" ]] || die "  برای Postgres موجود سرور باید DATABASE_URL داده شود ..."
  fi
  if $DRY_RUN; then
```

وقتی `pg_isready` موفق باشد (خط 160) `PG_MODE=external` می‌شود و `read` **قبل از** شاخهٔ `DRY_RUN` اجرا می‌شود. هیچ `--database-url` پرچمی هم وجود ندارد. در نتیجه dry-run در CI/پایپ یا `curl | bash` (stdin غیرتعاملی) در همین‌جا می‌شکند.

**بازتولید (سندباکس با pg_isready جعلیِ موفق):**
```bash
bash deploy/bootstrap.sh --dry-run --domain nobino.ir < /dev/null
# → «DATABASE_URL موجود این سرور را وارد کنید: » سپس ❌ ... با EXIT=1
```

### HI-7 — `.env` با دامنه/مسیر نامتعارف خراب یا خالی نوشته می‌شود، و بعد قفل می‌شود

**محل:** [deploy/bootstrap.sh:222-236](file:///C:/laragon/www/Nobino-nest/deploy/bootstrap.sh#L222)

رشته‌های `sed -e "s|^SITE_URL=.*|SITE_URL=\"https://$DOMAIN\"|"` بدون هیچ escape روی `&`، `\` و جداکنندهٔ `|`. دو حالت اثبات‌شده:

1. `&` در مقدار (هر `&` به متنِ تطبیق‌شده گسترش می‌یابد):
```
--domain 'a&b.ir'  →  SITE_URL="https://aSITE_URL="https://nobino.ir"b.ir"
```
(خروجی واقعی سندباکس؛ خط `.env` عملاً پارس‌ناپذیر می‌شود.)
2. `|` در مقدار → `sed: unknown option to 's'` و چون `sed ... > "$ENVF"` فایل را **قبل از** اجرای خطا truncate کرده، `.env` صفر بایت باقی می‌ماند:
```
out-bytes=0
```
اجرای بعدی bootstrap: «`.env` از قبل وجود دارد؛ دست نمی‌زنیم.» (خط 202-203) → نصب با فایل خالی پیش می‌رود و کاربر نمی‌فهمد چرا اپ بالا نمی‌آید.

همین الگو برای `DBURL` (که از stdin خوانده می‌شود و می‌تواند `|`/`&` داشته باشد)، `PG_PASSWORD` و `APP_DIR` نیز برقرار است.

**پیشنهاد:** `awk -v` یا `printf`/`cat` با heredoc و escape، یا `sed` با جداکنندهٔ کنترل‌شده؛ نوشتن به فایل موقت و `mv` اتمیک.

### HI-8 — رمزهای تصادفی می‌توانند خالی بنویسند و گیت `CHANGE_ME` رد شوند

**محل:** [deploy/bootstrap.sh:80-82](file:///C:/laragon/www/Nobino-nest/deploy/bootstrap.sh#L80) · [:210](file:///C:/laragon/www/Nobino-nest/deploy/bootstrap.sh#L210) · [:238](file:///C:/laragon/www/Nobino-nest/deploy/bootstrap.sh#L238)

```bash
rand_secret() { openssl rand -hex 32 2>/dev/null || { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; } || true; }
rand_pg()     { { tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 24; } || true; }
```

`|| true` در انتها یعنی **شکست هر دو مسیر، مقدار تهی برمی‌گرداند و وضعیت خروج ۰ است**. بعد `sed` با جایگزینی خالی، توکن `CHANGE_ME` را پاک می‌کند، پس `grep -q CHANGE_ME || die` خطا نمی‌دهد و اسکریپت ادامه می‌دهد با `JWT_SECRET=""`، `CRON_SECRET=""` و `PG_PASSWORD=""`.

**اثبات (کپی همان تابع در سندباکس با PATH شکسته):**
```
JWT=[] len=0
no CHANGE_ME -> passes gate with empty secret
```
روی `JWT_SECRET=""` خودِ اپ با `z.string().min(16)` در [backend/src/lib/env.ts:37](file:///C:/laragon/www/Nobino-nest/backend/src/lib/env.ts#L37) می‌کِشد (default فقط برای `undefined` اعمال می‌شود)؛ یعنی bootstrap «آماده» گزارش می‌کند و سرویس crash-loop می‌گیرد — و طبق HI-3 nobody notices. برای `PG_PASSWORD=""` هم یوزر Postgres بدون رمز ساخته می‌شود و `DATABASE_URL` رمز خالی می‌گیرد.

**پیشنهاد:** حذف `|| true` + `[[ ${#JWT} -ge 32 ]] || die` + بررسی غیرخالی بودن `PG_PASSWORD`. (نام توکن قالب هم بی‌ربط است: `CHANGE_ME_openssl_rand_base64_32` در حالی که مقدار `hex` نوشته می‌شود — [deploy/env.production.example:20](file:///C:/laragon/www/Nobino-nest/deploy/env.production.example#L20).)

### HI-9 — `seed-stress.mjs` هیچ گارد پروداکشنی ندارد

**محل:** [scripts/seed-stress.mjs](file:///C:/laragon/www/Nobino-nest/scripts/seed-stress.mjs) (کل فایل) · [:30](file:///C:/laragon/www/Nobino-nest/scripts/seed-stress.mjs#L30) · [:96](file:///C:/laragon/www/Nobino-nest/scripts/seed-stress.mjs#L96)

`seed-demo.mjs:591` و `seed-real.mjs:31` و `prisma/seed.mjs:237` گارد `NODE_ENV=production` دارند؛ در `seed-stress.mjs` هیچ ارجاعی به `NODE_ENV`/`ALLOW_PROD_SEED` وجود ندارد (grep = خالی) با اینکه `TARGET = 250` رکورد **در هر جدول** می‌سازد و در `package.json` هم به‌عنوان `npm run seed:stress` در دسترس عمومی است. `--clean-settings` هم مستقیم `setting.deleteMany({ key: { startsWith: "stress.key." } })` را اجرا می‌کند — بدون گارد، بدون تأیید.

**پیامد:** یک تایپو یا اجرای اشتباه روی سرور = 250 برابر حجم دادهٔ کاتالوگ (کاربر/سالن/نوبت/تراکنش) در پروداکشن، با رمز/پیوندهای قابل‌حدس.

### HI-10 — vhost جدید قبل از اعتبارسنجی جایگزین می‌شود و نسخهٔ قبلی از دست می‌رود

**محل:** [deploy/install.sh:297-315](file:///C:/laragon/www/Nobino-nest/deploy/install.sh#L297)

```bash
cp "$TMP_CONF" /etc/nginx/sites-available/nobino.conf
ln -sf /etc/nginx/sites-available/nobino.conf /etc/nginx/sites-enabled/nobino.conf
if nginx -t 2>/tmp/nobino-nginx-test.log; then ... else
  ... warn "  nobino.conf از قبل در sites-enabled بود؛ در صورت شکست همان حالت برگردانده می‌شود"
  warn "  symlink قبلی بازیابی نمی‌شود؛ از نسخهٔ backup خود استفاده کنید"
```

ترتیب معکوس است: `cp` روی کانفیگ موجود **قبل** از `nginx -t` انجام می‌شود، پس نسخهٔ سالم قبلی روی `sites-available` بازنویسی و از بین می‌رود؛ در شکست فقط symlink پاک می‌شود. اگر `nginx -t` به دلیلی که به نوبینو ربط ندارد (ماژول، TLS دیگر سایت‌ها) خطا بدهد، کانفیگ نوبینو خراب روی دیسک می‌ماند.

**نکتهٔ مثبت:** شرط `nobino.conf از قبل در sites-enabled بود` باعث می‌شود پیام «برگردانده می‌شود» در حالتی چاپ شود که چیزی برگردانده نمی‌شود — خودِ پیام گمراه‌کننده است.

---

## ۶) متوسط (MEDIUM)

### ME-1 — پرچم ناشناخته بی‌صدا نادیده گرفته می‌شود
[scripts/build-release.mjs:29](file:///C:/laragon/www/Nobino-nest/scripts/build-release.mjs#L29): `const has = (flag) => argv.includes(flag);` — هر چیزی که نوشته نشود، فقط «روشن نیست». **بازتولید:** `node scripts/build-release.mjs --skipintall --no-smoke` → هر سه `npm install` (root/backend/frontend) اجرا شد. در CI این یعنی ۵-۱۰ دقیقه تأخیر و دانلود بی‌مورد، نه خطا. (contrast: `update.sh:63` گزینهٔ ناشناخته را با `die` رد می‌کند و `deploy-update.test.mjs:163-164` همین را تست می‌کند.)

### ME-2 — مقدار نامعتبرِ پورت به `NaN` تبدیل می‌شود
[scripts/build-release.mjs:35](file:///C:/laragon/www/Nobino-nest/scripts/build-release.mjs#L35): `Number(process.env.SMOKE_PORT || 3977)`. **بازتولید:** `SMOKE_PORT=abc node scripts/build-release.mjs ...` →
```
🔹 بوت سرور روی پورت NaN برای smoke test...
❌ سرور در ۳۰ ثانیه بالا نیامد /api/health نداد      (EXIT=1، پس از ~21-30s)
```
فرزند هم `PORT="NaN"` گرفته بود. بررسی `Number.isFinite` + fallback کافی بود.

### ME-3 — `--force-reset` با شمارهٔ نادرست: no-op ساکت با کد ۰
[scripts/create-admin.mjs:101-108](file:///C:/laragon/www/Nobino-nest/scripts/create-admin.mjs#L101): `forceSame = argv.includes("--force-reset") && existingAdmin.phone === phone`. اگر شمارهٔ داده‌شده با سوپرادمین موجود فرق کند، شاخهٔ «از قبل وجود دارد» اجرا و `process.exit(0)` می‌شود (خط 106) — نه هشدارِ «--force-reset دادید ولی شماره مطابق نیست». چون [deploy/bootstrap.sh:296](file:///C:/laragon/www/Nobino-nest/deploy/bootstrap.sh#L296) فقط کد خروج را می‌بیند، installer می‌گوید «سوپرادمین آماده است» در حالی که هیچ رمزی عوض نشده.

### ME-4 — create-admin فرمت‌هایی را رد می‌کند که خود اپ می‌پذیرد
[scripts/create-admin.mjs:76](file:///C:/laragon/www/Nobino-nest/scripts/create-admin.mjs#L76) و [:80](file:///C:/laragon/www/Nobino-nest/scripts/create-admin.mjs#L80):
```js
const phone = (arg("phone") || process.env.ADMIN_PHONE || "").trim().replace(/[^\d+]/g, "");
if (!/^0\d{10}$/.test(phone)) ...
```
- رقم فارسی: `۰۹۱۲۱۱۱۰۰۰۰` → `replace` همه را می‌اندازد → پیام «شماره معتبر نیست: «»» (تهی). در اپ این کار را [backend/src/lib/utils.ts:128](file:///C:/laragon/www/Nobino-nest/backend/src/lib/utils.ts#L128) `toAsciiDigits` انجام می‌دهد و در اسکریپت استفاده نشده.
- `9121110000` (بدون صفر) رد می‌شود، در حالی که [backend/src/routes/api/auth__otp__request.ts:13](file:///C:/laragon/www/Nobino-nest/backend/src/routes/api/auth__otp__request.ts#L13) الگوی `/^0?9\d{9}$/` را می‌پذیرد و صفر مقدماتی را خودش اضافه می‌کند. یعنی شماره‌ای که با آن ورود OTP کار می‌کند، در ساخت ادمین رد می‌شود.

### ME-5 — پرچم‌های مقداردار بدون مقدار: crash با پیام خام
[deploy/install.sh:57-65](file:///C:/laragon/www/Nobino-nest/deploy/install.sh#L57) (`--domain) DOMAIN="$2"; shift 2`) و [deploy/bootstrap.sh:59-66](file:///C:/laragon/www/Nobino-nest/deploy/bootstrap.sh#L59) — بدون بررسی `[[ $# -ge 2 ]]`. **بازتولید:** `bash deploy/install.sh --domain` →
```
deploy/install.sh: line 57: $2: unbound variable
```
`update.sh:65` درست این کار را می‌کند (`[[ $# -ge 2 ]] || die "--backup-dir به یک مسیر نیاز دارد"`) — ناسازگاری بین سه اسکریپت هم‌خانواده.

### ME-6 — `--help` بدنهٔ اسکریپت را چاپ می‌کند
[deploy/install.sh:67](file:///C:/laragon/www/Nobino-nest/deploy/install.sh#L67): `sed -n '1,32p' "$0"` · [deploy/bootstrap.sh:70](file:///C:/laragon/www/Nobino-nest/deploy/bootstrap.sh#L70): `sed -n '1,40p' "$0"`. خروجی help شامل `set -euo pipefail` و خطوط منطق است. تست `deploy-update.test.mjs:158` فقط بررسی می‌کند که رشتهٔ `die ` در help نباشد — که اتفاقاً پنجرهٔ 1..32 شامل آن نیست؛ یعنی تست «نشت نکند» با یک برش شانسی سبز می‌ماند.

### ME-7 — `dev-start.mjs`: سه ایراد در یک فایل
[scripts/dev-start.mjs:70-73](file:///C:/laragon/www/Nobino-nest/scripts/dev-start.mjs#L70): `spawn(cmd, args, { shell: process.platform === "win32", ... })`. با `shell:true` روی ویندوز، آرگومان‌ها به `cmd.exe` به‌صورت رشتهٔ join‌شده و بدون کووت می‌روند. **اثبات سندباکس:** همان spawn با مسیر دارای فاصله:
```
shell:true  status= 1
shell:false status= 0
```
+ هشدار Node: `DEP0190` (passing untrusted args with shell:true). ایراد دوم: [خط 21/36](file:///C:/laragon/www/Nobino-nest/scripts/dev-start.mjs#L36) — اگر `.dev.pids` بماند (kill -9، ری‌بوت) پیام «قبلاً اجرا شده» می‌دهد و خارج می‌شود، بدون هیچ بررسی زنده بودن PID؛ راه‌حل رسمی هم حذف دستی فایل است. سوم: [خط 93](file:///C:/laragon/www/Nobino-nest/scripts/dev-start.mjs#L93) «✅ شروع شد» چاپ و exit 0، حتی اگر بک‌اند همان لحظه-crash کند — نه پورت آزاد چک می‌شود نه health.

### ME-8 — تغییر schema در هر بوت
[scripts/paas-start.mjs:85-109](file:///C:/laragon/www/Nobino-nest/scripts/paas-start.mjs#L85) با `DB_SETUP=auto` (پیش‌فرض) در هر شروع `prisma generate` و migrate/db push اجرا می‌کند؛ [deploy/install.sh:217](file:///C:/laragon/www/Nobino-nest/deploy/install.sh#L217)/[:227](file:///C:/laragon/www/Nobino-nest/deploy/install.sh#L227) شکست `db push` را فقط `warn` می‌کنند. ترکیب خطرناک: `db push` روی دیتابیسی که با `migrate deploy` ساخته شده می‌تواند prompt تخریبی بزند (در محیط غیرتعاملی `execFileSync` با `stdio:"inherit"` زیر PM2، آن prompt هرگز جواب نمی‌گیرد و بوت معلق/ناموفق می‌شود) و در `install.sh` همان شکست فقط هشدار است.

### ME-9 — تست‌هایی که نبودِ بیلد را «موفق» می‌شمارند
[scripts/backups.test.mjs:20-24](file:///C:/laragon/www/Nobino-nest/scripts/backups.test.mjs#L20) و [scripts/smoke.test.mjs:24-28](file:///C:/laragon/www/Nobino-nest/scripts/smoke.test.mjs#L24): اگر `backend/dist/main.js` نباشد، `skipIfNoBuild(t)` فراصت `t.skip(...)` می‌کند و test سبز است. `links.test.mjs:100` همین کار را برای نبود esbuild می‌کند و `deploy-update.test.mjs:140` کل دسته را وقتی `bash` در PATH نیست skip می‌کند. **دقت:** `npm run verify` اول بیلد می‌گیرد و بعد تست، پس پنجرهٔ skip در اجرای مستقیم `npm test` (CI سبک، یا بعد از `rm -rf backend/dist`) است — و همان‌جا خروجی سبز با کد ۰ به دست می‌آید بدون آنکه تست‌های رمزنگاری/بکاپ/استقرار اجرا شده باشند. **پیامد:** مهم‌ترین تست‌های امنیتی/استقرار در CI می‌توانند هرگز اجرا نشده باشند و بَج سبز باشد.

### ME-10 — تولیدکدِ بی‌یتیم‌روب و اسکریپت‌های مرده
- [backend/scripts/gen-controllers.mjs:88-90](file:///C:/laragon/www/Nobino-nest/backend/scripts/gen-controllers.mjs#L88) فقط برای گروه‌هایِ دارای entry فایل می‌نویسد؛ اگر همهٔ مسیرهای یک گروه از مانیفست بروند، کنترلر قدایی در `src/controllers/` باقی می‌ماند و در `app.module.ts` هنوز import/import می‌شود (routes تکراری/مرده). `port-routes.mjs` هم `rmSync` را import می‌کند و استفاده نمی‌کند ([خط 9](file:///C:/laragon/www/Nobino-nest/backend/scripts/port-routes.mjs#L9)) — پاک‌سازی فایل‌های بی‌یتیم هیچ‌جا پیاده نیست.
- `backend/scripts/port-routes.mjs:43` روی `ROOT/src/app/api` walk می‌کند که دیگر وجود ندارد → `ENOENT` در اولین اجرا؛ سرفایل هم مسیر نادرست را تبلیغ می‌کند (خط 7: «اجرا: node scripts/port-routes.mjs»). بدتر: کل `manifest.json` را بازنویسی می‌کند، یعنی یک اجرای تصادفی می‌تواند مانیفست دستی‌اصلاح‌شده را نابود کند.
- `frontend/scripts/port-pages.mjs` یک‌بارمصرفِ Next→Vite است، `src/app/*` دیگر نیست → ENOENT؛ و [خط 37](file:///C:/laragon/www/Nobino-nest/frontend/scripts/port-pages.mjs#L37) یک جایگزینی خودبا‌خودِ بی‌اثر است (`from "./PayCard"` → `from "./PayCard"`).
- `frontend/src/pages/*.controller.ts`… دقیق‌تر: `src/controllers/pages.controller.ts` دستی نگه‌داشته می‌شود و با `gen:controllers` قابل تولید نیست؛ یعنی چرخهٔ «generate = source of truth» برای آن فایل شکسته است (اجرای `npm run gen:controllers` آن را نمی‌بیند و تغییرش را حفظ نمی‌کند).

### ME-11 — prerender: صفر صفحه = موفق، و هشدارها در لاگ نمی‌رسند
[frontend/prerender.mjs:211](file:///C:/laragon/www/Nobino-nest/frontend/prerender.mjs#L211) وقتی بک‌اند در دسترس نباشد فقط `console.warn` می‌کند و با کد ۰ تمام می‌شود (صفحهٔ سالن‌ها = ۰). [scripts/paas-start.mjs:171](file:///C:/laragon/www/Nobino-nest/scripts/paas-start.mjs#L171) آن را با `stdio: "ignore"` اجرا می‌کند، پس **همهٔ** این هشدارها (و پیام حذف sitemap در CR-1) در لاگ PM2 هرگز دیده نمی‌شوند. `build-release.mjs:170` هم شکست prerender را به `warn` تبدیل می‌کند.

### ME-12 — گارد پروداکشن ناسازگار
[scripts/seed-real.mjs:31](file:///C:/laragon/www/Nobino-nest/scripts/seed-real.mjs#L31) `process.env.NODE_ENV === "production"` (exact) در برابر [scripts/seed-demo.mjs:591](file:///C:/laragon/www/Nobino-nest/scripts/seed-demo.mjs#L591) `.trim().toLowerCase()` و [prisma/seed.mjs:237](file:///C:/laragon/www/Nobino-nest/prisma/seed.mjs#L237) `.toLowerCase()`. با `NODE_ENV=Production` یا `production ` (فاصله) گارد seed-real دور زده می‌شود؛ seed-demo همان را می‌گیرد.

### ME-13 — ساخت PrismaClient قبل از گارد پروداکشن
[scripts/seed-real.mjs:23](file:///C:/laragon/www/Nobino-nest/scripts/seed-real.mjs#L23) (`const prisma = new PrismaClient();`) پنج خط **قبل** از گارد `NODE_ENV=production` در خط 31 اجرا می‌شود، و [scripts/seed-demo.mjs:18](file:///C:/laragon/www/Nobino-nest/scripts/seed-demo.mjs#L18) هم همین ترتیب را دارد (گاردش داخل `main()` در خط 591 است). هیچ نوشتاری پیش از گارد رخ نمی‌دهد، اما استخر اتصال به نشانی‌ای که ممکن است پروداکشن باشد باز می‌شود و تا پایان پروسه باز می‌ماند؛ در [prisma/seed.mjs:237](file:///C:/laragon/www/Nobino-nest/prisma/seed.mjs#L237) برعکس، گارد قبل از ساخت کلاینت است — یعنی الگوی درست در همان مخزن وجود دارد و seedها آن را رعایت نمی‌کنند. (کدخوانی)

### ME-14 — پرچم ناشناخته در seedها = اجرای کاملِ پاک‌سازی
[scripts/seed-real.mjs:26-28](file:///C:/laragon/www/Nobino-nest/scripts/seed-real.mjs#L26) و [scripts/seed-stress.mjs:96](file:///C:/laragon/www/Nobino-nest/scripts/seed-stress.mjs#L96) فقط `args.includes(...)` می‌کنند؛ هیچ اعتبارسنجی پرچم ناشناخته و هیچ `--help` در هیچ‌کدام از چهار اسکریپت seed نیست. **کدخوانی:** `node scripts/seed-real.mjs --clean-onlyy` (یک کاراکتر اضافه) → هر سه فلش false می‌مانند و مسیر کامل `clean()` (شامل تمام `deleteMany`های CR-3) + seed اجرا می‌شود؛ `--dry-run` هم فقط با املای دقیق فعال می‌شود، پس `--dryrun` پاک‌سازی واقعی می‌کند. در برابرِ الگوی درست همین مخزن: [scripts/create-admin.mjs:39-58](file:///C:/laragon/www/Nobino-nest/scripts/create-admin.mjs#L39) `KNOWN_FLAGS` را دارد و `update.sh:63` گزینهٔ ناشناخته را رد می‌کند.

---

## ۷) پایین (LOW)

- **LO-1** [frontend/prerender.mjs:216](file:///C:/laragon/www/Nobino-nest/frontend/prerender.mjs#L216): فهرست sitemap شامل `/login` است ولی همان صفحه با `noindex: true` تعریف شده (خط 87) → سیگنال متضاد به خزنده. `robots.txt` (خط 225) هم `/login` و `/admin` را Disallow ندارد.
- **LO-2** [frontend/prerender.mjs:181](file:///C:/laragon/www/Nobino-nest/frontend/prerender.mjs#L181): صفحهٔ fallback اسپا برای مسیرهای عمیق ناشناخته با عنوان/توضیح عمومی و `noindex` نوشته می‌شود؛ مسیرهای `no-route` همگی یک فایل یکسان‌اند (بدون canonical متمایز) — برای دیباگ مرده ولی برای crawl مبهم‌کننده.
- **LO-3** [scripts/paas-start.mjs:140-142](file:///C:/laragon/www/Nobino-nest/scripts/paas-start.mjs#L140): `process.exit(code ?? 0)` — اگر سرور با سیگنال کشته شود `code` تهی است و والد با ۰ خارج می‌شود؛ orchestrator از تفاوت «توقف تمیز» و «کشته‌شدن» خبردار نمی‌شود.
- **LO-4** [deploy/update.sh:125-126](file:///C:/laragon/www/Nobino-nest/deploy/update.sh#L125): rollback با *هر* فایل untracked مسدود است — از جمله پوشه‌ای که خود `--backup-dir` داخل مخزن می‌سازد اگر gitignore نباشد؛ و بعد از `git checkout "$commit"` نسخهٔ قدیمی‌تر `.gitignore` برگردانده می‌شود و درخت دوباره کثیف می‌شود. (در سندباکس من همین دو بار جلوی تست rollback را گرفت.)
- **LO-5** [backend/scripts/gen-controllers.mjs:115-135](file:///C:/laragon/www/Nobino-nest/backend/scripts/gen-controllers.mjs#L115): ۵ ددلاین کران سخت‌کد است و `fire(name)` اگر مسیر در مانیفست نبود **بی‌صدا برمی‌گردد** — افزودن `src/app/api/cron/<jdeb>/route.ts` جدید هیچ‌جا کران را فعال نمی‌کند و هیچ خطایی هم نمی‌دهد. (با `vercel.json` هم‌زمان باید دستی نگه داشته شود.)
- **LO-6** [scripts/create-admin.mjs:64](file:///C:/laragon/www/Nobino-nest/scripts/create-admin.mjs#L64) دو دستور در یک خط چسبیده (`const envPath = loadEnv();if (!process.env.DATABASE_URL) {`) و [:106](file:///C:/laragon/www/Nobino-nest/scripts/create-admin.mjs#L106) `process.exit(0)` که `finally { prisma.$disconnect() }` را دور می‌زند (در Postgres اتصال سرور تا timeout می‌ماند).

---

- **HG-1**: ۱۷ فایل `.mjs` یک‌بارمصرف داخل `logs/` است و `logs/` در `.gitignore` — این اسکریپت‌ها نه review می‌شوند نه در بکاپ گیت‌اند؛ اگر کسی لازم‌شان داشته باشد (مثلاً ابزار تست) در سرور بعدی وجود ندارد. در ریشه هم `tmp-*.cjs` و `tmp-css-check.mjs` (مربوط به نشستِ موازی دیگر) مانده‌اند.
- **HG-2**: [deploy/bootstrap.sh:296](file:///C:/laragon/www/Nobino-nest/deploy/bootstrap.sh#L296) رمز سوپرادمین را روی argv می‌گذارد (`--password "$AW"`)؛ خود `create-admin.mjs` در هدرش (خط ۱۰-۱۲) توصیه می‌کند رمز از متغیر محیطی داده شود تا در shell history نماند. `--admin-password` در bootstrap هم همین.
- **HG-3**: `scripts/seed-real.mjs` (بزرگ‌ترین seed، 1281 خط) هیچ ورودی در `package.json` ندارد؛ فقط با `node scripts/seed-real.mjs` قابل اجراست — در حالی که `seed:demo` و `seed:stress` (که پرخطرتر است!) اسکریپت عمومی در `package.json` دارند.

---

## ۹) مواردی که تست شدند و باگ **ندارند**

برای جلوگیری از دوباره‌کاری در ممیزی بعدی:

- `update.sh` اعتبارسنجی آرگومان/پرچم ناشناخته و `--help` کامل دارد؛ در `--dry-run` هیچ رازی چاپ نمی‌شود (`grep -c S3cr3t = 0`).
- `gen-controllers.mjs` بازگشت‌پذیر است: اجرای مجدد هر ۱۱ کنترلر + `cron-jobs.service.ts` را **بایت‌به‌بایت یکسان** تولید کرد.
- `prerender.mjs` idempotent است: ۳ اجرای پیاپی، `diff-lines = 0`.
- `wiring.test.mjs` درست کار می‌کند؛ پروب من برای «moduleهای dangling» با فرمول نادرستِ خودم ۱۲۶ داد و با اصلاح پرانتز: **۰ dangling، ۰ orphan**. آن عدد ۱۲۶ باگ مخزن نبود.
- `install.sh` دامنهٔ کثیف را نرمال‌سازی می‌کند: `--domain 'nobino.ir/evil'` → `nobino.ir`.
- `set -euo pipefail` با `[[ ... ]] && warn` (install.sh:168، bootstrap.sh:238) مشکل ندارد — تست شد؛ در این ساختار خطای طرف چپ لیست را متوقف نمی‌کند.
- `.gitignore` پوشه‌های خطرناک را می‌پوشاند: `dist/`، `/backups/`، `logs/`، `.env`، `deploy/ecosystem.config.cjs`، `public/uploads/*`، `.dev.pids`.
- `vite-build.mjs` (رفع راکت development) درست سیم‌کشی شده: `frontend/package.json` → build: `tsc -b && node scripts/vite-build.mjs && node prerender.mjs` و [scripts/build-release.mjs:140](file:///C:/laragon/www/Nobino-nest/scripts/build-release.mjs#L140) هم همان wrapper را صدا می‌زند، نه `vite build` مستقیم.
- همهٔ `CHANGE_ME*`های قالب env توسط زنجیرهٔ sed پوشش داده می‌شوند (به شرط نبود `&`/`|` در مقادیر — HI-7).

---

## ۱۰) محدودیت‌های این ممیزی / کارهای ناتموم

1. مسیرهای نیازمند ریشه (`apt-get`, `ufw`, `systemctl`, `nginx -t`, `pm2 startup`) در سندباکس با stub اجرا شدند؛ رفتار واقعیِ فایروال و nginx روی سرور تست نشده است (HI-10 و بازتولید ufw: کدخوانی + اجرای stub).
2. `install.sh` فقط در حالت `--dry-run`/`--skip-build` کامل اجرا شد (که خودش HI-4 است)؛ اجرای واقعیِ کامل روی یک VPS خام انجام نشد.
3. `seed-*.mjs` روی دیتابیس واقعی اجرا نشدند؛ CR-3/HI-9 از روی پریکَت‌های حذف و نبود گارد استنتاج شده (کد، قطعی است — دامنهٔ اثر وابسته به داده است).
4. `logs/*.mjs` (۱۷ فایل): نام‌فهرست آماده است ولی «آیا جای دیگر reference شده‌اند؟» کامل بررسی نشد (یک حلقهٔ grep تایم‌اوت خورد). تنها grep سریع نشان داد بیرون از `logs/` فقط `.gitignore/.dockerignore/docs/audit-2026-11-01.md/backend/src/lib/db-backup.ts/ecosystem template` رشتهٔ `logs/` را دارند — یعنی این ۱۷ فایل از کد مخزن reachable نیستند.
5. `deploy/paas/README.md` و `Dockerfile*` در این دور خوانده نشدند (محدودهٔ «اسکریپت» بود؛ اگر بخواهید، لایهٔ image/build را جدا ممیزی می‌کنم).
