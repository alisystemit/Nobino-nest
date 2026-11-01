/* نوبینو — سرویس‌ورکر PWA
 * راهبرد:
 *  - ناوبری (صفحات): اول شبکه؛ در قطعی → نسخهٔ کش‌شدهٔ همان مسیر → صفحهٔ آفلاینِ بدون اسکریپت
 *  - فایل‌های استتیک نسخه‌دار (‎/_next/static/*): کش‌اول
 *  - آیکون/مانیفست/فونت: کش‌اول (با به‌روزرسانی در پس‌زمینه)
 *  - API، درخواست‌های RSC (پیش‌بارگذاری راوتر) و بقیه: اصلاً دخالت نمی‌کنیم؛
 *    خود مرورگر به سرور می‌رود. (دخالت بی‌مورد باعث «Failed to fetch» می‌شد.)
 * فقط پاسخ‌های موفقِ مسیرهای عمومی کش می‌شوند تا صفحهٔ کاربریِ یک کاربر در
 * حافظهٔ مشترک دستگاه نماند.
 */
const CACHE = "nobino-v2";
const PRECACHE = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];
// مسیرهایی که هرگز کش نمی‌شوند (شخصی یا تغییرپذیر)
const NO_STORE = /^(\/dashboard|\/admin|\/api|\/payment|\/pay\/|\/login|\/uploads)/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** پاسخ ساختگیِ آفلاین، وقتی هیچ نسخه‌ای در کش نیست (بدون هیچ اسکریپت خارجی) */
function offlineResponse() {
  const body =
    '<!doctype html><html dir="rtl" lang="fa"><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>آفلاین — نوبینو</title>' +
    '<body style="font-family:Tahoma,Verdana,sans-serif;background:#fafafa;color:#171717;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">' +
    '<main style="max-width:26rem;padding:2rem;text-align:center;background:#fff;border:1px solid #e5e5e5;border-radius:1.5rem;box-shadow:0 10px 30px rgba(0,0,0,.06)">' +
    '<div style="font-size:3rem;line-height:1">📡</div>' +
    '<h1 style="font-size:1.35rem;margin:.9rem 0 0">شما آفلاین هستید</h1>' +
    '<p style="color:#525252;line-height:1.9;margin:.75rem 0 0">اتصال اینترنت برقرار نیست. به‌محض اتصال دوباره، همین صفحه را تازه کنید.</p>' +
    '<button type="button" onclick="location.reload()" style="margin-top:1.25rem;width:100%;padding:.85rem 1rem;border:0;border-radius:.9rem;background:linear-gradient(to left,#db2777,#9333ea);color:#fff;font-size:.95rem;font-weight:700;cursor:pointer">تلاش دوباره</button>' +
    "</main></body></html>";
  return new Response(body, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // پیش‌بارگذاری‌های راوتر نکست (RSC) را دست نمی‌زنیم؛ کش‌کردنشان ناوبری را می‌شکند
  if (req.headers.get("RSC") === "1" || req.headers.has("Next-Router-State-Tree")) return;
  if (url.searchParams.has("_rsc")) return;

  // فایل‌های شخصی (آپلودها و مسیرهای کاربری) در کش دستگاه نمانند
  if (req.mode !== "navigate" && NO_STORE.test(url.pathname)) return;

  // صفحه‌ها: اول شبکه، در قطعی → کش همان مسیر → صفحهٔ آفلاینِ سبک
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok && !NO_STORE.test(url.pathname)) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          // صفحهٔ /offline نیازمند جاوااسکریپت است و در قطعی ممکن است چانک‌هایش لود نشود؛
          // این نسخهٔ بدون اسکریپت همیشه درست نمایش داده می‌شود.
          return offlineResponse();
        }
      })()
    );
    return;
  }

  // فایل‌های استتیک نسخه‌دار: کش‌اول (همیشه یکسان‌اند)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        } catch {
          return Response.error();
        }
      })()
    );
    return;
  }

  // آیکون/فونت/مانیفست/تصویر: کش‌اول + به‌روزرسانی در پس‌زمینه
  if (/\.(png|svg|webp|jpg|jpeg|woff2?|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => null);
        return cached || (await network) || Response.error();
      })()
    );
    return;
  }

  // بقیه (API و ...): بدون دخالت — پاسخ مستقیم از سرور
});
