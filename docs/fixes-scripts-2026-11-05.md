# گزارش رفع باگ‌های ممیزی لایهٔ اسکریپت — 2026-11-05

مبنای یافته‌ها: `docs/audit-scripts-2026-11-05.md` (۳۶ یافته: ۳ بحرانی، ۱۰ بالا، ۱۴ متوسط، ۶ پایین، ۳ بهداشتی).
این فایل **لاگ رفع** است: هر آیتم با شناسهٔ همان گزارش، فایل‌های تغییرکرده و شاهد (تست سندباکس/منبع).
روش صحت‌سنجی: بدون دست‌زدن به دیتای واقعی — سندباکس‌های موقت در tmp، دیتابیس تقلبی روی پورت ۱، stub کردن pm2/pg_dump در subshell و تست‌های قراردادِ منبع. نتیجهٔ نهایی سوئیت: **۱۷۳ تست، ۰ شکست** (۹ skip محیطیِ «دیتابیس در دسترس نیست»).

## گروه ۸۳ — CR-1 + HI-4 (مبنای prerender از .env و smoke صادق)

| یافته | فایل | رفع |
| --- | --- | --- |
| CR-1 | `frontend/prerender.mjs` · `scripts/paas-start.mjs` · `scripts/build-release.mjs` | مبنا (base) از `env`/`fromEnvFile()` خوانده می‌شود نه حدسِ هاردکد؛ sitemap/robots فقط برای پایگاه عمومی بازنویسی می‌شود و روی localhost فایل‌های کهنه حذف می‌شوند. paas-start دیگر prerender را با `stdio:"ignore"` اجرا نمی‌کند (ME-11) و مقدار `VITE_SITE_URL`/`PRERENDER_API` را از `.env.production`/`.env` می‌دهد. |
| HI-4 | `scripts/smoke.test.mjs` | smoke دیگر «بوت موفق» کاذب نمی‌دهد: خطاهای `P1001/ECONNREFUSED/Can't reach database` به «دیتابیس در دسترس نیست» نگاشت می‌شوند و علتِ واقعی ردشدن همان‌جا ثبت می‌شود. |

شاهد: `scripts/prerender.test.mjs` (۸ تست: پایگاه محلی sitemap/robots را پاک می‌کند؛ بک‌اندِ در دسترس فهرست سالن‌ها را داخل sitemap می‌گذارد) + قراردادهای منبع در همان فایل.

## گروه ۸۴ — CR-2 + HI-1/2/3 (rollback و سلامت واقعی در update.sh)

| یافته | فایل | رفع |
| --- | --- | --- |
| CR-2 | `deploy/update.sh` | rollback واقعی‌سازی شد: dump با `--single-transaction --exit-on-error` (شکست وسط بازگردانی = کل بازگردانی لغو)، بکاپ قبل از `git checkout`، HEAD معلق بعد از `--rollback` شناسایی و به شاخه برمی‌گردد. |
| HI-1 | `deploy/update.sh` | «سلامت» دیگر فقط کد HTTP نیست؛ پاسخ `/api/health?db=1` واکاوی می‌شود. |
| HI-2 | `deploy/update.sh` | ترتیب بکاپ/checkout امن شد (اول dump، بعد جابه‌جایی کد). |
| HI-3 | `deploy/update.sh` | rollback با فایل‌های untracked دیگر مسدود نمی‌شود — فقط تغییرات ثبت‌نشده‌ٔ tracked رد می‌شوند و untrackedها صرفاً هشدار می‌گیرند (LO-4 هم در همین مسیر). |

شاهد: `scripts/deploy-update.test.mjs` — همان اسکریپت در درخت موقت و با pm2/pg_dump استاب‌شده اجرا می‌شود (ترتیب مراحل، توقف روی شکست، چرخش بکاپ، تأیید اقدام ویرانگر) + پیش‌نیاز bash با قاعدهٔ ME-9.

## گروه ۸۵ — HI-5/6/7/8/10 + ME-5/6 (install.sh و bootstrap.sh)

