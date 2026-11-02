# Migrationها

این پوشه از نسخهٔ `0_init` شروع می‌شود: یک baseline کامل که با

```
node node_modules/prisma/build/index.js migrate diff \
  --from-empty --to-schema-datasource prisma/schema.prisma --script \
  > prisma/migrations/0_init/migration.sql
```

از روی `prisma/schema.prisma` ساخته شده (۱۰۲۸ خط، بدون هیچ `DROP`).

## دیتابیس تازه (خالی)

همه‌چیز خودکار است: `install.sh`، `update.sh` و `DB_SETUP=auto` در `paas-start.mjs`
چون پوشهٔ `prisma/migrations` وجود دارد، به‌جای `db push` مسیر
`prisma migrate deploy` را می‌روند.

## دیتابیس موجود که قبلاً با `db push` ساخته شده

جداول از قبل ساخته شده‌اند و جدول `_prisma_migrations` خالی است. اگر مستقیم
`migrate deploy` اجرا شود، `0_init` روی دیتابیس موجود با خطای «already exists»
می‌خورد. پس baseline را «اعمال‌شده» علامت بزنید:

```
node node_modules/prisma/build/index.js migrate resolve --applied 0_init
```

بعد از آن، تغییرات schema جدید را با `migrate diff` (نه `db push`) بسازید:

```
node node_modules/prisma/build/index.js migrate dev --name <نام_تغییر>
```

## نکتهٔ نسخهٔ لوکال

`:3100` در dev ممکن است به دیتابیس دیگری وصل باشد؛ در این حالت فقط
`migrate resolve --applied 0_init` را روی همان دیتابیس هدف اجرا کنید و `db push`
را برای dev نگه دارید.
