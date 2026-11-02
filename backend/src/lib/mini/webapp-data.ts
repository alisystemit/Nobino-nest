/**
 * راستی‌آزمایی «initData» مینی‌اپ پیام‌رسان‌ها (تلگرام و بله).
 *
 * الگوریتم (هر دو پیام‌رسان از همان ساختار تلگرام پیروی می‌کنند):
 *   ۱) initData رشته‌ای کوئری‌مانند است: `key=value&...&hash=<hex>`
 *   ۲) همهٔ جفت‌ها به‌جز `hash`، با کلیدهای sort شده، با `\n` به هم می‌پیوندند
 *      → `dataCheckString`
 *   ۳) کلید مخفی = HMAC_SHA256(key = "WebAppData", data = sha256(botToken))
 *   ۴) امضای معتبر = HMAC_SHA256(secretKey, dataCheckString) به‌صورت hex
 *   ۵) `auth_date` باید تازه باشد (پیش‌فرض ۲۴ ساعت)
 *
 * تابع خالص است (بدون دیتابیس/محیط) تا مستقیم قابل تست باشد.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type MiniProfile = {
  externalId: string;
  username?: string;
  name?: string;
  language?: string;
  photoUrl?: string;
};

export type VerifyResult =
  | { ok: true; profile: MiniProfile; authDate: number }
  | { ok: false; reason: string };

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** تجزیهٔ رشتهٔ کوئری‌مانند initData به جفت‌های خام (با decode یک‌بار مقدار) */
function pairs(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const chunk of raw.split("&")) {
    if (!chunk) continue;
    const eq = chunk.indexOf("=");
    if (eq <= 0) continue;
    const key = chunk.slice(0, eq);
    const value = decodeSafe(chunk.slice(eq + 1));
    if (out.has(key)) continue; // اولین occurrences معتبر است
    out.set(key, value);
  }
  return out;
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

/** داده‌های کاربر داخل initData (JSON رشته‌ای) */
function readUser(raw?: string): MiniProfile | null {
  if (!raw) return null;
  try {
    const u = JSON.parse(raw) as {
      id?: number | string;
      username?: string;
      first_name?: string;
      last_name?: string;
      language_code?: string;
      photo_url?: string;
    };
    const id = String(u.id ?? "").trim();
    if (!/^\d+$/.test(id)) return null;
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
    return {
      externalId: id,
      username: u.username || undefined,
      name: name || undefined,
      language: u.language_code || undefined,
      photoUrl: u.photo_url || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * راستی‌آزمایی کامل.
 * @param initData خام‌ترین رشته‌ای که پیام‌رسان به `WebApp.initData` گذاشته است
 * @param botToken توکن ربات (از تنظیمات سوپرادمین، هرگز به کلاینت نمی‌رود)
 */
export function verifyWebAppInitData(
  initData: string,
  botToken: string,
  opts: { now?: number; maxAgeMs?: number } = {}
): VerifyResult {
  const token = (botToken ?? "").trim();
  const raw = (initData ?? "").trim();
  if (!token) return { ok: false, reason: "BOT_TOKEN_MISSING" };
  if (!raw || raw.length > 20000) return { ok: false, reason: "INIT_DATA_EMPTY" };

  const map = pairs(raw);
  const receivedHash = (map.get("hash") ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(receivedHash)) return { ok: false, reason: "HASH_MISSING" };

  const authDateRaw = map.get("auth_date") ?? "";
  const authDate = Number(authDateRaw);
  if (!Number.isFinite(authDate) || authDate <= 0) return { ok: false, reason: "AUTH_DATE_MISSING" };

  const now = opts.now ?? Date.now();
  const maxAge = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  if (authDate * 1000 > now + 5 * 60 * 1000) return { ok: false, reason: "AUTH_DATE_IN_FUTURE" };
  if (now - authDate * 1000 > maxAge) return { ok: false, reason: "INIT_DATA_EXPIRED" };

  // dataCheckString: همهٔ جفت‌ها به‌جز hash، مرتب‌شده بر اساس کلید
  const dataCheck = [...map.entries()]
    .filter(([k]) => k !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", secretKey).update(dataCheck).digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(receivedHash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "BAD_SIGNATURE" };

  const profile = readUser(map.get("user"));
  if (!profile) return { ok: false, reason: "USER_MISSING" };
  return { ok: true, profile, authDate };
}

/** فقط خواندن پروفایل (بدون اعتبارسنجی امضا) — برای نمایش، نه برای هویت */
export function peekInitUser(initData: string): MiniProfile | null {
  return readUser(pairs((initData ?? "").trim()).get("user") ?? undefined);
}

/** کلید ذخیرهٔ پیوند کاربر پیام‌رسان ↔ کاربر نوبینو در جدول Setting */
export function linkKey(platform: string, externalId: string): string {
  const p = platform.trim().toLowerCase();
  const id = externalId.trim();
  if (!/^[a-z0-9_-]{2,20}$/.test(p) || !/^\d{1,32}$/.test(id)) {
    throw new Error("invalid link key parts");
  }
  return `miniapps.link.${p}.${id}`;
}

/** هش کوتاه برای لاگ/پشتیبانی (بدون افشای شناسهٔ کامل) */
export function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
