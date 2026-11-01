# API موبایل — Nobino

این مستند نحوهٔ استفاده از بک‌اند Nobino در نرم‌افزارهای موبایل (Android / iOS / React Native) را توضیح می‌دهد.

## ۱) آدرس پایه (Base URL)

| محیط | آدرس |
|------|------|
| توسعهٔ محلی | `http://localhost:3100` |
| پروداکشن | «`https://api.nobino.ir`» (جایگزین شود) |

> همهٔ مسیرها با `/api` شروع می‌شوند. مثال: `POST /api/auth/otp/request`

---

## ۲) احراز هویت (Authentication)

### ۲.۱ — ورود با کد پیامک (OTP)

**مرحله ۱: درخواست کد**

```
POST /api/auth/otp/request
Content-Type: application/json

{ "phone": "09120000000" }
```

پاسخ: `{ "success": true, "expiresIn": 300 }` (کد به SMS ارسال می‌شود؛ در حالت توسعه در لاگ سرور نیز نمایش داده می‌شود).

**مرحله ۲: تأیید کد و دریافت توکن**

```
POST /api/auth/otp/verify
Content-Type: application/json

{ "phone": "09120000000", "code": "1234" }
```

پاسخ موفق (برای همهٔ کاربران به‌جز ادمینی که رمز دارد):

```json
{
  "success": true,
  "token": "<JWT>",
  "user": { "id": "...", "phone": "09120000000", "name": null, "role": "CUSTOMER" }
}
```

اگر پاسخ شامل `"requiresPassword": true` بود (ادمین)، ادامهٔ ورود از مسیر رمز عبور انجام می‌شود (بخش ۲.۲).

### ۲.۲ — ورود با رمز عبور (ایمیل یا شماره)

```
POST /api/auth/password/login
Content-Type: application/json

{ "login": "admin@nobino.ir", "password": "Admin@1234" }
```

پاسخ موفق دقیقاً مانند بالا است: `{ "success": true, "token": "…", "user": {…} }`.

### ۲.۳ — ورود سوپرادمین (پنل مدیریت)

```
POST /api/admin/auth/login
Content-Type: application/json

{ "email": "admin@nobino.ir", "password": "Admin@1234" }
```

پاسخ موفق: `{ "success": true, "token": "…", "user": {…} }`.

### ۲.۴ — ورود با ایمیل (اختیاری)

```
POST /api/auth/email/request   → { "email": "…" }
POST /api/auth/email/verify    → { "email": "…", "code": "1234" }
```

پاسخ verify نیز شامل `token` است.

---

## ۳) فراخوانی APIهای محافظت‌شده

توکن دریافتی را ذخیره کنید و در **هر** درخواست محافظت‌شده در هدر زیر بفرستید:

```
Authorization: Bearer <JWT>
```

مثال — دریافت پروفایل کاربر جاری:

```
GET /api/auth/me
Authorization: Bearer <JWT>
```

پاسخ: `{ "success": true, "user": { "id": "…", "phone": "…", "name": "…", "role": "…", "email": "…" } }`

### نکات
- توکن اعتبار **۷ روز** دارد (`JWT_EXPIRES_IN`).
- در صورت دریافت `401`، توکن منقضی یا ابطال شده است؛ دوباره ورود انجام دهید.
- مکانیزم نشست در سمت سرور سنجیده می‌شود (نه فقط JWT)، بنابراین خروج/ابطال واقعی است.

---

## ۴) خروج (Logout)

برای ابطال نشست و نامعتبر کردن توکن:

```
POST /api/auth/logout
Authorization: Bearer <JWT>
```

پاسخ: `{ "success": true }` — پس از آن توکن دیگر معتبر نیست و تمام درخواست‌های بعدی با این توکن `401` می‌گیرند.

---

## ۵) نمونهٔ پیاده‌سازی (React Native / JS)

```js
const API = "http://localhost:3100";

async function loginWithOtp(phone, code) {
  const res = await fetch(`${API}/api/auth/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code }),
  });
  const data = await res.json();
  if (data.success) {
    await SecureStore.setItemAsync("token", data.token); // ذخیرهٔ امن
  }
  return data;
}

async function api(path, options = {}) {
  const token = await SecureStore.getItemAsync("token");
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    // توکن نامعتبر → به صفحهٔ ورود برگرد
  }
  return res.json();
}

// مثال: دریافت پروفایل
await api("/api/auth/me");

// مثال: خروج
await api("/api/auth/logout", { method: "POST" });
```

---

## ۶) دسته‌بندی اصلی اندپوینت‌ها

| گروه | نمونه مسیرها |
|------|--------------|
| احراز هویت | `/api/auth/otp/request`، `/api/auth/otp/verify`، `/api/auth/password/login`، `/api/auth/me`، `/api/auth/logout` |
| سالن‌ها (عمومی) | `/api/salons`، `/api/salons/search`، `/api/salons/:slug`، `/api/salons/:slug/availability` |
| نوبت‌ها | `/api/appointments`، `/api/appointments/hold`، `/api/appointments/:id/cancel` |
| رزرو/محبوب‌ها | `/api/favorites`، `/api/favorites/:salonId` |
| اعلان‌ها | `/api/notifications` |
| کیف پول | `/api/wallet` |
| پرداخت | `/api/payments/create`، `/api/payments/gateways` |
| داشبورد مالک سالن | `/api/dashboard/salons/:id/services`، `/api/dashboard/salons/:id/appointments`، ... |
| ادمین (سوپرادمین) | `/api/admin/*` |

> لیست کامل مسیرها در `backend/src/routes/manifest.json` موجود است.

---

## ۷) ملاحظات امنیتی

- توکن را در **ذخیره‌گاه امن** (Keychain / Keystore) نگه دارید، نه در AsyncStorage ساده.
- در پروداکشن حتماً از `HTTPS` و تنظیم `APP_URL` مناسب استفاده کنید.
- نقش‌ها: `CUSTOMER`، `AGENT`، `SALON_OWNER`، `ADMIN`. دسترسی به هر اندپوینت بر اساس نقش سمت سرور کنترل می‌شود.
