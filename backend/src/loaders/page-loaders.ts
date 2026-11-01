/**
 * دیتای صفحات (page-data) — معادل دقیق کاری که Server Componentها در نسخهٔ Next
 * قبل از رندر انجام می‌دادند. هر لودر یک شیء JSON-serializable برمی‌گرداند و
 * توسط PagesController زیر مسیر /api/pages/<name> سرو می‌شود.
 *
 * laderهایی که به کاربر نیاز دارند getCurrentUser را صدا می‌زنند؛ این تابع از
 * cookies() لایهٔ سازگاری (ALS) استفاده می‌کند، پس اجرا حتماً باید داخل
 * runRoute انجام شود.
 */
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/guards";
import { httpError } from "@/lib/utils";
import { SITE_URL } from "@/lib/site";
import { loadAgenda } from "@/lib/appointments/agenda";
import { listOwnerSalons, resolveDashboardSalonId } from "@/lib/salons";
import { getPlanLimitsForPlan, limitSnapshot, normalizePlan } from "@/lib/plans/limits";
import { resolveFeatures } from "@/lib/plans/modules";

type Loader = (url: URL) => Promise<unknown>;

const q = (url: URL, key: string) => url.searchParams.get(key) ?? undefined;

/* ------------------------------------------------------------------ home */

async function loadHome() {
  const salons = await prisma.salon.findMany({
    where: { isApproved: true, isActive: true },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      address: true,
      description: true,
      coverColor: true,
      bannerUrl: true,
      services: { where: { isActive: true }, take: 3, select: { name: true, price: true } },
    },
  });
  const [activeSalons, totalAppointments, customerCount, avgRatingAgg, reviewCount] = await Promise.all([
    prisma.salon.count({ where: { isApproved: true, isActive: true } }),
    prisma.appointment.count(),
    prisma.user.count({ where: { role: "CUSTOMER" } }),
    prisma.review.aggregate({ _avg: { rating: true } }),
    prisma.review.count(),
  ]);
  const salonIds = salons.map((s) => s.id);
  const ratings = salonIds.length
    ? await prisma.review.groupBy({
        by: ["salonId"],
        where: { salonId: { in: salonIds } },
        _avg: { rating: true },
        _count: { _all: true },
      })
    : [];
  const ratingMap = Object.fromEntries(
    ratings.map((r) => [r.salonId, { avg: r._avg.rating, count: r._count._all }]),
  );

  const activePackages = await prisma.package.findMany({
    where: { isActive: true },
    orderBy: { price: "asc" },
    take: 3,
  });
  const packages = await Promise.all(
    activePackages.map(async (p) => ({
      ...p,
      featureList: resolveFeatures(p.features, await getPlanLimitsForPlan(normalizePlan(p.plan))),
    })),
  );

  return {
    salons,
    ratingMap,
    stats: {
      activeSalons,
      totalAppointments,
      customerCount,
      avgRating: avgRatingAgg._avg.rating,
      reviewCount,
    },
    packages,
  };
}

/* ------------------------------------------------------------- salon seo */

/** متادیتا + JSON-LD صفحهٔ عمومی سالن (معادل generateMetadata و jsonLd نسخهٔ Next) */
async function buildSalonSeo(slug: string) {
  const salon = await prisma.salon.findUnique({ where: { slug } });
  if (!salon) return null;
  const title = `${salon.name}${salon.city ? ` — آرایشگاه در ${salon.city}` : ""}`;
  const description =
    salon.description ??
    `رزرو آنلاین نوبت ${salon.name}${salon.city ? ` در ${salon.city}` : ""}؛ مشاهده خدمات، قیمت‌ها، آرایشگران و زمان‌های آزاد.`;
  const images = [salon.bannerUrl, salon.logoUrl].filter((u): u is string => Boolean(u));
  return {
    title,
    description,
    canonical: `/s/${salon.slug}`,
    images,
    noindex: !(salon.isApproved && salon.isActive),
  };
}

/* ---------------------------------------------------------------- salon */

