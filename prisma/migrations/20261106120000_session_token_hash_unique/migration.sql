-- یکتایی هش توکن نشست
--
-- قبلاً `Session.tokenHash` نه unique بود و نه ایندکس؛ lookup نشست با
-- findFirst انجام می‌شد. حالا هش توکن یکتاست و ایندکس یکتا هم سرعت
-- اعتبارسنجی هر درخواست را بهتر می‌کند.
--
-- پاک‌سازی دفاعی: اگر در دیتابیس موجود رکورد تکراری باشد (مثلاً از اجرای
-- هم‌زمان یا دادهٔ دستی)، جدیدترین رکورد نگه داشته می‌شود تا ساخت ایندکس
-- شکست نخورد. این رکوردها همان توکن را نمایندگی می‌کنند و حذف قدیمی‌تر
-- نشست معتبری را از بین نمی‌برد.

DELETE FROM "public"."Session" AS s
USING "public"."Session" AS d
WHERE s."tokenHash" = d."tokenHash"
  AND (s."createdAt", s."id") < (d."createdAt", d."id");

CREATE UNIQUE INDEX "Session_tokenHash_key" ON "public"."Session"("tokenHash");
