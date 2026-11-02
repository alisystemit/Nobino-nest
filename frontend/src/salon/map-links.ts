/**
 * helpers صفحهٔ عمومی سالن — لینک‌های نقشه و وضعیت باز/بسته بودن.
 * منطق لینک‌سازی از نسخهٔ قبلی صفحهٔ سالن منتقل شده (با رفع مختصات نامعتبر).
 */
import { faDigits } from "@/mini/lib/format";

const DAYS_FA = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

export type OpeningHour = {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed?: boolean;
};

/** مختصات معتبر یا null — با Number(null) سالنِ بی‌مختصات روی ۰،۰ پین می‌شد */
export function toCoord(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * لینک «نشان» و «بلد»:
 *   ۱) لینکی که صاحب سالن تنظیم کرده (neshanUrl/baladUrl)
 *   ۲) پین روی مختصات ثبت‌شدهٔ همان سالن
 *   ۳) جست‌وجوی نام/شهر/آدرس
 */
export function buildMapDeepLinks(salon: Record<string, any>): { neshan: string; balad: string; hasCoords: boolean } {
  const q = [salon.name, salon.city, salon.address].filter(Boolean).join(" ").trim();
  const lat = toCoord(salon.latitude);
  const lng = toCoord(salon.longitude);
  const hasCoords = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const fmt = (n: number) => n.toFixed(6);
  return {
    hasCoords,
    neshan:
      salon.neshanUrl ||
      (hasCoords ? `https://neshan.org/maps/share/${fmt(lat!)},${fmt(lng!)}` : `https://neshan.org/maps/search/${encodeURIComponent(q)}`),
    balad:
      salon.baladUrl ||
      (hasCoords ? `https://balad.ir/#16/${fmt(lat!)}/${fmt(lng!)}` : `https://balad.ir/search?text=${encodeURIComponent(q)}`),
  };
}

/** لینک جاسازی نقشه — فقط نشانی‌های embeddable؛ وگرنه از مختصات/آدرس ساخته می‌شود */
export function buildMapEmbed(salon: Record<string, any>, hasCoords: boolean): string {
  const q = [salon.address, salon.city].filter(Boolean).join(" ").trim();
  const fallback = hasCoords
    ? `https://maps.google.com/maps?q=${toCoord(salon.latitude)},${toCoord(salon.longitude)}&z=16&output=embed`
    : `https://maps.google.com/maps?q=${encodeURIComponent(q || salon.name || "")}&z=15&output=embed`;
  const explicit = typeof salon.mapUrl === "string" ? salon.mapUrl : "";
  return explicit.includes("output=embed") ? explicit : fallback;
}

/** ایندکس روز جاری در منطقهٔ زمانی سالن (شنبه = ۰) */
export function todayIndex(timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(new Date());
  const map: Record<string, number> = { Sat: 0, Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6 };
  return map[parts.slice(0, 3)] ?? 0;
}

function minutesIn(iso: string, timezone: string): number {
  const t = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function toMinutes(hhmm: string): number {
  const [h, m] = String(hhmm).split(":").map((v) => Number(v));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** «21:00» یا «21:00:00» → «۲۱:۰۰» — متن ساعت هم مثل بقیهٔ صفحه با رقم فارسی */
function faTime(hhmm: string): string {
  const [h = "0", m = "0"] = String(hhmm).split(":");
  return faDigits(`${h.padStart(2, "0")}:${m.padStart(2, "0")}`);
}

/**
 * وضعیت «الان باز است؟» — برای چیپ بالای صفحه و کارت ساعات کاری.
 * جمعه/روز تعطیل → بسته؛ خارج از بازه → بسته؛ وگرنه باز.
 */
export function openStatus(
  hours: OpeningHour[],
  timezone: string
): { open: boolean; label: string; todayName: string; detail: string } {
  const idx = todayIndex(timezone);
  const todayName = DAYS_FA[idx] ?? "امروز";
  const row = hours.find((h) => h.dayOfWeek === idx);
  if (!row) return { open: false, label: "ساعت کاری اعلام نشده", todayName, detail: "" };
  if (row.isClosed) return { open: false, label: "امروز تعطیل", todayName, detail: "" };
  const now = minutesIn(new Date().toISOString(), timezone);
  const open = toMinutes(row.openTime);
  const close = toMinutes(row.closeTime);
  const range = `${faTime(row.openTime)} تا ${faTime(row.closeTime)}`;
  if (now < open) return { open: false, label: "هنوز باز نشده", todayName, detail: `ساعت ${faTime(row.openTime)} باز می‌شود` };
  if (now >= close) return { open: false, label: "بسته شده", todayName, detail: range };
  return { open: true, label: "باز است", todayName, detail: `تا ساعت ${faTime(row.closeTime)}` };
}

/** شمارهٔ واتساپ ممکن است عدد خام یا لینک کامل باشد */
export function whatsappHref(value: string): string {
  const v = String(value ?? "").trim();
  if (/^https?:\/\//i.test(v)) return v;
  const digits = v.replace(/[^\d]/g, "");
  if (!digits) return "";
  return `https://wa.me/${digits.startsWith("0") ? `98${digits.slice(1)}` : digits}`;
}

/**
 * اینستاگرام ممکن است کاربر به‌صورت «@handle»، «handle»، «instagram.com/handle»
 * یا لینک کامل ذخیره کرده باشد؛ همه را به یک URL معتبر می‌رسانیم.
 */
export function instagramHref(value: string): string {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  const bare = v.replace(/^@+/, "").replace(/^https?:\/\//i, "");
  // اگر خودش دامنه را داشت، دوباره پیشوند نزن
  if (/^instagram\.com\//i.test(bare)) return `https://${bare}`;
  if (/^instagram\.com$/i.test(bare)) return "https://instagram.com";
  return `https://instagram.com/${bare.replace(/^\/+/, "")}`;
}

export { DAYS_FA };