| یافته | فایل | رفع |
| --- | --- | --- |
| HI-5 | `deploy/install.sh` | دامنهٔ کثیف (اسلش/پورت/فضا) قبل از هر استفادهای نرمال می‌شود. |
| HI-6 | `deploy/bootstrap.sh` | dry-run دیگر `read` تعاملی نمی‌کند و در CI/`curl\|bash` منتظر ورودی نمی‌ماند. |
| HI-7 | `deploy/bootstrap.sh` | `&` و `|` در دامنه دیگر `.env` را خراب/خالی نمی‌کند — اعتبارسنجی `^[A-Za-z0-9][A-Za-z0-9.-]*$`. |
| HI-8 | `deploy/bootstrap.sh` | `rand_secret`/`rand_pg` دیگر با `|| true` مقدار خالی نمی‌دهند؛ هر دو مسیر تصادف (openssl → /dev/urandom) بررسی طول دارند و شکستشان `die` می‌کند — گیت `CHANGE_ME` دیگر در `.env` نمی‌نشیند. |
| HI-10 | `deploy/install.sh` | بازنویسی vhost فقط بعد از `nginx -t` موفق؛ نسخهٔ قبلی پیش از تست نگه داشته و در شکست برمی‌گردد. |
| ME-5 | `deploy/install.sh` · `deploy/bootstrap.sh` | `$2: unbound variable` — هر پرچمِ مقدارداری `need_value` گرفت. |
| ME-6 | `deploy/install.sh` · `deploy/bootstrap.sh` | `--help` واقعی (از کامنت‌های هدر) به‌جای چاپ کل کد اسکریپت. |
| HG-2 | `deploy/bootstrap.sh` | رمز سوپرادمین دیگر روی argv نمی‌رود (در `ps` دیده نمی‌شود) — از محیط/فایل خوانده می‌شود، هم‌جهت با راهنمای خود `create-admin.mjs`. |

## گروه ۸۶ — CR-3 + HI-9 + ME-12/13/14 + HG-3 (اسکریپت‌های seed)

| یافته | فایل | رفع |
| --- | --- | --- |
| CR-3 | `scripts/seed-stress.mjs` | `--clean-settings` حالا فقط `stress.key.*` را پاک می‌کند (نه کل جدول Setting) و در پروداکشن بدون تأیید صریح اجرا نمی‌شود. |
| HI-9 | `scripts/seed-stress.mjs` | گارد پروداکشن + تأیید قبل از `--clean-settings`. |
| ME-12 | `scripts/seed-real.mjs` | گارد پروداکشن با بقیه یک‌دست شد (`.trim().toLowerCase()` — `NODE_ENV=Production` هم گرفته می‌شود). |
| ME-13 | `scripts/seed-real.mjs` · `scripts/seed-demo.mjs` | `new PrismaClient()` بعد از گارد (بدون اتصال زودهنگام). |
| ME-14 | `scripts/seed-real.mjs` · `scripts/seed-stress.mjs` | پرچم ناشناخته رد می‌شود (تایپو = اجرای پاک‌سازی نیست) + `--help`. |
| HG-3 | `package.json` | `seed:real` به اسکریپت‌ها اضافه شد (بزرگ‌ترین seed بی‌نام نماند). |

لایهٔ مشترک: `scripts/lib/seed-guard.mjs` (جدید) — گارد پروداکشن/آرگومان/راهنما که هر سه seed از آن استفاده می‌کنند. شاهد: `scripts/seed-guard.test.mjs`.

## گروه ۸۷ — ME-1/2/3/4/7/11 + LO-1/2/3/6 + HG-2 (اسکریپت‌های نود)

| یافته | فایل | رفع |
| --- | --- | --- |
| ME-1 | `scripts/build-release.mjs` | پرچم ناشناخته → خروج ۲ با راهنما (تایپو دیگر `npm install` کامل نمی‌زند). |
| ME-2 | `scripts/build-release.mjs` | `SMOKE_PORT` اعتبارسنجی عددی؛ مقدار غیرعددی همان‌جا رد می‌شود. |
| ME-3 | `scripts/create-admin.mjs` | `--force-reset` با شمارهٔ نادرست دیگر no-op با exit 0 نیست. |
| ME-4 | `scripts/create-admin.mjs` | ارقام فارسی ورودی به لاتین (`toAsciiDigits`) و پیام خطای فارسی؛ دو دستور چسبیدهٔ یک خط جدا شدند و `$disconnect` دور زده نمی‌شود (LO-6). |
| ME-7 | `scripts/dev-start.mjs` | `shell:true` حذف؛ `.dev.pids` کهنه با بررسی زنده‌بودن PID پاک می‌شود (زنده → پیام «npm run stop» و خروج ۱)؛ بعد از spawn گیت health واقعی (`waitHttp`) و فقط آنگاه «✅ شروع شد» — در شکست tail لاگ و خروج ۱. |
| ME-11 | `frontend/prerender.mjs` · `scripts/paas-start.mjs` | prerender بدون فهرست سئو با کد ۱ خارج می‌شود (`PRERENDER_ALLOW_NO_API=1` = فرار آگاهانه) و paas-start stdout/stderr آن را به لاگ PM2 می‌دهد؛ sitemap بدون فهرست سالن‌ها بازنویسی نمی‌شود. |
| LO-1 | `frontend/prerender.mjs` | sitemap از `STATIC_PAGES` مشتق می‌شود (noindexها نمی‌توانند برگردند)؛ robots هم `/admin/` و `/dashboard/` را می‌بندد. |
| LO-2 | `backend/src/common/ops-middleware.ts` | fallback مسیر عمیق هدر `X-Robots-Tag: noindex, nofollow` می‌گیرد. |
| LO-3 | `scripts/paas-start.mjs` | کشته‌شدن با سیگنال دیگر خروج ۰ نیست (خروج ۱ مگر توقف درخواستی). |

