/**
 * کارکنان — نسخهٔ مینی‌استایلِ /dashboard/staff و ویرایشگر کامل کارمند.
 *
 * دقیقاً همان مسیرهای پنل وب مصرف می‌شود:
 *  • GET/POST        /api/dashboard/salons/:id/staff          (فهرست و ساخت)
 *  • PATCH/DELETE    /api/dashboard/salons/:id/staff/:sid     (ویرایش، فعال‌سازی، حذف)
 *  • GET             .../services و .../branches              (انتخاب‌های فرم)
 *  • POST            /api/upload/avatar                       (تصویر کارمند)
 * تبدیل برنامهٔ کاری هفتگی هم همان منطق پنل وب است (قالب آرایه‌ایِ {day,open,close,
 * isClosed} و قالب قدیمیِ {days,open,close}) تا ساعت‌های آزاد availability از همان داده‌ای
 * حساب شود که داشبورد کلاسیک می‌نویسد.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Area, Button, Chip, EmptyState, Field, Icon, Row, SectionTitle, Sheet, SkeletonList } from "@/mini/components/ui";
import { ServicePicker } from "@/mini/components/booking";
import { faDigits, initials } from "@/mini/lib/format";
import type { MiniService } from "@/mini/lib/types";
import { mbToBytes, sizeHintFa, uploadLimitsSync } from "@/lib/upload-limits";
import { dapi } from "../lib/api";
import { SalonSwitcher, StatGrid } from "../lib/parts";
import { useDash } from "../lib/store";

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
  schedule?: unknown;
  _count?: { appointments?: number };
};

type Branch = { id: string; name: string };
type DayRow = { day: number; open: string; close: string; isClosed: boolean };

const STAFF_ROLE: Record<string, string> = {
  STYLIST: "آرایشگر",
  MANAGER: "مدیر",
  RECEPTION: "پذیرش",
  OWNER: "مالک",
};

const DAY_NAMES = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

/**
 * هر دو قالب موجود در دیتابیس به هفت ردیف یکسان تبدیل می‌شود تا فرم همیشه باز شود
 * و با ذخیره، قالب استاندارد نوشته شود (همان کاری که پنل وب می‌کند).
 */
function toScheduleRows(schedule: unknown): DayRow[] {
  const rows: DayRow[] = Array.from({ length: 7 }, (_, day) => ({ day, open: "09:00", close: "21:00", isClosed: false }));
  if (Array.isArray(schedule)) {
    for (const s of schedule as { day?: unknown; open?: unknown; close?: unknown; isClosed?: unknown }[]) {
      const d = Number(s?.day);
      if (!Number.isInteger(d) || d < 0 || d > 6) continue;
      rows[d] = {
        day: d,
        open: typeof s.open === "string" ? s.open : rows[d].open,
        close: typeof s.close === "string" ? s.close : rows[d].close,
        isClosed: s.isClosed === true,
      };
    }
    return rows;
  }
  if (schedule && typeof schedule === "object") {
    const legacy = schedule as { days?: unknown; open?: unknown; close?: unknown };
    const working = Array.isArray(legacy.days) ? legacy.days.map(Number) : [];
    if (!working.length || typeof legacy.open !== "string" || typeof legacy.close !== "string") return rows;
    for (const r of rows) {
      r.open = legacy.open;
      r.close = legacy.close;
      r.isClosed = !working.includes(r.day);
    }
  }
  return rows;
}

