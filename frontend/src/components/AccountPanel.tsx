"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "@/next";
import { useRouter } from "@/next";
import { LogOut } from "lucide-react";
import RescheduleModal from "@/components/RescheduleModal";
import { toJalali, toPersianDigits } from "@/lib/utils";

type Appointment = {
  id: string;
  customerName: string;
  customerPhone: string;
  startAt: string;
  endAt: string;
  status: string;
  service?: string | null;
  serviceId?: string | null;
  salonId?: string | null;
  salonName?: string | null;
  salonSlug?: string | null;
  salonTimezone?: string | null;
  employee?: string | null;
  employeeId?: string | null;
  branchId?: string | null;
};

type Favorite = { id: string; salon: { id: string; slug: string; name: string; city?: string | null; coverColor?: string | null } };
type Review = {
  id: string;
  appointmentId?: string | null;
  rating: number;
  comment?: string | null;
  salonName: string;
  salonSlug?: string;
  staff?: string | null;
  createdAt: string;
};
type SessionInfo = { id: string; device?: string | null; ip?: string | null; createdAt: string; expiresAt: string };
type Me = { id: string; phone: string; name?: string | null; email?: string | null; avatarUrl?: string | null; role: string };
type SupportTicket = {
  id: string;
  subject: string;
  message: string;
  category: string;
  status: "OPEN" | "IN_PROGRESS" | "CLOSED";
  adminReply?: string | null;
  repliedAt?: string | null;
  createdAt: string;
};

const ticketStatusLabel: Record<string, string> = {
  OPEN: "باز",
  IN_PROGRESS: "در حال بررسی",
  CLOSED: "بسته‌شده",
};
const ticketStatusColor: Record<string, string> = {
  OPEN: "bg-amber-50 text-amber-700",
  IN_PROGRESS: "bg-sky-50 text-sky-700",
  CLOSED: "bg-emerald-50 text-emerald-700",
};
const ticketCategories = [
  { value: "GENERAL", label: "عمومی" },
  { value: "BOOKING", label: "رزرو و نوبت" },
  { value: "PAYMENT", label: "پرداخت و اشتراک" },
  { value: "TECHNICAL", label: "مشکل فنی" },
  { value: "COMPLAINT", label: "شکایت" },
];

const statusLabel: Record<string, string> = {
  REQUESTED: "در انتظار تأیید",
  CONFIRMED: "تأیید شده",
  COMPLETED: "انجام شده",
  CANCELLED: "لغو شده",
  NO_SHOW: "مراجعه نکرد",
};
const statusColor: Record<string, string> = {
  REQUESTED: "bg-amber-50 text-amber-700",
  CONFIRMED: "bg-emerald-50 text-emerald-700",
  COMPLETED: "bg-sky-50 text-sky-700",
  CANCELLED: "bg-red-50 text-red-600",
  NO_SHOW: "bg-neutral-100 text-neutral-500",
};

const tabs = [
  { id: "appointments", label: "نوبت‌های من", icon: "📅" },
  { id: "favorites", label: "علاقه‌مندی‌ها", icon: "❤️" },
  { id: "reviews", label: "نظرات من", icon: "⭐" },
  { id: "profile", label: "پروفایل", icon: "👤" },
  { id: "support", label: "پشتیبانی", icon: "🎫" },
  { id: "security", label: "امنیت و نشست‌ها", icon: "🔐" },
] as const;

type TabId = (typeof tabs)[number]["id"];

