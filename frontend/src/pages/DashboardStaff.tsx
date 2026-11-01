/**
 * صفحه مدیریت کارکنان سالن — با لیست کامل کارکنان، برنامه کاری و خدمات.
 */
import { useState, useEffect, useCallback } from "react";
import { Navigate, Link, useSearchParams } from "@/router-shim";
import { useAuth } from "@/auth";
import DashboardShell from "@/components/DashboardShell";
import TimeField from "@/components/ui/TimeField";
import { Store, Plus, Trash2, Pencil, Check, X, Upload, Users, Scissors } from "lucide-react";

type StaffItem = {
  id: string;
  name: string;
  title?: string | null;
  role: string;
  commissionPercent: number;
  branchId?: string | null;
  avatarUrl?: string | null;
  specialties: string[];
  isActive: boolean;
  bio?: string | null;
  phone?: string | null;
  services?: { id: string; name: string }[];
  schedule?: { day: number; open: string; close: string; isClosed?: boolean }[] | null;
  _count?: { appointments?: number };
};

type Service = { id: string; name: string; durationMin?: number; price?: number; isActive?: boolean };
type Branch = { id: string; name: string; city?: string | null; address?: string | null };

const STAFF_ROLE: Record<string, string> = {
  STYLIST: "آرایشگر",
  MANAGER: "مدیر",
  RECEPTION: "پذیرش",
  OWNER: "مالک",
};

const DAY_NAMES = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

const inputCls =
  "h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm outline-none transition focus:border-pink-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

const cardCls = "rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900";

const darkBtn =
  "flex h-11 items-center justify-center gap-2 rounded-xl bg-neutral-900 px-5 text-sm font-bold text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300";

