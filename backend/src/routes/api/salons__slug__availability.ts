// خودکار: پورت‌شده از src/app/api/salons/[slug]/availability/route.ts — بدون تغییر منطق
import { prisma } from "@/lib/prisma";
import { computeFreeSlots } from "@/lib/bookings/availability";
import { combinedBooking } from "@/lib/bookings/service";
import { json } from "@/lib/utils";

/**
 * محاسبه بازه‌های واقعاً آزاد برای یک یا چند خدمت در یک روز.
 * ?date=YYYY-MM-DD&serviceIds=id1,id2&employeeId=...&branchId=...
 * برای سازگاری، پارامتر serviceId هم پذیرفته می‌شود.
 */
export async function GET(req: Request, { params }: { params: { slug: string } | Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const dayISO = url.searchParams.get("date") ?? "";
  const rawIds = url.searchParams.get("serviceIds") ?? url.searchParams.get("serviceId") ?? "";
  const serviceIds = Array.from(
    new Set(
      rawIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    )
  ).slice(0, 8);
  const employeeId = url.searchParams.get("employeeId") || undefined;
  const branchId = url.searchParams.get("branchId") || undefined;

  if (!dayISO || !/^\d{4}-\d{2}-\d{2}$/.test(dayISO)) {
    return json({ success: false, error: "پارامتر تاریخ (date=YYYY-MM-DD) الزامی است" }, { status: 400 });
  }
  if (serviceIds.length === 0) {
    return json({ success: false, error: "انتخاب حداقل یک خدمت الزامی است" }, { status: 400 });
  }

  const salon = await prisma.salon.findUnique({ where: { slug } });
  if (!salon || !salon.isActive) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });

  const services = await prisma.service.findMany({
    where: { id: { in: serviceIds }, salonId: salon.id, isActive: true },
  });
  if (services.length !== serviceIds.length) {
    return json({ success: false, error: "یکی از خدمت‌ها یافت نشد یا غیرفعال است" }, { status: 404 });
  }

  // آرایشگر باید متعلق به همین سالن باشد و (در صورت تعریف) همه خدمات را ارائه دهد
  if (employeeId) {
    const staff = await prisma.staff.findUnique({
      where: { id: employeeId },
      include: { services: { select: { id: true } } },
    });
    if (!staff || staff.salonId !== salon.id || !staff.isActive) {
      return json({ success: false, error: "آرایشگر یافت نشد" }, { status: 404 });
    }
    const offered = staff.services.map((s) => s.id);
    if (offered.length > 0 && serviceIds.some((id) => !offered.includes(id))) {
      return json(
        { success: false, error: "این آرایشگر همه خدمات انتخاب‌شده را ارائه نمی‌دهد" },
        { status: 400 }
      );
    }
  }

  if (branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { salonId: true } });
    if (!branch || branch.salonId !== salon.id) {
      return json({ success: false, error: "شعبه یافت نشد" }, { status: 404 });
    }
  }

  const slots = await computeFreeSlots({ salon, services, employeeId, branchId, dayISO });
  const totals = combinedBooking(services);

  return json({
    success: true,
    day: dayISO,
    timezone: salon.timezone || "Asia/Tehran",
    services: services.map((s) => ({ id: s.id, name: s.name, durationMin: s.durationMin, price: s.price })),
    totals,
    slots: slots.map((s) => ({
      startAt: s.startAt.toISOString(),
      endAt: s.endAt.toISOString(),
    })),
  });
}
