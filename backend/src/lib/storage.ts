import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { settingOrEnv } from "@/lib/settings";

/**
 * ذخیره‌سازی فایل (صدا/گالری).
 * - اگر توکن Vercel Blob تنظیم شده باشد — از پنل سوپرادمین (`storage.blob_token`)
 *   یا متغیر محیطی `BLOB_READ_WRITE_TOKEN` — از Vercel Blob استفاده می‌شود.
 * - در غیر این صورت (توسعه محلی) فایل در `public/uploads` ذخیره می‌شود.
 */
export type StoredFile = { url: string; key: string; size: number };

export async function storeFile(
  file: { arrayBuffer(): Promise<ArrayBuffer>; name?: string; size?: number },
  opts: { dir?: string } = {}
): Promise<StoredFile> {
  const dir = opts.dir ?? "uploads";
  const ext = path.extname(file.name ?? "") || ".bin";
  const key = `${dir}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  // تلاش با Vercel Blob (توکن از پنل سوپرادمین یا متغیر محیطی)
  const blobToken = ((await settingOrEnv("storage.blob_token", process.env.BLOB_READ_WRITE_TOKEN)) ?? "").trim();
  if (blobToken) {
    try {
      const { put } = await import("@vercel/blob");
      const result = await put(key, buffer, { access: "public", addRandomSuffix: true, token: blobToken });
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

/** حذف فایل محلی (اختیاری) */
export async function removeLocalFile(key: string) {
  try {
    const p = path.join(process.cwd(), "public", key);
    await stat(p);
    await import("node:fs/promises").then((m) => m.unlink(p));
    return true;
  } catch {
    return false;
  }
}