export default function DashboardStaff() {
  const { me } = useAuth();
  const sp = useSearchParams();
  const salon = sp.get("salon") ?? undefined;
  
  // State for salons list
  const [mySalons, setMySalons] = useState<{ id: string; name: string }[]>([]);
  const [loadingSalons, setLoadingSalons] = useState(true);
  
  // State for staff data
  const [staff, setStaff] = useState<StaffItem[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  
  // Selected salon
  const [selectedSalonId, setSelectedSalonId] = useState<string | null>(null);

  useEffect(() => {
    // Fetch salons list from /api/salons
    const fetchSalons = async () => {
      try {
        const res = await fetch("/api/salons");
        const d = await res.json();
        if (d.success && d.salons) {
          const salons = d.salons.map((s: any) => ({ id: s.id, name: s.name }));
          setMySalons(salons);
          if (salon && salons.find((s: { id: string }) => s.id === salon)) {
            setSelectedSalonId(salon);
          } else if (salons.length > 0) {
            setSelectedSalonId(salons[0].id);
          }
        }
      } catch (e) {
        console.error("Error fetching salons:", e);
      } finally {
        setLoadingSalons(false);
      }
    };
    fetchSalons();
  }, [salon]);

  const salonId = selectedSalonId;
  const base = salonId ? `/api/dashboard/salons/${salonId}` : "";

  const refresh = useCallback(async () => {
    if (!base) return;
    setLoadingStaff(true);
    try {
      const res = await fetch(`${base}/staff`);
      const d = await res.json();
      if (d.success) setStaff(d.staff as StaffItem[]);
    } catch (e) {
      console.error("Error fetching staff:", e);
    } finally {
      setLoadingStaff(false);
    }
  }, [base]);

  const api = useCallback(
    async (path: string, method: string, body?: unknown, okMsg?: string): Promise<boolean> => {
      try {
        const res = await fetch(path, {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json();
        if (!data.success) {
          setMsg({ ok: false, text: data.error || "خطا" });
          return false;
        }
        setMsg({ ok: true, text: okMsg ?? "ذخیره شد ✅" });
        return true;
      } catch {
        setMsg({ ok: false, text: "خطا در ارتباط با سرور" });
        return false;
      }
    },
    []
  );

  useEffect(() => {
    if (!base) return;
    let cancelled = false;
    setLoadingStaff(true);
    Promise.all([
      fetch(`${base}/staff`).then((r) => r.json()),
      fetch(`${base}/services`).then((r) => r.json()),
      fetch(`${base}/branches`).then((r) => r.json()),
    ])
      .then(([st, sv, br]) => {
        if (cancelled) return;
        if (st.success) setStaff(st.staff as StaffItem[]);
        if (sv.success) setServices(sv.services as Service[]);
        if (br.success) setBranches(br.branches as Branch[]);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingStaff(false);
      });
    return () => {
      cancelled = true;
    };
  }, [base]);

  if (!me) return <Navigate to="/login" replace />;
  if (loadingSalons) {
    return (
      <DashboardShell role={me.role} title="کارکنان">
        <div className="py-16 text-center text-neutral-500">در حال بارگذاری…</div>
      </DashboardShell>
    );
  }
  if (mySalons.length === 0) {
    return <Navigate to="/dashboard/salon" replace />;
  }

  const activeCount = staff.filter((x) => x.isActive).length;
  const inactiveCount = staff.length - activeCount;
  const activeSalon = mySalons.find(ms => ms.id === salonId);
  const salonName = activeSalon?.name || "سالن";

  // Simple Staff Row component inline
  function StaffRow({ item }: { item: StaffItem }) {
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(item.isActive);

    const statusBadge = active
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
      : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400";

    return (
      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-pink-100 to-purple-100 text-xl font-black text-pink-600 dark:from-pink-950/40 dark:to-purple-950/40">
              {item.avatarUrl ? (
                <img src={item.avatarUrl} alt={item.name} className="h-full w-full object-cover" />
              ) : (
                item.name.slice(0, 1)
              )}
            </div>
            <div className="min-w-0">
              <div className={`truncate font-bold ${active ? "text-neutral-800 dark:text-neutral-100" : "text-neutral-400"}`}>
                {item.name}{item.title ? <span className="text-xs font-medium text-pink-600"> ({item.title})</span> : null}
              </div>
              <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                {STAFF_ROLE[item.role] ?? item.role} — کمیسیون {item.commissionPercent}٪
              </div>
              {item.specialties.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {item.specialties.map((sp) => (
                    <span key={sp} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{sp}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${statusBadge}`}>
              {active ? "فعال" : "غیرفعال"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-[11px] font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              <Scissors className="h-3 w-3" />
              {item._count?.appointments ?? 0} نوبت
            </span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setOpen((o) => !o)}
            className="h-10 rounded-lg bg-neutral-100 px-3.5 text-xs font-bold text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            {open ? "بستن جزئیات" : "برنامه و خدمات"}
          </button>
          <button
            onClick={() => {
              const next = !active;
              api(`${base}/staff/${item.id}`, "PATCH", { isActive: next }, next ? "کارمند فعال شد ✅" : "کارمند غیرفعال شد").then(() => {
                if (next) setActive(next);
                refresh();
              });
            }}
            className="h-10 rounded-lg bg-amber-50 px-3.5 text-xs font-bold text-amber-700 transition hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50"
          >
            {active ? "غیرفعال" : "فعال‌سازی"}
          </button>
          <button
            onClick={() => {
              if (window.confirm(`کارمند «${item.name}» حذف شود؟`)) {
                api(`${base}/staff/${item.id}`, "DELETE", undefined, "حذف شد ✅").then(() => refresh());
              }
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-red-50 px-3.5 text-xs font-bold text-red-600 transition hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            حذف
          </button>
        </div>

        {open && (
          <div className="mt-4 rounded-2xl border border-neutral-100 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              ویرایش و تنظیمات برای هر کارمند در دسترس است.
            </p>
            <div className="mt-3 text-xs text-neutral-500">
              <p>نام: <span className="font-bold">{item.name}</span></p>
              {item.phone && <p>تلفن: <span className="font-bold" dir="ltr">{item.phone}</span></p>}
              {item.title && <p>سمت: <span className="font-bold">{item.title}</span></p>}
              <p>تخصص‌ها: <span className="font-bold">{item.specialties.join(", ")}</span></p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <DashboardShell role={me.role} title="کارکنان">
      {msg && (
        <p className={`mb-4 rounded-xl px-4 py-2.5 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300"}`}>
          {msg.text}
        </p>
      )}

      {/* سوییچر سالن‌ها */}
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <span className="px-1 text-xs font-bold text-neutral-500">سالن‌های من:</span>
        {mySalons.map((ms) => {
          const active = ms.id === salonId;
          return (
            <Link
              key={ms.id}
              href={`/dashboard/staff?salon=${ms.id}`}
              className={`rounded-xl px-3.5 py-1.5 text-sm font-bold transition ${
                active ? "bg-[#1c2434] text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
              }`}
            >
              {ms.name}
            </Link>
          );
        })}
      </div>

      {/* سربرگ */}
      <div className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-l from-[#1c2434] to-[#2a3450] p-4 text-white shadow-lg sm:p-6">
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-black sm:text-2xl">کارکنان {salonName}</h1>
            <p className="mt-1 text-xs text-neutral-300">مدیریت آرایشگران و کارمندان، برنامهٔ کاری و خدمات هر نفر</p>
          </div>
          <Link
            href={salonId ? `/s/${salonId}` : "#"}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-black text-[#1c2434] shadow-xl transition hover:scale-[1.03] sm:w-auto"
          >
            <Store className="h-4 w-4" />
            مشاهده صفحه عمومی
          </Link>
        </div>
      </div>

      {/* آمار */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-50 text-pink-600 dark:bg-pink-900/40 dark:text-pink-300">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xl font-black text-neutral-900 dark:text-neutral-100">{staff.length}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">کل کارکنان</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
              <Check className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xl font-black text-neutral-900 dark:text-neutral-100">{activeCount}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">فعال</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
              <X className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xl font-black text-neutral-900 dark:text-neutral-100">{inactiveCount}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">غیرفعال</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300">
              <Scissors className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xl font-black text-neutral-900 dark:text-neutral-100">{services.length}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">خدمات سالن</div>
            </div>
          </div>
        </div>
      </div>

      {/* افزودن */}
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-black text-neutral-900 dark:text-neutral-100">لیست کارکنان</h2>
        <button onClick={() => setShowAdd((v) => !v)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-l from-pink-600 to-purple-600 px-4 text-sm font-black text-white shadow-md shadow-pink-500/25 transition hover:scale-[1.02]">
          <Plus className="h-4 w-4" />
          {showAdd ? "بستن فرم" : "افزودن کارمند"}
        </button>
      </div>

      {showAdd && (
        <div className="mb-5">
          <div className={cardCls}>
            <h3 className="mb-4 text-sm font-extrabold text-neutral-800 dark:text-neutral-100">افزودن کارمند جدید</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className={inputCls} id="new-staff-name" placeholder="نام کارمند *" />
              <select className={inputCls} id="new-staff-role">
                {Object.entries(STAFF_ROLE).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <input className={inputCls} id="new-staff-commission" type="number" placeholder="کمیسیون ٪" />
              <input className={inputCls} id="new-staff-specialties" placeholder="تخصص‌ها" />
              <textarea className={`${inputCls} h-24 resize-none`} id="new-staff-bio" placeholder="رزومه" />
            </div>
            <button
              onClick={async () => {
                const name = (document.getElementById("new-staff-name") as HTMLInputElement).value;
                const role = (document.getElementById("new-staff-role") as HTMLSelectElement).value;
                const commission = Number((document.getElementById("new-staff-commission") as HTMLInputElement).value);
                const specialties = (document.getElementById("new-staff-specialties") as HTMLInputElement).value;
                const bio = (document.getElementById("new-staff-bio") as HTMLTextAreaElement).value;
                
                if (!name.trim()) {
                  setMsg({ ok: false, text: "نام کارمند را وارد کنید" });
                  return;
                }
                
                setSaving(true);
                const ok = await api(`${base}/staff`, "POST", {
                  name,
                  role,
                  commissionPercent: commission,
 specialties: specialties.split("،").map(s => s.trim()).filter(Boolean),
                  bio: bio.trim() || undefined,
                }, "کارمند اضافه شد ✅");
                setSaving(false);
                if (ok) {
                  refresh();
                  setShowAdd(false);
                  (document.getElementById("new-staff-name") as HTMLInputElement).value = "";
                  (document.getElementById("new-staff-commission") as HTMLInputElement).value = "";
                  (document.getElementById("new-staff-specialties") as HTMLInputElement).value = "";
                  (document.getElementById("new-staff-bio") as HTMLTextAreaElement).value = "";
                }
              }}
              disabled={saving}
              className={`${darkBtn} w-full disabled:opacity-60`}
            >
              <Plus className="h-4 w-4" />
              {saving ? "در حال ذخیره..." : "افزودن کارمند"}
            </button>
          </div>
        </div>
      )}

      {loadingStaff ? (
        <p className="py-16 text-center text-neutral-500">در حال بارگذاری کارکنان…</p>
      ) : staff.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 p-10 text-center dark:border-neutral-800">
          <div className="text-4xl">👥</div>
          <p className="mt-3 text-neutral-500 dark:text-neutral-400">هنوز کارمندی ثبت نشده است. اولین نفر را اضافه کنید.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {staff.map((st) => (
            <StaffRow key={st.id} item={st} />
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
