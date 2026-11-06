-- مهاجرت ستون‌های مالی از INTEGER (int4) به BIGINT (int8)
--
-- ستون‌های `Int` در Prisma روی PostgreSQL به `integer` نگاشت می‌شوند و سقف
-- ۲٬۱۴۷٬۴۸۳٬۶۴۷ تومان دارند. با رشد مبالغ (مثلاً مجموع تراکنش‌ها، موجودی
-- کیف پول یا قیمت پکیج سالانه) نوشتن مقدار بزرگ‌تر خطای ۵۰۰ می‌داد.
-- حالا نوع پایگاه‌داده bigint است و لایهٔ برنامه با `lib/money.ts` بین
-- `bigint` (پایگاه‌داده) و `number` (API/فرانت) تبدیل می‌کند.
--
-- این مهاجرت additive و بدون از دست رفتن داده است (int4 → int8 همیشه بی‌خطر
-- است). اگر مقدار پیش‌فرض عددی باشد، PostgreSQL خودش آن را به bigint cast
-- می‌کند.

ALTER TABLE "public"."SalonCustomer" ALTER COLUMN "spend" TYPE BIGINT USING "spend"::BIGINT;

ALTER TABLE "public"."CashRegisterEntry" ALTER COLUMN "cashAmount" TYPE BIGINT USING "cashAmount"::BIGINT;
ALTER TABLE "public"."CashRegisterEntry" ALTER COLUMN "cardAmount" TYPE BIGINT USING "cardAmount"::BIGINT;
ALTER TABLE "public"."CashRegisterEntry" ALTER COLUMN "onlineAmount" TYPE BIGINT USING "onlineAmount"::BIGINT;
ALTER TABLE "public"."CashRegisterEntry" ALTER COLUMN "expenseAmount" TYPE BIGINT USING "expenseAmount"::BIGINT;

ALTER TABLE "public"."Service" ALTER COLUMN "price" TYPE BIGINT USING "price"::BIGINT;

ALTER TABLE "public"."Appointment" ALTER COLUMN "depositAmount" TYPE BIGINT USING "depositAmount"::BIGINT;
ALTER TABLE "public"."Appointment" ALTER COLUMN "priceSnapshot" TYPE BIGINT USING "priceSnapshot"::BIGINT;

ALTER TABLE "public"."Wallet" ALTER COLUMN "balance" TYPE BIGINT USING "balance"::BIGINT;

ALTER TABLE "public"."Transaction" ALTER COLUMN "amount" TYPE BIGINT USING "amount"::BIGINT;
ALTER TABLE "public"."Transaction" ALTER COLUMN "balanceAfter" TYPE BIGINT USING "balanceAfter"::BIGINT;

ALTER TABLE "public"."Payout" ALTER COLUMN "amount" TYPE BIGINT USING "amount"::BIGINT;

ALTER TABLE "public"."Package" ALTER COLUMN "price" TYPE BIGINT USING "price"::BIGINT;
ALTER TABLE "public"."Package" ALTER COLUMN "yearlyPrice" TYPE BIGINT USING "yearlyPrice"::BIGINT;

ALTER TABLE "public"."Invoice" ALTER COLUMN "amount" TYPE BIGINT USING "amount"::BIGINT;
ALTER TABLE "public"."Invoice" ALTER COLUMN "originalAmount" TYPE BIGINT USING "originalAmount"::BIGINT;

ALTER TABLE "public"."Order" ALTER COLUMN "amount" TYPE BIGINT USING "amount"::BIGINT;
ALTER TABLE "public"."Order" ALTER COLUMN "originalAmount" TYPE BIGINT USING "originalAmount"::BIGINT;

ALTER TABLE "public"."Payment" ALTER COLUMN "amount" TYPE BIGINT USING "amount"::BIGINT;

ALTER TABLE "public"."GiftCard" ALTER COLUMN "balance" TYPE BIGINT USING "balance"::BIGINT;

-- سفارش تمدید: پیوند به اشتراکی که باید جلو برود (نه فعال‌سازی جدید).
-- بدون این فیلد، callback تمدید خودکار اشتراک ACTIVE تکراری می‌ساخت.
ALTER TABLE "public"."Order" ADD COLUMN "renewalSubscriptionId" TEXT;

CREATE INDEX "Order_renewalSubscriptionId_idx" ON "public"."Order"("renewalSubscriptionId");