شاهد: `scripts/dev-start.test.mjs` (۵ تست، شامل اجرای واقعی با PID زنده) و `scripts/prerender.test.mjs` (۸ تست).

## گروه ۸۸ — ME-8/9/10 + LO-5 + HG-1 (موارد بدون گروه)

| یافته | فایل | رفع |
| --- | --- | --- |
| ME-8 | `scripts/paas-start.mjs` · `deploy/install.sh` | `db push` دیگر در هر بوت نیست (مهر schema از گروه قبل). paas-start در PM2 (stdin غیرتعاملی) روی prompt آویزان نمی‌ماند (`--accept-data-loss` هرگز خودکار اضافه نمی‌شود)؛ در install، شکست آماده‌سازی schema کشنده شد (`DB_SETUP=skip` = فرار آگاهانه). |
| ME-9 | `scripts/lib/test-guard.mjs` (جدید) + `scripts/{backups,smoke,links,deploy-update}.test.mjs` | نبودِ artifact (بیلد/dependency/bash) دیگر skip بی‌صدا نیست — `t.fail` با فرمانِ ساخت؛ `SKIP_MISSING_ARTIFACTS=1` = فرار آگاهانه. skipهای محیطی (دیتابیس پایین، لاگین ادمین در دسترس نبود) عمداً skip ماندند. شاهد: `scripts/test-guard.test.mjs`. |
| ME-10 | `backend/scripts/gen-controllers.mjs` · `backend/scripts/port-routes.mjs` · `frontend/scripts/port-pages.mjs` | تولیدکد کنترلرهای بی‌یتیم (فایل دارای علامت «خودکار» ولی بدون مسیر در مانیفست) را گزارش می‌کند و با `--prune` حذف؛ فایل‌های دستی (مثل `pages.controller.ts`) هرگز حذف نمی‌شوند. دو اسکریپت مهاجرت Next→Nest بازنشسته شدند: به‌جای ENOENT و بازنویسیِ تصادفی manifest، پیام مسیرِ جدید می‌دهند و با کد ۱ خارج می‌شوند. |
| LO-5 | `backend/scripts/gen-controllers.mjs` | زمان‌بندی کران‌ها در نقشهٔ واحد `CRON_SCHEDULES`؛ کرانِ بدون ددلاین یا ددلاینِ بدون مسیر → خطا و خروج ۱؛ `fire()` برای مسیر ناموجود پیام خطا می‌دهد (بی‌صدا برنمی‌گردد). فایل تولیدشدهٔ `cron-jobs.service.ts` از همان نقشه ساخته می‌شود. |
| HG-1 | `scripts/tools/` (جدید) + `.gitignore` | شش ابزار تشخیصیِ قابلاستفادهٔ مجدد از `logs/` (gitignored) به مسیر ردیابی‌شده منتقل شدند؛ در `endpoint-sweep.mjs` اعتبار ادمینِ سخت‌کدشده حذف و از `ADMIN_EMAIL/ADMIN_PASSWORD` خوانده می‌شود. `.gitignore` یادداشت گرفت که ابزارهای ماندنی باید به `scripts/tools/` بروند. |

شاهد: `scripts/gen-controllers.test.mjs` (۵ تست سندباکس: تولید عادی، هشدار/`--prune` بی‌یتیم، حفظ فایل دستی، کران بدون ددلاین → خروج ۱، بازنشستگی port-routes/port-pages بدون لمس manifest).

## جمع‌بندی

- هر ۳۶ یافتهٔ گزارش رفع شد؛ استثنای آگاهانه: skipهای محیطی در smoke (دیتابیس در دسترس نیست) و رد شدن نرم از فرارگاه‌های مستند (`SKIP_MISSING_ARTIFACTS`، `PRERENDER_ALLOW_NO_API`، `DB_SETUP=skip`).
- `backend/dist` عمداً بازسازی نشد (سرویس زندهٔ :3100 آن را در دست دارد)؛ تغییر سورس `ops-middleware.ts` (LO-2) با بیلد بعدی روی سرور می‌نشیند.
- فایل‌های `frontend/src/dashmini/**` و `tmp-*.cjs` ریشه متعلق به نشست موازی دیگرند و دست نخورده‌اند.
