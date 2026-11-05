/**
 * تایپ‌های دادهٔ مینی‌اپ — دقیقاً همان شكلی که endpoint های `/api/mini/*` و
 * `/api/salons/*` برمی‌گردانند (بدون تبدیل یا field mapping اضافه).
 * مینی‌اپ سالن‌محور است، پس شكل «ردیف فهرست سالن‌ها» اینجا تعریف نشده.
 */

export type MiniService = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  description?: string | null;
  category?: string | null;
  createdAt?: string;
};

export type MiniSalonDetail = {
  id: string;
  slug: string;
  name: string;
  /** بینندهٔ لاگین‌شده، مدیر همین سالن است → فرم رزرو مشتری نمایش داده نمی‌شود */
  isOwnerViewer?: boolean;
  phone: string | null;
  city: string | null;
  address: string | null;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  coverColor: string | null;
  salonType?: string | null;
  timezone?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  website?: string | null;
  mapUrl?: string | null;
  neshanUrl?: string | null;
  baladUrl?: string | null;
  services: MiniService[];
  hours: { dayOfWeek: number; openTime: string; closeTime: string; isClosed?: boolean }[];
  gallery?: { id: string; title: string | null; imageUrl: string; type: string }[];
};

export type MiniStaff = {
  id: string;
  name: string;
  title: string;
  avatarUrl: string;
  specialties: string[];
  bio: string;
  branchId: string;
  serviceIds: string[];
  rating: number | null;
  reviewCount: number;
};

export type MiniSlot = { startAt: string; endAt: string };

export type AvailabilityResponse = {
  success: boolean;
  error?: string;
  day: string;
  timezone: string;
  /** C14: بیعانهٔ نوبت با همین خدمات (null یعنی بیعانه‌ای گرفته نمی‌شود) */
  depositAmount?: number | null;
  services: MiniService[];
  totals: { durationMin: number; bufferMin: number; price: number };
  slots: MiniSlot[];
};

export type MiniAppointment = {
  id: string;
  customerName: string;
  customerPhone: string;
  startAt: string;
  endAt: string;
  status: string;
  channel: string;
  service?: string | null;
  serviceId?: string | null;
  servicePrice?: number | null;
  salonId: string;
  salonName?: string | null;
  salonSlug?: string | null;
  salonTimezone?: string | null;
  employee?: string | null;
  employeeId?: string | null;
  note?: string | null;
  depositAmount?: number | null;
  depositPaid?: boolean | null;
};

export type MiniReview = {
  id: string;
  rating: number;
  comment: string | null;
  customerName: string;
  staff: string | null;
  createdAt: string;
};

export type DashboardStats = {
  hasSalon?: boolean;
  salonId?: string;
  slug?: string;
  total?: number;
  today?: number;
  pending?: number;
  balance?: number;
  salons?: number;
  customers?: number;
  orders?: number;
  revenue?: number;
};

/* ── اطلاعیه‌های داخل‌برنامه‌ای (payload.message) ─────────────────── */

export type MiniNotification = {
  id: string;
  type: string;
  channel: string;
  status: string;
  readAt: string | null;
  createdAt: string;
  payload?: { message?: string } | null;
};

export const NOTIFICATION_TITLE: Record<string, string> = {
  APPOINTMENT_CONFIRM: "نوبت ثبت شد",
  APPOINTMENT_CHANGED: "تغییر وقت نوبت",
  APPOINTMENT_CANCELLED: "لغو نوبت",
  APPOINTMENT_STATUS: "وضعیت نوبت",
  REMINDER: "یادآوری نوبت",
  CANCEL: "لغو نوبت",
  OTP: "کد ورود",
  SUBSCRIPTION: "اشتراک سالن",
};

/* ── کیف پول ─────────────────────────────────────────────────────── */

export type WalletTransaction = {
  id: string;
  kind: string;
  reason: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  /** سرور با toJalali قالب‌بندی می‌کند؛ متن آمادهٔ نمایش است، نه ISO */
  createdAt: string;
};

export type WalletView = {
  balance: number;
  currency: string;
  transactions: WalletTransaction[];
  transactionsTotal: number;
  totalPages: number;
  summary?: Record<string, number>;
};

export const WALLET_KIND_FA: Record<string, string> = { CREDIT: "واریزی", DEBIT: "برداشت" };

export const WALLET_REASON_FA: Record<string, string> = {
  PACKAGE_PURCHASE: "خرید بسته",
  COMMISSION_EARNING: "کمیسیون",
  COMMISSION_PAYOUT: "تسویه کمیسیون",
  PAYOUT: "درخواست تسویه",
  REFUND: "بازگشت وجه",
  ADMIN_ADJUSTMENT: "تصحیح اپراتور",
};

/* ── بخش مدیریت سالن ────────────────────────────────────────────── */

export type SalonServiceRow = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  category: string | null;
  description: string | null;
  isActive: boolean;
  branchId?: string | null;
  bufferMin?: number | null;
};

export type SalonCustomerRow = {
  id?: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  completed: number;
  cancelled: number;
  noShow: number;
  spend: number;
  lastVisit: string | null;
  note?: string | null;
  tags?: string[];
  mediaCount?: number;
  notesCount?: number;
};

/** یادداشت پروندهٔ مشتری (سالن → مشتری) */
export type CustomerNoteRow = { id: string; note: string; createdAt: string };

/** عکس یا ویس ضمیمهٔ پروندهٔ مشتری */
export type CustomerMediaRow = {
  id: string;
  type: "photo" | "voice";
  url: string;
  name?: string | null;
  mimeType?: string | null;
  size?: number;
  createdAt: string;
};

/** پاسخ GET /api/dashboard/salons/:id/customers/:customerId */
export type CustomerProfile = {
  success: boolean;
  error?: string;
  notes?: CustomerNoteRow[];
  media?: CustomerMediaRow[];
  noteLimit?: number;
  mediaLimit?: number;
  photoMaxMb?: number;
  voiceMaxMb?: number;
  mediaEnabled?: boolean;
};

export type CashTotals = { cash: number; card: number; online: number; expense: number; net: number };

export type RevenueSeries = { labels: string[]; appointments: number[]; revenue: number[]; cancelled: number[] };

export type FinancialReport = {
  from: string;
  to: string;
  totalAppointments: number;
  completed: number;
  cancelled: number;
  requested: number;
  revenue: number;
  revenueLabel: string;
  potentialRevenue: number;
  paidSubscriptions: number;
  paidSubscriptionsLabel: string;
  topServices: { name: string; count?: number; revenue?: number }[];
};

export type ReminderItem = {
  id: string;
  customerName: string;
  customerPhone: string;
  startAt: string;
  status: string;
  problem: string | null;
  windows: { window: string; status: string }[];
};

/* ── تیکت پشتیبانی ──────────────────────────────────────────────── */

export type SupportTicket = {
  id: string;
  subject: string;
  category: string;
  message: string;
  priority: string;
  status: string;
  createdAt: string;
  adminReply?: string | null;
  repliedAt?: string | null;
};

export const TICKET_STATUS_FA: Record<string, string> = {
  OPEN: "باز",
  IN_PROGRESS: "در حال بررسی",
  CLOSED: "بسته شده",
};

export const SUPPORT_CATEGORY_FA: Record<string, string> = {
  GENERAL: "عمومی",
  BOOKING: "نوبت و رزرو",
  PAYMENT: "پرداخت و مالی",
  TECHNICAL: "فنی",
  COMPLAINT: "شکایت",
};
