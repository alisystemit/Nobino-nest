/**
 * خدمات و پکیج‌ها — نسخهٔ مینی‌استایل از تب «خدمات» در /dashboard/salon.
 *
 * همان مسیرهای پنل وب:
 *  • GET/POST           /api/dashboard/salons/:id/services
 *  • PATCH/DELETE       /api/dashboard/salons/:id/services/:sid
 * مدت، قیمت، دسته‌بندی و «استراحت بین نوبت‌ها» (bufferMin) همان چهار فیلدی هستند که
 * ساعت‌های آزاد و کارت خدمات صفحهٔ عمومی را می‌سازند؛ توضیح (description) هم که در
 * انتخابگر خدمات مینی‌اپ نمایش داده می‌شود این‌جا ویرایش می‌شود.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Area, Button, Chip, EmptyState, Field, Icon, SectionTitle, Sheet, SkeletonList } from "@/mini/components/ui";
import { duration, faDigits, shortPrice, toman } from "@/mini/lib/format";
import { dapi } from "../lib/api";
import { SalonSwitcher, StatGrid } from "../lib/parts";
import { useDash } from "../lib/store";

type ServiceRow = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  description?: string | null;
  category?: string | null;
  bufferMin?: number | null;
  isActive: boolean;
};

const int = (raw: string, min = 0): number => {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, n);
};

export default function DashServices() {
  const { salonId, payload, toast } = useDash();
  const navigate = useNavigate();

  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cat, setCat] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [editId, setEditId] = useState("");

  const load = useCallback(async () => {
    if (!salonId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const res = await dapi<{ success: boolean; error?: string; services?: ServiceRow[] }>(`/api/dashboard/salons/${salonId}/services`);
    if (!res.ok) setError(res.data?.error || "بارگذاری خدمات ممکن نشد.");
    else setRows(res.data.services ?? []);
    setLoading(false);
  }, [salonId]);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const s of rows) if (s.category?.trim()) set.add(s.category.trim());
    return Array.from(set);
  }, [rows]);

  const shown = useMemo(() => (cat ? rows.filter((s) => (s.category ?? "").trim() === cat) : rows), [rows, cat]);
  const editing = useMemo(() => rows.find((s) => s.id === editId) ?? null, [rows, editId]);
  const activeCount = rows.filter((s) => s.isActive).length;
  const avgPrice = rows.length ? Math.round(rows.reduce((sum, s) => sum + (s.price || 0), 0) / rows.length) : 0;

  if (!salonId) {
    return (
      <div className="mini-fade">
        <SectionTitle title="خدمات و پکیج‌ها" hint="ابتدا یک سالن انتخاب کنید." />
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
        <SectionTitle title="خدمات و پکیج‌ها" hint={loading ? "" : `${faDigits(rows.length)} خدمت`} />
        <div className="mini-actions" style={{ marginInlineStart: "auto" }}>
          {payload?.publicUrl ? (
            <button type="button" className="mini-btn soft tiny" onClick={() => window.open(payload.publicUrl, "_blank", "noopener")}>
              <Icon name="link" size={15} />
              صفحهٔ عمومی
            </button>
          ) : null}
          <button type="button" className="mini-btn tiny" onClick={() => setOpenNew(true)}>
            <Icon name="plus" size={15} />
            افزودن خدمت
          </button>
          <SalonSwitcher />
        </div>
      </div>

      <StatGrid
        loading={loading}
        cells={[
          { value: faDigits(rows.length), label: "کل خدمات" },
          { value: faDigits(activeCount), label: "فعال" },
          { value: faDigits(rows.length - activeCount), label: "غیرفعال" },
          { value: rows.length ? shortPrice(avgPrice) : "—", label: "میانگین قیمت" },
        ]}
      />

      {error ? (
        <div className="mini-note dash-note-bad" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}

      {categories.length > 1 ? (
        <div className="mini-chips" style={{ marginTop: 12 }}>
          <Chip on={cat === ""} onClick={() => setCat("")}>
            همه
          </Chip>
          {categories.map((c) => (
            <Chip key={c} on={cat === c} onClick={() => setCat(c)}>
              {c}
            </Chip>
          ))}
        </div>
      ) : null}

      <SectionTitle title="فهرست خدمات" hint="مدت و قیمت این‌جا ساعت‌های آزاد را می‌سازد." />
      {loading ? (
        <SkeletonList count={3} />
      ) : shown.length === 0 ? (
        <EmptyState
          text={rows.length ? "در این دسته‌بندی خدمتی نیست." : "هنوز خدمتی تعریف نشده است."}
          hint={rows.length ? "چیپ «همه» را بزنید." : "با دکمهٔ «افزودن خدمت» اولین خدمت را بسازید."}
        />
      ) : (
        <div className="mini-list">
          {shown.map((s) => (
            <button key={s.id} type="button" className="mini-item" style={{ width: "100%", textAlign: "start" }} onClick={() => setEditId(s.id)}>
              <span className="mini-item-main">
                <span className="mini-item-title">{s.name}</span>
                <span className="mini-item-sub">
                  {duration(s.durationMin)} · {toman(s.price)}
                  {s.category ? ` · ${s.category}` : ""}
                  {s.bufferMin ? ` · استراحت ${faDigits(s.bufferMin)} دقیقه` : ""}
                </span>
              </span>
              <span className="mini-item-side">
                <span className={`dash-tag${s.isActive ? "" : " is-off"}`}>{s.isActive ? "فعال" : "غیرفعال"}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="dash-section-note" style={{ marginTop: 12 }}>
        خدمت غیرفعال در صفحهٔ عمومی و مینی‌اپ نمایش داده نمی‌شود، اما نوبت‌های گذشته‌اش دست‌نخورده می‌مانند. خرید یا تمدید اشتراک پلتفرم در
        بخش «پکیج‌ها» است.
      </div>

      <div style={{ marginTop: 12 }}>
        <Button variant="soft" onClick={() => navigate("/dash/packages")}>
          <Icon name="star" size={17} />
          پکیج‌ها و اشتراک
        </Button>
      </div>

      <ServiceSheet mode="new" open={openNew} onClose={() => setOpenNew(false)} onSaved={() => void load()} toast={toast} />
      <ServiceSheet mode="edit" open={!!editing} service={editing} onClose={() => setEditId("")} onSaved={() => void load()} toast={toast} />
    </div>
  );
}

/* ── شیت خدمت ──────────────────────────────────────────────────────── */

