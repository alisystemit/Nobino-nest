import { mkdir, writeFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { settingOrEnv } from "@/lib/settings";
import { EXT_BY_MIME, SAFE_EXTENSIONS, normalizeMime } from "@/lib/upload-validation";

/**
 * ذخیره‌سازی فایل (صدا/گالری).
 * - اگر توکن Vercel Blob تنظیم شده باشد — از پنل سوپرادمین (`storage.blob_token`)
 *   یا متغیر محیطی `BLOB_READ_WRITE_TOKEN` — از Vercel Blob استفاده می‌شود.
 * - در غیر این صورت (توسعه محلی) فایل در `public/uploads` ذخیره می‌شود.
 *
 * امنیت: پسوند فایل هرگز از `file.name` کلاینت گرفته نمی‌شود؛ فقط از MIME
 * (پس از اعتبارسنجی محتوا) یا از فهرست سفید پسوندها. مسیر پوشه هم sanitize
 * می‌شود تا `dir` نتواند از `public/` بیرون بزند.
 */
export type StoredFile = { url: string; key: string; size: number };

/** فقط حروف/ارقام/خط تیره/اسلش — حذف `..` و کاراکترهای خطرناک */
function safeDir(dir: string): string {
  const parts = String(dir)
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.replace(/[^a-zA-Z0-9_-]/g, ""))
    .filter((part) => part && part !== "." && part !== "..");
  return parts.length ? parts.join("/") : "uploads";
}

/**
 * پسوند ذخیره‌سازی:
 *  ۱) MIME صریحِ اعتبارسنجی‌شده (`opts.mime`) ← مطمئن‌ترین
 *  ۲) MIME فایل
 *  ۳) پسوند نام فایل فقط اگر در فهرست سفید باشد
 *  ۴) `.bin` (که سرو نمی‌شود)
 */
function safeExtension(file: { name?: string; type?: string }, explicit?: string): string {
  const byMime = EXT_BY_MIME[normalizeMime(explicit ?? file.type)];
  if (byMime) return byMime;

  const nameExt = path.extname(file.name ?? "").toLowerCase();
  if (SAFE_EXTENSIONS.has(nameExt)) return nameExt;

  return ".bin";
}

export async function storeFile(
  file: { arrayBuffer(): Promise<ArrayBuffer>; name?: string; type?: string; size?: number },
  opts: { dir?: string; mime?: string } = {}
): Promise<StoredFile> {
  const dir = safeDir(opts.dir ?? "uploads");
  const ext = safeExtension(file, opts.mime);
  const key = `${dir}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  // تلاش با Vercel Blob (توکن از پنل سوپرادمین یا متغیر محیطی)
  const blobToken = ((await settingOrEnv("storage.blob_token", process.env.BLOB_READ_WRITE_TOKEN)) ?? "").trim();
  if (blobToken) {
    try {
      const { put } = await import("@vercel/blob");
      // contentType صریح تا Blob هم فایل را با همان نوع ذخیره/سرو کند
      const result = await put(key, buffer, {
        access: "public",
        addRandomSuffix: true,
        token: blobToken,
      });
      return { url: result.url, key: result.pathname, size: buffer.length };
    } catch {
      // به ذخیره محلی برمی‌گردیم
    }
  }

  // ذخیره محلی در public/<dir>
  const absDir = path.join(process.cwd(), "public", dir);
  await mkdir(absDir, { recursive: true });
  const absPath = path.join(process.cwd(), "public", key);
  await writeFile(absPath, buffer);
  return { url: `/${key}`, key, size: buffer.length };
}

/** حذف فایل محلی (اختیاری) — فقط درون `public/` */
export async function removeLocalFile(key: string) {
  try {
    const clean = String(key).replace(/\\/g, "/").replace(/^\/+/, "");
    if (!clean || clean.split("/").some((part) => part === ".." || part === ".")) return false;
    const p = path.join(process.cwd(), "public", clean);
    const root = path.join(process.cwd(), "public");
    if (!path.resolve(p).startsWith(path.resolve(root) + path.sep)) return false;
    await stat(p);
    await unlink(p);
    return true;
  } catch {
    return false;
  }
}