/** زمان فعلی با به‌روزرسانی دوره‌ای — برای فیلتر نوبت‌های آینده/گذشته */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function AccountPanel({ initialMe }: { initialMe: Me }) {
  const router = useRouter();
  const [me, setMe] = useState<Me>(initialMe);
  const [tab, setTab] = useState<TabId>("appointments");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  /** بارگیری داده‌ها بدون تغییر وضعیت هم‌زمان — قابل فراخوانی از effect */
  function fetchAllData() {
    type Api<T> = { success: boolean; error?: string } & Partial<T>;
    return Promise.all([
      fetch("/api/appointments"),
      fetch("/api/favorites"),
      fetch("/api/account/reviews"),
      fetch("/api/auth/sessions"),
      fetch("/api/support"),
    ])
      .then(
        (rs) =>
          Promise.all(rs.map((r) => r.json())) as Promise<
            [Api<{ appointments: Appointment[] }>, Api<{ favorites: Favorite[] }>, Api<{ reviews: Review[] }>, Api<{ sessions: SessionInfo[] }>, Api<{ tickets: SupportTicket[] }>]
          >
      )
      .then(([a, f, r, s, t]) => {
        if (a.success && a.appointments) setAppointments(a.appointments);
        if (f.success && f.favorites) setFavorites(f.favorites);
        if (r.success && r.reviews) setReviews(r.reviews);
        if (s.success && s.sessions) setSessions(s.sessions);
        if (t.success && t.tickets) setTickets(t.tickets);
      })
      .catch(() => {
        setMsg({ ok: false, text: "خطا در بارگیری اطلاعات. اتصال اینترنت را بررسی کنید." });
      })
      .finally(() => {
        setLoading(false);
      });
  }

  function loadAll() {
    setLoading(true);
    fetchAllData();
  }

  useEffect(() => {
    fetchAllData();
  }, []);

  const now = useNow();
  const upcoming = useMemo(
    () =>
      appointments
        .filter((a) => new Date(a.startAt).getTime() >= now && (a.status === "REQUESTED" || a.status === "CONFIRMED"))
        .sort((x, y) => +new Date(x.startAt) - +new Date(y.startAt)),
    [appointments, now]
  );
  const past = useMemo(
    () =>
      appointments
        .filter((a) => !(new Date(a.startAt).getTime() >= now && (a.status === "REQUESTED" || a.status === "CONFIRMED")))
        .sort((x, y) => +new Date(y.startAt) - +new Date(x.startAt)),
    [appointments, now]
  );
  const reviewedIds = new Set(reviews.map((r) => r.appointmentId).filter(Boolean));

  async function cancelAppointment(id: string) {
    const reason = window.prompt("دلیل لغو (اختیاری):") ?? "";
    const res = await fetch(`/api/appointments/${id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    setMsg({ ok: !!data.success, text: data.success ? "نوبت لغو شد." : data.error || "خطا" });
    if (data.success) loadAll();
  }

  function rescheduleAppointment(appointment: Appointment) {
    setRescheduleTarget(appointment);
  }

  async function submitTicket(input: { subject: string; category: string; message: string }) {
    const res = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    setMsg({
      ok: !!data.success,
      text: data.success ? "درخواست شما ثبت شد. تیم پشتیبانی به‌زودی پاسخ می‌دهد." : data.error || "خطا",
    });
    if (data.success) loadAll();
    return !!data.success;
  }

  async function submitReview(appointment: Appointment, rating: number, comment: string) {
    if (!appointment.salonSlug) return;
    const res = await fetch(`/api/salons/${appointment.salonSlug}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId: appointment.id, rating, comment: comment || undefined }),
    });
    const data = await res.json();
    setMsg({ ok: !!data.success, text: data.success ? "نظر شما ثبت شد. ممنون!" : data.error || "خطا" });
    if (data.success) loadAll();
  }

  async function removeFavorite(salonId: string) {
    const res = await fetch(`/api/favorites/${salonId}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) setFavorites((prev) => prev.filter((f) => f.salon.id !== salonId));
  }

  async function revokeSession(id: string) {
    const res = await fetch(`/api/auth/sessions?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) setSessions((prev) => prev.filter((s) => s.id !== id));
    else setMsg({ ok: false, text: data.error || "خطا" });
  }

  async function saveProfile(form: { name: string; email: string; avatarUrl?: string | null }) {
    const res = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name || undefined, email: form.email || undefined, avatarUrl: form.avatarUrl ?? undefined }),
    });
    const data = await res.json();
    setMsg({ ok: !!data.success, text: data.success ? "پروفایل ذخیره شد." : data.error || "خطا" });
    if (data.success) setMe((prev) => ({ ...prev, ...data.user }));
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-neutral-200 pb-3 dark:border-neutral-800">
        <div className="-mx-1 flex flex-1 gap-2 overflow-x-auto px-1 pb-1 [mask-image:linear-gradient(to_left,black_88%,transparent)] [scrollbar-width:none] sm:[mask-image:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition sm:px-4 sm:text-sm ${
                tab === t.id
                  ? "bg-pink-600 text-white shadow-sm shadow-pink-500/25"
                  : "bg-neutral-100 text-neutral-600 hover:bg-pink-50 hover:text-pink-700 dark:bg-neutral-800 dark:text-neutral-300"
              }`}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={logout}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-xs font-bold text-white transition hover:bg-neutral-800 sm:w-auto sm:gap-1.5 sm:px-4 sm:text-sm"
          aria-label="خروج از حساب"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">خروج</span>
        </button>
      </div>

      {msg && (
        <p className={`mt-4 rounded-lg px-4 py-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {msg.text}
        </p>
      )}

      {loading ? (
        <p className="py-10 text-center text-neutral-400">در حال بارگیری...</p>
      ) : (
        <div className="mt-6">
          {tab === "appointments" && (
            <div className="space-y-8">
              <AppointmentList
                title="نوبت‌های آینده"
                empty="نوبت آینده‌ای ندارید."
                items={upcoming}
                onCancel={cancelAppointment}
                onReschedule={rescheduleAppointment}
              />
              <div>
                <h3 className="mb-3 text-lg font-black text-neutral-900">تاریخچه مراجعات</h3>
                {past.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-400">
                    هنوز مراجعه‌ای ثبت نشده است.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {past.map((a) => (
                      <div key={a.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="font-bold text-neutral-800">{a.salonName ?? "سالن"}</div>
                            <div className="text-xs text-neutral-500">
                              {a.service ?? "خدمت"} — {toJalali(a.startAt)}
                              {a.employee ? ` — ${a.employee}` : ""}
                            </div>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor[a.status] ?? "bg-neutral-100 text-neutral-500"}`}>
                            {statusLabel[a.status] ?? a.status}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {a.salonSlug && (
                            <Link href={`/s/${a.salonSlug}`} className="flex h-10 items-center rounded-lg bg-pink-50 px-3 text-xs font-bold text-pink-700 hover:bg-pink-100">
                              رزرو مجدد
                            </Link>
                          )}
                          {a.status === "COMPLETED" && a.salonSlug && !reviewedIds.has(a.id) && (
                            <ReviewForm onSubmit={(rating, comment) => submitReview(a, rating, comment)} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "favorites" && (
            <div>
              {favorites.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-200 p-10 text-center">
                  <p className="text-neutral-500">هنوز سالنی را ذخیره نکرده‌اید.</p>
                  <Link href="/salons" className="mt-3 inline-block rounded-xl bg-pink-600 px-4 py-2 text-sm font-bold text-white">
                    دیدن سالن‌ها
                  </Link>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {favorites.map((f) => (
                    <div key={f.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl" style={{ background: f.salon.coverColor ?? "#f472b6" }} />
                        <div>
                          <div className="font-bold text-neutral-900">{f.salon.name}</div>
                          <div className="text-xs text-neutral-500">{f.salon.city ?? ""}</div>
                        </div>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <Link href={`/s/${f.salon.slug}`} className="flex h-10 flex-1 items-center justify-center rounded-lg bg-pink-600 px-3 text-xs font-bold text-white">
                          مشاهده و رزرو
                        </Link>
                        <button onClick={() => removeFavorite(f.salon.id)} className="h-10 rounded-lg bg-neutral-100 px-3 text-xs font-bold text-neutral-600 hover:bg-red-50 hover:text-red-600 dark:bg-neutral-800 dark:text-neutral-300">
                          حذف
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "reviews" && (
            <div className="space-y-3">
              {reviews.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-neutral-200 p-10 text-center text-neutral-400">
                  هنوز نظری ثبت نکرده‌اید. پس از مراجعه می‌توانید نظر بدهید.
                </p>
              ) : (
                reviews.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-neutral-800">{r.salonName}</div>
                      <div className="text-amber-500">{"★".repeat(r.rating)}<span className="text-neutral-200">{"★".repeat(5 - r.rating)}</span></div>
                    </div>
                    {r.staff && <div className="text-xs text-neutral-500">آرایشگر: {r.staff}</div>}
                    {r.comment && <p className="mt-2 text-sm text-neutral-700">{r.comment}</p>}
                    <div className="mt-1 text-xs text-neutral-400">{toJalali(r.createdAt)}</div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "profile" && <ProfileForm me={me} onSave={saveProfile} />}

          {tab === "support" && <SupportView tickets={tickets} onSubmit={submitTicket} />}

          {tab === "security" && (
            <div>
              <h3 className="mb-2 text-lg font-black text-neutral-900">نشست‌های فعال</h3>
              <p className="mb-4 text-sm text-neutral-500">
                اگر از دستگاه دیگری وارد شده‌اید و آن را نمی‌شناسید، همان‌جا خارج شوید.
              </p>
              <div className="space-y-3">
                {sessions.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
                    <div>
                      <div className="text-sm font-bold text-neutral-800">{s.device ?? "دستگاه ناشناس"}</div>
                      <div className="text-xs text-neutral-500" dir="ltr">{s.ip ?? "—"}</div>
                      <div className="text-xs text-neutral-400">ورود: {toJalali(s.createdAt)}</div>
                    </div>
                    <button onClick={() => revokeSession(s.id)} className="h-10 rounded-lg bg-red-50 px-3 text-xs font-bold text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300">
                      خروج از این دستگاه
                    </button>
                  </div>
                ))}
                {sessions.length === 0 && <p className="text-sm text-neutral-400">نشست فعالی یافت نشد.</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {rescheduleTarget && (
        <RescheduleModal
          appointmentId={rescheduleTarget.id}
          salonSlug={rescheduleTarget.salonSlug}
          serviceId={rescheduleTarget.serviceId}
          employeeId={rescheduleTarget.employeeId}
          branchId={rescheduleTarget.branchId}
          timezone={rescheduleTarget.salonTimezone}
          onClose={() => setRescheduleTarget(null)}
          onDone={(text) => {
            setRescheduleTarget(null);
            setMsg({ ok: true, text });
            loadAll();
          }}
        />
      )}
    </div>
  );
}

function SupportView({
  tickets,
  onSubmit,
}: {
  tickets: SupportTicket[];
  onSubmit: (input: { subject: string; category: string; message: string }) => Promise<boolean>;
}) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("GENERAL");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const input = "w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-pink-400 dark:border-neutral-700 dark:bg-neutral-800";

  async function send() {
    if (subject.trim().length < 3 || message.trim().length < 10) return;
    setSending(true);
    const ok = await onSubmit({ subject: subject.trim(), category, message: message.trim() });
    if (ok) {
      setSubject("");
      setMessage("");
      setCategory("GENERAL");
    }
    setSending(false);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <h3 className="text-lg font-black text-neutral-900 dark:text-neutral-100">ثبت درخواست پشتیبانی</h3>
        <p className="mt-1 text-sm text-neutral-500">سوال، مشکل یا شکایت خود را ثبت کنید؛ پاسخ در همین صفحه نمایش داده می‌شود.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px]">
          <input
            className={input}
            placeholder="موضوع (مثلاً مشکل در لغو نوبت)"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={120}
            aria-label="موضوع"
          />
          <select className={input} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="دسته‌بندی">
            {ticketCategories.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <textarea
          className={`${input} mt-3 min-h-[110px]`}
          placeholder="توضیحات کامل (حداقل ۱۰ حرف)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          aria-label="توضیحات"
        />
        <div className="mt-3 flex justify-end">
          <button
            onClick={send}
            disabled={sending || subject.trim().length < 3 || message.trim().length < 10}
            className="h-11 w-full rounded-xl bg-pink-600 px-5 text-sm font-bold text-white hover:bg-pink-700 disabled:opacity-50 sm:w-auto"
          >
            {sending ? "در حال ارسال..." : "ارسال درخواست"}
          </button>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-lg font-black text-neutral-900 dark:text-neutral-100">درخواست‌های من</h3>
        {tickets.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-200 p-8 text-center text-sm text-neutral-400 dark:border-neutral-800">
            هنوز درخواستی ثبت نکرده‌اید.
          </p>
        ) : (
          <div className="space-y-3">
            {tickets.map((t) => (
              <div key={t.id} className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-neutral-800 dark:text-neutral-100">{t.subject}</div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ticketStatusColor[t.status] ?? "bg-neutral-100 text-neutral-500"}`}>
                    {ticketStatusLabel[t.status] ?? t.status}
                  </span>
                </div>
                <div className="mt-1 text-xs text-neutral-400">
                  {ticketCategories.find((c) => c.value === t.category)?.label ?? t.category} — {toJalali(t.createdAt)}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-300">{t.message}</p>
                {t.adminReply && (
                  <div className="mt-3 rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/30">
                    <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">پاسخ پشتیبانی</div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-emerald-800 dark:text-emerald-200">{t.adminReply}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AppointmentList({
  title,
  empty,
  items,
  onCancel,
  onReschedule,
}: {
  title: string;
  empty: string;
  items: Appointment[];
  onCancel: (id: string) => void;
  onReschedule: (appointment: Appointment) => void;
}) {
  return (
    <div>
      <h3 className="mb-3 text-lg font-black text-neutral-900">{title}</h3>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-400">{empty}</p>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <div key={a.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-neutral-800">{a.salonName ?? "سالن"}</div>
                  <div className="text-xs text-neutral-500">
                    {a.service ?? "خدمت"} — {toJalali(a.startAt)}
                    {a.employee ? ` — ${a.employee}` : ""}
                  </div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor[a.status] ?? ""}`}>
                  {statusLabel[a.status] ?? a.status}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => onReschedule(a)} className="h-10 rounded-lg bg-amber-500 px-3.5 text-xs font-bold text-white hover:bg-amber-600">
                  تغییر زمان
                </button>
                <button onClick={() => onCancel(a.id)} className="h-10 rounded-lg bg-neutral-200 px-3.5 text-xs font-bold text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-200">
                  لغو نوبت
                </button>
                <span className="self-center text-xs text-neutral-400">شماره: <span dir="ltr">{toPersianDigits(a.customerPhone)}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewForm({ onSubmit }: { onSubmit: (rating: number, comment: string) => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-xl bg-neutral-50 p-2 dark:bg-neutral-800">
      <div className="flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} ستاره`} className={`flex h-10 w-10 items-center justify-center rounded-lg text-xl transition active:scale-95 ${n <= rating ? "text-amber-500" : "text-neutral-300 hover:text-amber-300 dark:text-neutral-600"}`}>
            ★
          </button>
        ))}
      </div>
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="نظر شما (اختیاری)"
        className="h-10 min-w-[150px] flex-1 rounded-lg border border-neutral-200 px-3 text-xs outline-none focus:border-pink-400 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button onClick={() => onSubmit(rating, comment)} className="h-10 rounded-lg bg-pink-600 px-3.5 text-xs font-bold text-white hover:bg-pink-700">
        ثبت نظر
      </button>
    </div>
  );
}

function ProfileForm({ me, onSave }: { me: Me; onSave: (form: { name: string; email: string; avatarUrl?: string | null }) => void }) {
  const [name, setName] = useState(me.name ?? "");
  const [email, setEmail] = useState(me.email ?? "");
  const [avatar, setAvatar] = useState(me.avatarUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function uploadAvatar(file: File) {
    setUploading(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/avatar", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "بارگذاری ناموفق بود");
      setAvatar(data.url);
      setMsg({ ok: true, text: "تصویر بارگذاری شد؛ برای ثبت نهایی «ذخیره تغییرات» را بزنید ✅" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "خطا در بارگذاری تصویر" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-lg space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-pink-100 to-purple-100 text-2xl font-black text-pink-600">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="آواتار" className="h-full w-full object-cover" />
          ) : (
            (me.name ?? "؟").slice(0, 1)
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100">تصویر پروفایل</p>
          <label className={`mt-1 inline-flex h-10 cursor-pointer items-center rounded-lg bg-neutral-100 px-3 text-xs font-bold text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 ${uploading ? "opacity-60" : ""}`}>
            {uploading ? "در حال بارگذاری..." : "انتخاب تصویر"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAvatar(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
      {msg && <p className={`rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{msg.text}</p>}
      <div>
        <label className="text-xs font-bold text-neutral-500 dark:text-neutral-400">شماره موبایل</label>
        <input value={me.phone} disabled dir="ltr" className="mt-1 h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800" />
      </div>
      <div>
        <label className="text-xs font-bold text-neutral-500 dark:text-neutral-400">نام</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-pink-400 dark:border-neutral-700 dark:bg-neutral-800" />
      </div>
      <div>
        <label className="text-xs font-bold text-neutral-500 dark:text-neutral-400">ایمیل</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" className="mt-1 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-pink-400 dark:border-neutral-700 dark:bg-neutral-800" />
      </div>
      <button onClick={() => onSave({ name, email, avatarUrl: avatar || null })} className="h-11 w-full rounded-xl bg-pink-600 px-5 text-sm font-bold text-white hover:bg-pink-700 sm:w-auto">
        ذخیره تغییرات
      </button>
    </div>
  );
}
