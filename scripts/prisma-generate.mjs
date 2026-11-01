#!/usr/bin/env node
/**
 * prisma generate بدون وابستگی به PATH یا node_modules/.bin
 * (برخی پلتفرم‌های بیلد با --no-bin-links نصب می‌کنند و در postinstall
 *  دستور خام `prisma` پیدا نمی‌شود؛ اینجا CLI را مستقیم از node_modules اجرا می‌کنیم.)
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(ROOT, "node_modules", "prisma", "build", "index.js");

if (!existsSync(cli)) {
  console.warn("[prisma-generate] پکیج prisma نصب نیست؛ این مرحله فعلاً رد می‌شود.");
  process.exit(0);
}

const res = spawnSync(process.execPath, [cli, "generate"], { cwd: ROOT, stdio: "inherit" });
if ((res.status ?? 1) === 0) process.exit(0);

// در ویندوز، اگر سرور dev در حال اجرا باشد، DLL موتور قفل است و rename با EPERM
// می‌شکند؛ در این حالت کلاینت از قبل تولید شده و قابل استفاده است، پس ادامه بده.
const generated = path.join(ROOT, "node_modules", ".prisma", "client", "index.js");
if (existsSync(generated)) {
  console.warn("[prisma-generate] generate کامل نشد (احتمال قفل فایل توسط سرور در حال اجرا)؛ کلاینت موجود است، ادامه می‌دهم.");
  process.exit(0);
}
process.exit(res.status ?? 1);
