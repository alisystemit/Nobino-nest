/**
 * تایپ‌های دادهٔ مینی‌اپ — دقیقاً همان شكلی که endpoint های `/api/mini/*` و
 * `/api/salons/*` برمی‌گردانند (بدون تبدیل یا field mapping اضافه).
 */

export type MiniSalon = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  address: string | null;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  coverColor: string | null;
  rating: number | null;
  reviewCount: number;
};

export type MiniService = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  description?: string | null;
};

export type MiniSalonDetail = {
  id: string;
  slug: string;
  name: string;
  phone: string | null;
  city: string | null;
  address: string | null;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  coverColor: string | null;
  services: MiniService[];
  hours: { dayOfWeek: number; openTime: string; closeTime: string; isClosed?: boolean }[];
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
