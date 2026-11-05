/**
 * محافظت از هدف وب‌هوک (SSRF).
 *
 * آدرس وب‌هوک را سالن‌دار می‌دهد و سرور خودشان آن را صدا می‌زند؛ بدون این چک
 * یک حساب سالن‌دار می‌تواند سرور را وادار کند به آدرس حلقهٔ بازگشتی،
 * شبکهٔ داخلی دیتاسنتر یا متادیتای ابری (`169.254.169.254`) درخواست بفرستد.
 *
 * Important: this block never depends on NODE_ENV. Deployed processes usually
 * have NODE_ENV unset, so any "development escape hatch" would silently open
 * the server-side-request hole in production. The only opt-out is the explicit
 * `ALLOW_LOCAL_WEBHOOKS=true|1` env var, and it unlocks loopback only —
 * link-local / metadata / private ranges stay blocked even then.
 */
import { httpError } from "@/lib/utils";

/** راه‌آهن صریح محلی: فقط با ALLOW_LOCAL_WEBHOOKS=true|1 */
export function localWebhooksAllowed(): boolean {
  const raw = (process.env.ALLOW_LOCAL_WEBHOOKS ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1";
}

const PRIVATE_V4: Array<[RegExp, string]> = [
  [/^10\./, "10.0.0.0/8"],
  [/^127\./, "127.0.0.0/8"],
  [/^169\.254\./, "169.254.0.0/16"],
  [/^192\.168\./, "192.168.0.0/16"],
  [/^0\./, "0.0.0.0/8"],
  [/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, "100.64.0.0/10"],
];

const PRIVATE_V6: Array<[RegExp, string]> = [
  [/^f[cd][0-9a-f]{2}:/i, "fc00::/7"],
  [/^fe[89ab][0-9a-f]:/i, "fe80::/10"],
  [/^::ffff:127\./i, "127.0.0.0/8"],
  [/^::$/, "::"],
];

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "metadata.google.internal", "metadata"]);

function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return h.startsWith("127.") || h === "::1" || h === "localhost" || h.startsWith("::ffff:127.");
}

/** `null` یعنی مقصد عمومی است؛ وگرنه توضیح بازهٔ داخلی برگردانده می‌شود */
function privateRangeLabel(host: string): string | null {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (isLoopbackHost(h)) return localWebhooksAllowed() ? null : "127.0.0.0/8";
  if (BLOCKED_HOSTNAMES.has(h)) return `host:${h}`;
  if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) return `host:${h}`;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    for (const [re, label] of PRIVATE_V4) {
      if (re.test(h)) return label;
    }
    return null;
  }
  if (h.includes(":")) {
    for (const [re, label] of PRIVATE_V6) {
      if (re.test(h)) return label;
    }
  }
  return null;
}

const BLOCK_REASONS: Record<string, string> = {
  "10.0.0.0/8": "شبکهٔ خصوصی 10.0.0.0/8",
  "127.0.0.0/8": "آدرس حلقهٔ بازگشتی 127.0.0.0/8",
  "169.254.0.0/16": "پیوند-محلی و متادیتای ابری 169.254.0.0/16",
  "192.168.0.0/16": "شبکهٔ خصوصی 192.168.0.0/16",
  "0.0.0.0/8": "آدرس نامشخص 0.0.0.0/8",
  "100.64.0.0/10": "شبکهٔ مشترک 100.64.0.0/10",
  "fc00::/7": "شبکهٔ خصوصی IPv6 fc00::/7",
  "fe80::/10": "پیوند-محلی IPv6 fe80::/10",
  "::": "آدرس نامشخص IPv6 ::",
};

function describeBlock(label: string): string {
  if (label.startsWith("host:")) return `نام میزبان داخلی «${label.slice(5)}»`;
  return BLOCK_REASONS[label] ?? `مقصد داخلی (${label})`;
}

/**
 * بررسی یک آدرس وب‌هوک. فقط https برای مقصد عمومی؛ http تنها وقتی مجاز است
 * که مقصد حلقهٔ بازگشتی باشد و `ALLOW_LOCAL_WEBHOOKS` صریحاً روشن شده باشد.
 */
function inspect(rawUrl: string): { url?: URL; error?: string; blocked?: string | null } {
  let url: URL;
  try {
    url = new URL(String(rawUrl ?? ""));
  } catch {
    return { error: "آدرس وب‌هوک معتبر نیست (باید با http:// یا https:// شروع شود)." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { error: "وب‌هوک فقط می‌تواند به http یا https ارسال شود." };
  }
  if (url.username || url.password) {
    return { error: "اعتبارنامهٔ داخل آدرس وب‌هوک پذیرفته نمی‌شود." };
  }
  const loopback = isLoopbackHost(url.hostname);
  if (url.protocol === "http:" && !(loopback && localWebhooksAllowed())) {
    return { error: "آدرس وب‌هوک باید https باشد تا امضا و دادهٔ نوبت‌ها روی شبکه رمزنگاری بماند." };
  }
  const label = privateRangeLabel(url.hostname);
  return { url, blocked: label };
}

/** برای مسیر ارسال: `null` یعنی مقصد قابل ارسال است، وگرنه دلیلش برمی‌گردد */
export function isWebhookTargetAllowed(rawUrl: string): string | null {
  const { error, blocked } = inspect(rawUrl);
  if (error) return error;
  if (blocked) return describeBlock(blocked);
  return null;
}

export function assertWebhookUrl(rawUrl: string): string {
  const { url, error, blocked } = inspect(rawUrl);
  if (error) throw httpError(error, 400);
  if (blocked) throw httpError(`ارسال وب‌هوک به مقصد داخلی مجاز نیست (${describeBlock(blocked)}).`, 400);
  return url!.toString();
}

/** مقدار نمایشی راز برای پاسخ GET (راز خام هرگز به مرورگر برنمی‌گردد) */
export function maskSecret(secret: string | null | undefined): string | null {
  const s = String(secret ?? "");
  if (!s) return null;
  if (s.length <= 8) return "••••••••";
  return `${s.slice(0, 3)}…${s.slice(-2)} — ${s.length} کاراکتر`;
}
