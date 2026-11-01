/**
 * برچسب‌های فارسی لاگ حسابرسی — نگاشت کدهای انگلیسیِ ذخیره‌شده در دیتابیس به
 * توضیح فارسیِ کامل و شفاف برای پنل ادمین.
 */

const ACTION_LABELS: Record<string, string> = {
  change_salon_status: 'تغییر وضعیت سالن (تأیید/فعال‌سازی)',
  approve_salon: 'تأیید سالن',
  suspend_salon: 'تعلیق سالن',
  update_user: 'ویرایش نقش/وضعیت کاربر',
  delete_review: 'حذف نظر مشتری',
  reply_review: 'پاسخ به نظر مشتری',
  delete_review_reply: 'حذف پاسخِ نظر',
  support_ticket_update: 'به‌روزرسانی تیکت پشتیبانی',
  create_package: 'ایجاد پلن قیمتی',
  update_package: 'ویرایش پلن قیمتی',
  deactivate_package: 'غیرفعال‌کردن پلن قیمتی',
  delete_package: 'حذف پلن قیمتی',
  force_delete_package: 'حذف قطعی پلن قیمتی',
  update_plan_limits: 'تغییر محدودیت‌های پلن‌ها',
  create_discount: 'ایجاد کد تخفیف',
  update_discount: 'ویرایش کد تخفیف',
  delete_discount: 'حذف کد تخفیف',
  broadcast: 'ارسال پیامک سراسری',
  notification_retry: 'تلاش مجدد برای پیامک‌های ناموفق',
  settings_update: 'تغییر تنظیمات سیستم',
  support_login: 'ورود پشتیبانی',
  subscription_extend: 'افزایش مدت اشتراک',
  subscription_activate: 'فعال‌سازی اشتراک',
  subscription_suspend: 'تعلیق اشتراک',
  subscription_cancel: 'لغو اشتراک',
  subscription_set_auto_renew: 'تغییر تمدید خودکار',
};

const ENTITY_LABELS: Record<string, string> = {
  Salon: 'سالن',
  User: 'کاربر',
  Review: 'نظر مشتری',
  SupportTicket: 'تیکت پشتیبانی',
  Package: 'پلن قیمتی',
  Discount: 'کد تخفیف',
  Notification: 'پیامک',
  Setting: 'تنظیمات سیستم',
  System: 'کل سیستم',
  Appointment: 'نوبت',
  Subscription: 'اشتراک',
};

const FIELD_LABELS: Record<string, string> = {
  role: 'نقش کاربر',
  isActive: 'فعال بودن',
  isApproved: 'تأیید شده',
  status: 'وضعیت',
  priority: 'اولویت',
  replied: 'پاسخ داده شد',
  reply: 'متن پاسخ',
  repliedAt: 'زمان پاسخ',
  rating: 'امتیاز',
  comment: 'متن نظر',
  salonId: 'شناسهٔ سالن',
  salonName: 'نام سالن',
  staffId: 'شناسهٔ آرایشگر',
  customerId: 'شناسهٔ مشتری',
  appointmentId: 'شناسهٔ نوبت',
  audience: 'مخاطبان',
  recipients: 'تعداد گیرندگان',
  code: 'کد تخفیف',
  percent: 'درصد تخفیف',
  amount: 'مبلغ',
  name: 'نام',
  title: 'عنوان',
  price: 'قیمت',
  plan: 'پلن',
  key: 'کلید تنظیم',
  value: 'مقدار',
  saved: 'تعداد ذخیره‌شده',
  reset: 'تعداد ریست‌شده',
  processed: 'تعداد پردازش‌شده',
  sent: 'تعداد ارسال موفق',
  failed: 'تعداد ناموفق',
  attempts: 'تعداد تلاش',
  lastError: 'آخرین خطا',
  slug: 'آدرس (slug)',
  city: 'شهر',
  phone: 'تلفن',
  email: 'ایمیل',
  durationMin: 'مدت (دقیقه)',
  maxAdvanceDays: 'حداکثر روز رزرو پیشاپیش',
  maxBranches: 'حداکثر شعبه',
  maxStaff: 'حداکثر کارکنان',
};

const VALUE_LABELS: Record<string, string> = {
  ADMIN: 'مدیر کل',
  SALON_OWNER: 'مالک سالن',
  AGENT: 'نماینده',
  CUSTOMER: 'مشتری',
  STYLIST: 'آرایشگر',
  PENDING: 'در انتظار',
  SENT: 'ارسال شد',
  DELIVERED: 'تحویل شد',
  FAILED: 'ناموفق',
  OPEN: 'باز',
  IN_PROGRESS: 'در حال بررسی',
  RESOLVED: 'حل شده',
  CLOSED: 'بسته‌شده',
  ACTIVE: 'فعال',
  TRIAL: 'آزمایشی',
  CANCELLED: 'لغو شده',
  EXPIRED: 'منقضی شده',
  PAID: 'پرداخت‌شده',
  VERIFIED: 'تأیید دامنه شده',
  NONE: 'هیچ',
  HIGH: 'بالا',
  NORMAL: 'عادی',
  LOW: 'پایین',
  URGENT: 'فوری',
  ALL_SALONS: 'همهٔ سالن‌های فعال',
  SALON_OWNERS: 'همهٔ مالکان سالن',
  ACTIVE_SUBS: 'مشترکین فعال',
};

export function describeAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function describeEntity(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
}

export function describeField(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'بله' : 'خیر';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    const enumFa = VALUE_LABELS[value];
    if (enumFa) return `${enumFa} (${value})`;
    return value.length > 120 ? `${value.slice(0, 120)}…` : value;
  }
  try {
    const json = JSON.stringify(value);
    return json.length > 160 ? `${json.slice(0, 160)}…` : json;
  } catch {
    return '—';
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export type AuditDiffRow = { key: string; label: string; from: string; to: string };

export function diffAudit(before: unknown, after: unknown): AuditDiffRow[] {
  const b = isPlainObject(before) ? before : {};
  const a = isPlainObject(after) ? after : {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !['id', 'createdAt', 'updatedAt'].includes(k));
  const rows: AuditDiffRow[] = [];
  for (const key of keys) {
    const bv = key in b ? b[key] : undefined;
    const av = key in a ? a[key] : undefined;
    const same = JSON.stringify(bv ?? null) === JSON.stringify(av ?? null);
    if (same) continue;
    rows.push({ key, label: describeField(key), from: formatAuditValue(bv), to: formatAuditValue(av) });
  }
  return rows;
}

export function hasAuditDetails(before: unknown, after: unknown): boolean {
  return (before !== null && before !== undefined) || (after !== null && after !== undefined);
}