function ServiceSheet({
  mode,
  open,
  service,
  onClose,
  onSaved,
  toast,
}: {
  mode: "new" | "edit";
  open: boolean;
  service?: ServiceRow | null;
  onClose: () => void;
  onSaved: () => void;
  toast: (message: string, kind?: "info" | "ok" | "error") => void;
}) {
  const { salonId } = useDash();
  const [name, setName] = useState("");
  const [durationMin, setDurationMin] = useState("30");
  const [price, setPrice] = useState("0");
  const [category, setCategory] = useState("");
  const [bufferMin, setBufferMin] = useState("0");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (!open) {
      setErr("");
      setConfirmDel(false);
      return;
    }
    setName(service?.name ?? "");
    setDurationMin(String(service?.durationMin ?? 30));
    setPrice(String(service?.price ?? 0));
    setCategory(service?.category ?? "");
    setBufferMin(String(service?.bufferMin ?? 0));
    setDescription(service?.description ?? "");
    setIsActive(service?.isActive ?? true);
    setErr("");
    setConfirmDel(false);
  }, [open, service]);

  const base = salonId ? `/api/dashboard/salons/${salonId}` : "";
  const isEdit = mode === "edit" && !!service;
  const serviceId = service?.id ?? "";

  async function save() {
    if (!base) return;
    if (!name.trim()) {
      setErr("نام خدمت را وارد کنید.");
      return;
    }
    const dur = int(durationMin, 1);
    if (dur < 1) {
      setErr("مدت خدمت باید حداقل یک دقیقه باشد.");
      return;
    }
    setErr("");
    setSaving(true);
    const body: Record<string, unknown> = {
      name: name.trim(),
      durationMin: dur,
      price: int(price),
      category: category.trim() || null,
      description: description.trim() || null,
      bufferMin: int(bufferMin),
    };
    if (isEdit) body.isActive = isActive;
    const res = await dapi<{ success: boolean; error?: string }>(isEdit && serviceId ? `${base}/services/${serviceId}` : `${base}/services`, {
      method: isEdit ? "PATCH" : "POST",
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      setErr(res.data?.error || (isEdit ? "ویرایش خدمت ممکن نشد." : "افزودن خدمت ممکن نشد."));
      return;
    }
    toast(isEdit ? "خدمت به‌روزرسانی شد" : "خدمت اضافه شد", "ok");
    onSaved();
    if (!isEdit) {
      setName("");
      setDurationMin("30");
      setPrice("0");
      setCategory("");
      setBufferMin("0");
      setDescription("");
    }
    onClose();
  }

  async function toggleActive() {
    if (!isEdit || !base || !serviceId) return;
    const res = await dapi<{ success: boolean; error?: string }>(`${base}/services/${serviceId}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !isActive }),
    });
    if (!res.ok) {
      setErr(res.data?.error || "تغییر وضعیت ممکن نشد.");
      return;
    }
    setIsActive((v) => !v);
    toast(isActive ? "خدمت غیرفعال شد" : "خدمت فعال شد", "ok");
    onSaved();
  }

  async function remove() {
    if (!isEdit || !base || !serviceId) return;
    const res = await dapi<{ success: boolean; error?: string }>(`${base}/services/${serviceId}`, { method: "DELETE" });
    if (!res.ok) {
      setErr(res.data?.error || "حذف خدمت ممکن نشد.");
      return;
    }
    toast("خدمت حذف شد", "ok");
    onSaved();
    onClose();
  }

  return (
    <Sheet open={open} title={isEdit ? `ویرایش ${service?.name ?? ""}` : "خدمت جدید"} onClose={onClose}>
      <div className="mini-cust-head">
        <span>اطلاعات خدمت</span>
        <small>{isActive ? "فعال" : "غیرفعال"}</small>
      </div>

      <Field label="نام خدمت" name={`svName-${mode}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً ژل پاکیور" />
      <div className="dash-two" style={{ marginTop: 10 }}>
        <Field
          label="مدت (دقیقه)"
          name={`svDur-${mode}`}
          type="number"
          min={1}
          step={5}
          inputMode="numeric"
          className="is-ltr"
          value={durationMin}
          onChange={(e) => setDurationMin(e.target.value)}
        />
        <Field
          label="قیمت (تومان)"
          name={`svPrice-${mode}`}
          type="number"
          min={0}
          step={1000}
          inputMode="numeric"
          className="is-ltr"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </div>
      <div className="dash-two" style={{ marginTop: 10 }}>
        <Field label="دسته‌بندی" name={`svCat-${mode}`} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="مثلاً ناخن" />
        <Field
          label="استراحت بعد از خدمت (دقیقه)"
          name={`svBuf-${mode}`}
          type="number"
          min={0}
          step={5}
          inputMode="numeric"
          className="is-ltr"
          value={bufferMin}
          onChange={(e) => setBufferMin(e.target.value)}
        />
      </div>
      <div style={{ marginTop: 10 }}>
        <Area
          label="توضیح کوتاه"
          name={`svDesc-${mode}`}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="همین متن در انتخابگر خدمات مینی‌اپ و صفحهٔ عمومی نمایش داده می‌شود."
        />
      </div>

      <div className="mini-note" style={{ marginTop: 12 }}>
        {duration(int(durationMin, 1))} · {toman(int(price))}
        {int(bufferMin) > 0 ? ` · ${faDigits(int(bufferMin))} دقیقه فاصله تا نوبت بعد` : ""}
      </div>

      {err ? (
        <div className="mini-note dash-note-bad" style={{ marginTop: 10 }}>
          {err}
        </div>
      ) : null}

      <div className="dash-sticky">
        <Button variant="primary" loading={saving} disabled={saving} onClick={() => void save()} className="dash-grow">
          <Icon name="check" size={17} />
          {saving ? "در حال ذخیره…" : isEdit ? "ذخیرهٔ تغییرات" : "افزودن خدمت"}
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
            {confirmDel ? "برای حذف، دوباره بزنید" : "حذف خدمت"}
          </button>
        </div>
      ) : null}
    </Sheet>
  );
}