async function loadSalon(url: URL) {
  const slug = q(url, "slug") ?? "";
  const salon = await prisma.salon.findUnique({
    where: { slug },
    include: {
      services: { where: { isActive: true } },
      galleryItems: { orderBy: { sortOrder: "asc" } },
      openingHours: true,
      staff: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          title: true,
          bio: true,
          avatarUrl: true,
          specialties: true,
          branchId: true,
          services: { select: { id: true } },
        },
      },
      branches: { where: { isActive: true }, select: { id: true, name: true, city: true, address: true } },
    },
  });
  if (!salon || !salon.isActive || !salon.isApproved) return { found: false };

  const [reviews, reviewAgg] = await Promise.all([
    prisma.review.findMany({
      where: { salonId: salon.id },
      include: { customer: { select: { name: true } }, staff: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.review.aggregate({ where: { salonId: salon.id }, _avg: { rating: true }, _count: { _all: true } }),
  ]);
  const averageRating = Number((reviewAgg._avg.rating ?? 0).toFixed(1));
  const reviewCount = reviewAgg._count._all;

  const schemaDays = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const siteUrl = SITE_URL;
  const salonUrl = `${siteUrl.replace(/\/$/, "")}/s/${salon.slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HairSalon",
    name: salon.name,
    description: salon.description ?? undefined,
    url: salonUrl,
    telephone: salon.phone || undefined,
    image: [salon.bannerUrl, salon.logoUrl].filter(Boolean),
    priceRange: salon.services.length
      ? `${Math.min(...salon.services.map((s) => s.price)).toLocaleString("fa-IR")} تا ${Math.max(
          ...salon.services.map((s) => s.price),
        ).toLocaleString("fa-IR")} تومان`
      : undefined,
    address: {
      "@type": "PostalAddress",
      addressLocality: salon.city ?? undefined,
      streetAddress: salon.address ?? undefined,
      addressCountry: "IR",
    },
    openingHoursSpecification: salon.openingHours
      .filter((h) => !h.isClosed)
      .map((h) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: `https://schema.org/${schemaDays[h.dayOfWeek] ?? "Saturday"}`,
        opens: h.openTime,
        closes: h.closeTime,
      })),
    makesOffer: salon.services.map((s) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: s.name, description: s.description ?? undefined },
      price: s.price,
      priceCurrency: "IRR",
    })),
    ...(reviewCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: averageRating,
            reviewCount,
            bestRating: 5,
            worstRating: 1,
          },
          review: reviews.slice(0, 5).map((r) => ({
            "@type": "Review",
            author: { "@type": "Person", name: r.customer.name ?? "مشتری" },
            reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5 },
            reviewBody: r.comment ?? undefined,
            datePublished: r.createdAt.toISOString().slice(0, 10),
          })),
        }
      : {}),
  };

  return { found: true, salon, reviews, averageRating, reviewCount, jsonLd, meta: await buildSalonSeo(slug) };
}

/* ------------------------------------------------------------- wa-salon */

async function loadWaSalon(url: URL) {
  const slug = q(url, "slug") ?? "";
  const salon = await prisma.salon.findUnique({
    where: { slug },
    include: {
      services: { where: { isActive: true } },
      staff: { where: { isActive: true }, select: { id: true, name: true, title: true } },
      branches: { where: { isActive: true }, select: { id: true, name: true, city: true } },
    },
  });
  if (!salon || !salon.isActive) return { found: false };
  return { found: true, salon };
}

/* ----------------------------------------------------------- pay-invoice */

async function loadPayInvoice(url: URL) {
  const token = q(url, "token") ?? "";
  const invoice = await prisma.invoice.findUnique({
    where: { payToken: token },
    select: {
      id: true,
      number: true,
      kind: true,
      amount: true,
      description: true,
      customerName: true,
      status: true,
      issuedAt: true,
      dueAt: true,
      paidAt: true,
      salon: { select: { name: true, city: true, slug: true } },
    },
  });
  if (!invoice) return { found: false };
  const paid = invoice.status === "PAID";
  const expired = !paid && !!invoice.dueAt && new Date(invoice.dueAt) < new Date();
  return { found: true, invoice, paid, expired };
}

/* ---------------------------------------------------------------- agenda */

async function loadAgendaPage(url: URL) {
  const user = await getCurrentUser();
  if (!user) return { redirect: "/login" };
  const agenda = await loadAgenda(user, { date: q(url, "date") ?? null, salon: q(url, "salon") ?? null });
  return { agenda };
}

/* -------------------------------------------------------- new-appointment */

async function loadNewAppointment() {
  const user = await getCurrentUser();
  if (!user) return { redirect: "/login" };
  if (user.role !== "SALON_OWNER" && user.role !== "ADMIN") return { redirect: "/dashboard" };
  const salon = await prisma.salon.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, timezone: true },
  });
  if (!salon) return { redirect: "/dashboard/salon" };
  return { salon };
}

/* ---------------------------------------------------------- voice-booking */

async function loadVoiceBooking() {
  const user = await getCurrentUser();
  if (!user) return { redirect: "/login" };
  if (user.role !== "SALON_OWNER" && user.role !== "ADMIN") return { redirect: "/dashboard" };
  const salon = await prisma.salon.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      timezone: true,
      branches: { where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } },
    },
  });
  if (!salon) return { redirect: "/dashboard/salon" };
  const myStaff = await prisma.staff.findFirst({
    where: { salonId: salon.id, userId: user.id, branchId: { not: null } },
    select: { branchId: true },
  });
  const autoBranchId = myStaff?.branchId ?? salon.branches[0]?.id ?? null;
  return { salon, autoBranchId };
}