/** کمیسیون: عدد صحیح ۰ تا ۱۰۰ — همان محدودیت zod سمت سرور */
function commissionValue(raw: string): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function parseSpecialties(raw: string): string[] {
  return raw
    .split(/[،,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function DashStaff() {
  const { salonId, payload, toast } = useDash();
  const navigate = useNavigate();

  const [staff, setStaff] = useState<StaffItem[]>([]);
  const [services, setServices] = useState<MiniService[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [editId, setEditId] = useState("");

  const load = useCallback(async () => {
    if (!salonId) {
      setStaff([]);
      setServices([]);
      setBranches([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const base = `/api/dashboard/salons/${salonId}`;
    const [st, sv, br] = await Promise.all([
      dapi<{ success: boolean; error?: string; staff?: StaffItem[] }>(`${base}/staff`),
      dapi<{ success: boolean; error?: string; services?: MiniService[] }>(`${base}/services`),
      dapi<{ success: boolean; error?: string; branches?: Branch[] }>(`${base}/branches`),
    ]);
    if (!st.ok) setError(st.data?.error || "بارگذاری کارکنان ممکن نشد.");
    else setStaff(st.data.staff ?? []);
    if (sv.ok && sv.data.services) setServices(sv.data.services);
    if (br.ok && br.data.branches) setBranches(br.data.branches);
    setLoading(false);
  }, [salonId]);

  useEffect(() => {
    void load();
  }, [load]);

  const editing = useMemo(() => staff.find((s) => s.id === editId) ?? null, [staff, editId]);
  const activeCount = staff.filter((x) => x.isActive).length;

  if (!salonId) {
    return (
      <div className="mini-fade">
        <SectionTitle title="کارکنان" hint="ابتدا یک سالن انتخاب کنید." />
        <SalonSwitcher />
        <div style={{ marginTop: 12 }}>
          <EmptyState text="سالنی برای این کاربر ثبت نشده است." hint="از «سالن من» می‌توانید سالن بسازید." />
        </div>
      </div>
    );
  }

  return (
    <div className="mini-fade">
      <div className="dash-toolbar">
        <SectionTitle title="کارکنان" hint={loading ? "" : `${faDigits(staff.length)} نفر`} />
        <div className="mini-actions" style={{ marginInlineStart: "auto" }}>
          {payload?.publicUrl ? (
            <button type="button" className="mini-btn soft tiny" onClick={() => window.open(payload.publicUrl, "_blank", "noopener")}>
              <Icon name="link" size={15} />
              صفحهٔ عمومی
            </button>
          ) : null}
          <button type="button" className="mini-btn tiny" onClick={() => setOpenNew(true)}>
            <Icon name="plus" size={15} />
            افزودن کارمند
          </button>
          <SalonSwitcher />
        </div>
      </div>

      <StatGrid
        loading={loading}
        cells={[
          { value: faDigits(staff.length), label: "کل کارکنان" },
          { value: faDigits(activeCount), label: "فعال" },
          { value: faDigits(staff.length - activeCount), label: "غیرفعال" },
          { value: faDigits(services.length), label: "خدمات سالن" },
        ]}
      />

      {error ? (
        <div className="mini-note dash-note-bad" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}

      <SectionTitle title="لیست کارکنان" hint="برای برنامهٔ کاری، خدمات و تصویر، هر نفر را باز کنید." />
      {loading ? (
        <SkeletonList count={3} />
      ) : staff.length === 0 ? (
        <EmptyState text="هنوز کارمندی ثبت نشده است." hint="با دکمهٔ «افزودن کارمند» اولین نفر را اضافه کنید." />
      ) : (
        <div className="mini-list">
          {staff.map((item) => (
            <button
              key={item.id}
              type="button"
              className="mini-item"
              style={{ width: "100%", textAlign: "start" }}
              onClick={() => setEditId(item.id)}
            >
              <span className="mini-avatar" style={{ width: 38, height: 38, flex: "0 0 38px", fontSize: 14 }}>
                {item.avatarUrl ? <img src={item.avatarUrl} alt={item.name} /> : initials(item.name)}
              </span>
              <span className="mini-item-main">
                <span className="mini-item-title">
                  {item.name}
                  {item.title ? <small> · {item.title}</small> : null}
                </span>
                <span className="mini-item-sub">
                  {STAFF_ROLE[item.role] ?? item.role} — کمیسیون {faDigits(item.commissionPercent)}٪
                  {item.specialties.length ? ` — ${item.specialties.join("، ")}` : ""}
                </span>
              </span>
              <span className="mini-item-side">
                <span className={`dash-tag${item.isActive ? "" : " is-off"}`}>{item.isActive ? "فعال" : "غیرفعال"}</span>
                <span className="mini-item-sub" style={{ display: "block" }}>
                  {faDigits(item._count?.appointments ?? 0)} نوبت
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {!loading && staff.length ? (
        <div className="dash-section-note" style={{ marginTop: 12 }}>
          حذف کارمند نوبت‌های تأیید‌نشدهٔ او را آزاد می‌گذارد (همان رفتاری که نسخهٔ وب دارد). درصد کمیسیون در همین فرم گرفته و در بخش
          «کمیسیون» حساب می‌شود.
        </div>
      ) : null}

      <StaffSheet mode="new" open={openNew} services={services} branches={branches} onClose={() => setOpenNew(false)} onSaved={() => void load()} toast={toast} />
      <StaffSheet
        mode="edit"
        open={!!editing}
        staff={editing}
        services={services}
        branches={branches}
        onClose={() => setEditId("")}
        onSaved={() => void load()}
        toast={toast}
      />

      {services.length === 0 && !loading ? (
        <div style={{ marginTop: 14 }}>
          <Button variant="soft" onClick={() => navigate("/dash/services")}>
            <Icon name="ticket" size={17} />
            تعریف خدمات سالن
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ── شیت کارمند: ساخت و ویرایش با یک فرم ──────────────────────────── */

function StaffSheet({
  mode,
  open,
  staff,
  services,
  branches,
  onClose,
  onSaved,
  toast,
}: {
  mode: "new" | "edit";
  open: boolean;
  staff?: StaffItem | null;
  services: MiniService[];
  branches: Branch[];
  onClose: () => void;
  onSaved: () => void;
  toast: (message: string, kind?: "info" | "ok" | "error") => void;
}) {
  const { salonId } = useDash();

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState("STYLIST");
  const [commission, setCommission] = useState("0");
  const [branchId, setBranchId] = useState("");
  const [specialties, setSpecialties] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [days, setDays] = useState<DayRow[]>(() => toScheduleRows(null));
  const [isActive, setIsActive] = useState(true);

  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  /* با باز شدن شیت، پیش‌نویس از همان کارمند پر می‌شود */
  useEffect(() => {
    if (!open) {
      setErr("");
      setConfirmDel(false);
      return;
    }
    setName(staff?.name ?? "");
    setTitle(staff?.title ?? "");
    setRole(staff?.role && STAFF_ROLE[staff.role] ? staff.role : "STYLIST");
    setCommission(String(staff?.commissionPercent ?? 0));
    setBranchId(staff?.branchId ?? "");
    setSpecialties((staff?.specialties ?? []).join("، "));
    setBio(staff?.bio ?? "");
    setAvatarUrl(staff?.avatarUrl ?? "");
    setServiceIds((staff?.services ?? []).map((s) => s.id));
    setDays(toScheduleRows(staff?.schedule));
    setIsActive(staff?.isActive ?? true);
    setErr("");
    setConfirmDel(false);
  }, [open, staff]);

  const base = salonId ? `/api/dashboard/salons/${salonId}` : "";
  const isEdit = mode === "edit" && !!staff;
  const staffId = staff?.id ?? "";

  async function uploadAvatar(file: File) {
    if (!base) return;
    const { avatarMaxMb } = uploadLimitsSync();
    if (file.size > mbToBytes(avatarMaxMb)) {
      setErr(`حجم تصویر ${sizeHintFa(avatarMaxMb)}.`);
      return;
    }
    setUploading(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await dapi<{ success: boolean; error?: string; url?: string }>("/api/upload/avatar", { method: "POST", body: fd });
      if (!up.ok || !up.data.url) {
        setErr(up.data?.error || "بارگذاری تصویر ممکن نشد.");
        return;
      }
      setAvatarUrl(up.data.url);
      /* در حالت ویرایش مثل پنل وب فوراً ذخیره می‌شود؛ در حالت ساخت با «افزودن» ذخیره می‌گردد */
      if (isEdit && staffId) {
        const r = await dapi<{ success: boolean; error?: string }>(`${base}/staff/${staffId}`, {
          method: "PATCH",
          body: JSON.stringify({ avatarUrl: up.data.url }),
        });
        if (r.ok) {
          toast("تصویر کارمند ذخیره شد", "ok");
          onSaved();
        } else setErr(r.data?.error || "ذخیرهٔ تصویر ممکن نشد.");
      }
    } catch {
      setErr("خطا در ارتباط با سرور");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!base) return;
    if (!name.trim()) {
      setErr("نام کارمند را وارد کنید.");
      return;
    }
    setErr("");
    setSaving(true);
    const body: Record<string, unknown> = {
      name: name.trim(),
      title: title.trim() || undefined,
      role,
      commissionPercent: commissionValue(commission),
      branchId: branchId || undefined,
      avatarUrl: avatarUrl || undefined,
      bio: bio.trim() || undefined,
      specialties: parseSpecialties(specialties),
      serviceIds,
      schedule: days,
    };
    if (isEdit) body.isActive = isActive;
    const res = await dapi<{ success: boolean; error?: string }>(isEdit && staffId ? `${base}/staff/${staffId}` : `${base}/staff`, {
      method: isEdit ? "PATCH" : "POST",
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      setErr(res.data?.error || (isEdit ? "ذخیرهٔ تغییرات ممکن نشد." : "افزودن کارمند ممکن نشد."));
      return;
    }
    toast(isEdit ? "تغییرات کارمند ذخیره شد" : "کارمند اضافه شد", "ok");
    onSaved();
    if (!isEdit) {
      setName("");
      setTitle("");
      setCommission("0");
      setSpecialties("");
      setBio("");
      setAvatarUrl("");
      setServiceIds([]);
      setDays(toScheduleRows(null));
    }
    onClose();
  }

  async function toggleActive() {
    if (!isEdit || !base || !staffId) return;
    const next = !isActive;
    const res = await dapi<{ success: boolean; error?: string }>(`${base}/staff/${staffId}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: next }),
    });
    if (!res.ok) {
      setErr(res.data?.error || "تغییر وضعیت ممکن نشد.");
      return;
    }
    setIsActive(next);
    toast(next ? "کارمند فعال شد" : "کارمند غیرفعال شد", "ok");
    onSaved();
  }

  async function remove() {
    if (!isEdit || !base || !staffId) return;
    const res = await dapi<{ success: boolean; error?: string }>(`${base}/staff/${staffId}`, { method: "DELETE" });
    if (!res.ok) {
      setErr(res.data?.error || "حذف کارمند ممکن نشد.");
      return;
    }
    toast("کارمند حذف شد؛ نوبت‌های تأیید‌نشدهٔ او بدون آرایشگر باقی می‌مانند", "ok");
    onSaved();
    onClose();
  }

  return (
    <Sheet open={open} title={isEdit ? `ویرایش ${staff?.name ?? ""}` : "کارمند جدید"} onClose={onClose}>
      <div className="mini-cust-head">
        <span>مشخصات</span>
        <small>{isActive ? "فعال" : "غیرفعال"}</small>
      </div>

      <div className="mini-avatar" style={{ width: 64, height: 64, borderRadius: 22, fontSize: 22 }}>
        {avatarUrl ? <img src={avatarUrl} alt={name || "تصویر کارمند"} /> : (name.trim().slice(0, 1) || "؟")}
      </div>
      <div className="mini-cust-addrow">
        <label className="mini-btn soft">
          {uploading ? "در حال بارگذاری…" : "تصویر کارمند"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            style={{ display: "none" }}
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadAvatar(f);
              e.target.value = "";
            }}
          />
        </label>
        {avatarUrl ? (
          <button type="button" className="mini-btn ghost" onClick={() => setAvatarUrl("")}>
            حذف تصویر
          </button>
        ) : null}
      </div>

      <div style={{ marginTop: 10 }}>
        <Field label="نام کارمند" name={`stName-${mode}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً مریم رضایی" />
      </div>
      <div className="dash-two" style={{ marginTop: 10 }}>
        <Field label="سمت (اختیاری)" name={`stTitle-${mode}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً رنگ‌کار" />
        <Field
          label="کمیسیون ٪"
          name={`stComm-${mode}`}
          type="number"
          min={0}
          max={100}
          step={1}
          inputMode="numeric"
          className="is-ltr"
          value={commission}
          onChange={(e) => setCommission(e.target.value)}
        />
      </div>

      <div className="mini-cust-head dash-subhead">
        <span>نقش</span>
      </div>
      <div className="mini-chips">
        {Object.entries(STAFF_ROLE).map(([value, label]) => (
          <Chip key={value} on={role === value} onClick={() => setRole(value)}>
            {label}
          </Chip>
        ))}
      </div>

      {branches.length ? (
        <>
          <div className="mini-cust-head dash-subhead">
            <span>شعبه</span>
          </div>
          <div className="mini-chips">
            <Chip on={branchId === ""} onClick={() => setBranchId("")}>
              شعبهٔ اصلی
            </Chip>
            {branches.map((b) => (
              <Chip key={b.id} on={branchId === b.id} onClick={() => setBranchId(b.id)}>
                {b.name}
              </Chip>
            ))}
          </div>
        </>
      ) : null}

      <div style={{ marginTop: 12 }}>
        <Field
          label="تخصص‌ها"
          name={`stSpec-${mode}`}
          value={specialties}
          onChange={(e) => setSpecialties(e.target.value)}
          placeholder="میکروبلیدینگ، رفع موهای زائد"
          hint="با «،» جدا می‌شوند و در صفحهٔ عمومی سالن نمایش داده می‌شود."
        />
      </div>
      <div style={{ marginTop: 10 }}>
        <Area label="رزومه" name={`stBio-${mode}`} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="سوابق و دوره‌های آموزشی" />
      </div>

      <div className="mini-cust-block">
        <div className="mini-cust-head">
          <span>خدمات این کارمند</span>
          <small>{faDigits(serviceIds.length)} انتخاب</small>
        </div>
        {services.length === 0 ? (
          <div className="mini-cust-empty">هنوز خدمتی در سالن تعریف نشده است.</div>
        ) : (
          <div className="dash-stack">
            <ServicePicker
              services={services}
              selected={serviceIds}
              showPrices
              onToggle={(id) => setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
            />
          </div>
        )}
        <div className="mini-cust-hint">خدمتی که این‌جا انتخاب نشود، برای این کارمند در صفحهٔ عمومی سالن نمایش داده نمی‌شود.</div>
      </div>

      <div className="mini-cust-block">
        <div className="mini-cust-head">
          <span>برنامهٔ کاری هفتگی</span>
          <small>{faDigits(days.filter((d) => !d.isClosed).length)} روز کاری</small>
        </div>
        <div className="dash-days">
          {days.map((d) => (
            <div key={d.day} className="dash-day">
              <span className="dash-day-name">{DAY_NAMES[d.day]}</span>
              <button
                type="button"
                className={`mini-chip${d.isClosed ? "" : " is-on"}`}
                onClick={() => setDays((prev) => prev.map((x) => (x.day === d.day ? { ...x, isClosed: !x.isClosed } : x)))}
              >
                {d.isClosed ? "تعطیل" : "باز"}
              </button>
              {d.isClosed ? null : (
                <span className="dash-day-times">
                  <Field
                    label="از"
                    name={`stOpen-${mode}-${d.day}`}
                    type="time"
                    dir="ltr"
                    className="is-ltr"
                    value={d.open}
                    onChange={(e) => setDays((prev) => prev.map((x) => (x.day === d.day ? { ...x, open: e.target.value } : x)))}
                  />
                  <Field
                    label="تا"
                    name={`stClose-${mode}-${d.day}`}
                    type="time"
                    dir="ltr"
                    className="is-ltr"
                    value={d.close}
                    onChange={(e) => setDays((prev) => prev.map((x) => (x.day === d.day ? { ...x, close: e.target.value } : x)))}
                  />
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="mini-cust-hint">
          روز تعطیل، ساعت‌های آزاد همان کارمند را خالی می‌کند؛ تعطیلی کل سالن از «مدیریت سالن» ثبت می‌شود.
        </div>
      </div>

      {staff?.phone ? (
        <div className="mini-cust-block">
          <Row label="تلفن کارمند" value={<span dir="ltr">{staff.phone}</span>} />
        </div>
      ) : null}

      {err ? (
        <div className="mini-note dash-note-bad" style={{ marginTop: 12 }}>
          {err}
        </div>
      ) : null}

      <div className="dash-sticky">
        <Button variant="primary" loading={saving} disabled={saving} onClick={() => void save()} className="dash-grow">
          <Icon name="check" size={17} />
          {saving ? "در حال ذخیره…" : isEdit ? "ذخیرهٔ تغییرات" : "افزودن کارمند"}
        </Button>
      </div>

      {isEdit ? (
        <div className="dash-inline-actions dash-staff-actions">
          <button type="button" className="mini-btn soft tiny" onClick={() => void toggleActive()}>
            {isActive ? "غیرفعال کردن" : "فعال کردن"}
          </button>
          <button
            type="button"
            className={`mini-btn tiny${confirmDel ? "" : " ghost"}`}
            onClick={() => {
              if (!confirmDel) {
                setConfirmDel(true);
                return;
              }
              void remove();
            }}
          >
            <Icon name="trash" size={15} />
            {confirmDel ? "برای حذف، دوباره بزنید" : "حذف کارمند"}
          </button>
        </div>
      ) : null}
    </Sheet>
  );
}