/* --------------------------------------------------------- dashboard-salon */

async function loadDashboardSalon(url: URL) {
  const user = await getCurrentUser();
  if (!user) return { redirect: "/login" };
  if (user.role !== "SALON_OWNER" && user.role !== "ADMIN") return { redirect: "/dashboard" };

  const sp = { salon: q(url, "salon") ?? null, new: q(url, "new") ?? null };
  const mySalons = await listOwnerSalons(user.id);

  if (sp.new === "1" && mySalons.length > 0) return { mode: "create" as const, mySalons };

  const salonId = await resolveDashboardSalonId(user.id, sp.salon, user.role === "ADMIN");
  if (!salonId) return { mode: "create" as const, mySalons };

  const salon = await prisma.salon.findUnique({
    where: { id: salonId },
    include: { services: true, _count: { select: { appointments: true, galleryItems: true, reviews: true } } },
  });
  if (!salon) return { mode: "create" as const, mySalons };

  const snap = await limitSnapshot(salon.id);
  const publicBase =
    salon.customDomain && salon.domainStatus === "VERIFIED" ? `https://${salon.customDomain}` : SITE_URL;
  const publicUrl = `${publicBase.replace(/\/+$/, "")}/s/${salon.slug}`;

  return { mode: "salon" as const, mySalons, salon, snap, publicUrl };
}

/* ------------------------------------------------------------------- admin */

async function loadAdmin(url: URL) {
  const user = await getCurrentUser();
  if (!user) return { redirect: "/admin/login" };
  if (user.role !== "ADMIN") return { redirect: "/dashboard" };

  const now = new Date();
  const tehranDay = new Date(now.getTime() + 3.5 * 3600e3).toISOString().slice(0, 10);
  const dayStart = new Date(`${tehranDay}T00:00:00.000Z`);
  dayStart.setTime(dayStart.getTime() - 3.5 * 3600e3);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600e3);

  const [salons, customers, subscriptions, paidAgg, pendingSalons, todayAppts, openTickets, activePackages] =
    await Promise.all([
      prisma.salon.count(),
      prisma.user.count({ where: { role: "CUSTOMER" } }),
      prisma.subscription.count({ where: { status: "ACTIVE" } }),
      prisma.order.aggregate({ where: { status: "PAID" }, _sum: { amount: true } }),
      prisma.salon.count({ where: { isApproved: false } }),
      prisma.appointment.count({ where: { startAt: { gte: dayStart, lt: dayEnd } } }),
      prisma.supportTicket.count({ where: { status: "OPEN" } }),
      prisma.package.count({ where: { isActive: true } }),
    ]);

  return {
    tab: q(url, "tab") ?? "metrics",
    hasPassword: !!user.passwordHash,
    counts: { salons, customers, subscriptions, revenue: paidAgg._sum.amount ?? 0, pendingSalons, todayAppts, openTickets, activePackages },
  };
}

/* -------------------------------------------------------------- seo list */

/** فهرست صفحات عمومی برای prerender (اسلاگ‌های فعال/تأییدشده + متادیتا) */
async function loadSeoSalons() {
  const salons = await prisma.salon.findMany({
    where: { isActive: true, isApproved: true },
    select: { slug: true, name: true, city: true, description: true, bannerUrl: true, logoUrl: true },
    take: 300,
  });
  return salons.map((s) => ({
    path: `/s/${s.slug}`,
    title: `${s.name}${s.city ? ` — آرایشگاه در ${s.city}` : ""}`,
    description:
      s.description ??
      `رزرو آنلاین نوبت ${s.name}${s.city ? ` در ${s.city}` : ""}؛ مشاهده خدمات، قیمت‌ها، آرایشگران و زمان‌های آزاد.`,
    images: [s.bannerUrl, s.logoUrl].filter((u): u is string => Boolean(u)),
  }));
}

/** متادیتای یک صفحهٔ سالن برای prerender */
async function loadSeoSalon(url: URL) {
  const meta = await buildSalonSeo(q(url, "slug") ?? "");
  if (!meta) throw httpError("Salon not found", 404);
  return meta;
}

/* ------------------------------------------------------------------ map */

export const PAGE_LOADERS: Record<string, Loader> = {
  home: () => loadHome(),
  salon: (u) => loadSalon(u),
  "wa-salon": (u) => loadWaSalon(u),
  "pay-invoice": (u) => loadPayInvoice(u),
  agenda: (u) => loadAgendaPage(u),
  "new-appointment": () => loadNewAppointment(),
  "voice-booking": () => loadVoiceBooking(),
  "dashboard-salon": (u) => loadDashboardSalon(u),
  admin: (u) => loadAdmin(u),
  "seo-salons": () => loadSeoSalons(),
  "seo-salon": (u) => loadSeoSalon(u),
};
