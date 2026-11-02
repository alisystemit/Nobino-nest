/**
 * تب‌های مدیریت سالن در مینی‌اپ — خدمات، مشتریان و مالی.
 * داده‌ها از همان endpoint های داشبورد وب می‌آیند (requireSalonManage) تا با پنل
 * یکی بمانند؛ اگر حسابی دسترسی نداشته باشد، ۴۰۳ با پیام کوتاه نمایش داده می‌شود.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Area, Button, EmptyState, Field, Icon, Row, SectionTitle, Sheet, SkeletonList } from "./ui";
import { compactToman, dayLabel, duration, faDigits, fromNow, initials, shortPrice, toman, toNumber, ymd } from "../lib/format";
import { mapi, useMini } from "../lib/store";
import type {
  CashTotals,
  CustomerMediaRow,
  CustomerNoteRow,
  CustomerProfile,
  FinancialReport,
  RevenueSeries,
  SalonCustomerRow,
  SalonServiceRow,
} from "../lib/types";

/** پیام دوستانه برای خطاهای دسترسی */
function accessText(status: number, error?: string): string {
  if (status === 403) return "این بخش برای حساب شما باز نیست؛ فقط مالک سالن می‌تواند آن را ببیند.";
  if (status === 401) return "برای دیدن این بخش وارد شوید.";
  return error || "درخواست انجام نشد";
}

/* ── خدمات / پکیج‌ها ───────────────────────────────────────────────── */

export function ServicesTab({ salonId }: { salonId: string }) {
  const { toast } = useMini();
  const [rows, setRows] = useState<SalonServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState("");
  const [busyId, setBusyId] = useState("");
  const [editing, setEditing] = useState<SalonServiceRow | "new" | null>(null);
  const [confirmId, setConfirmId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setDenied("");
    const res = await mapi<{ success: boolean; error?: string; services?: SalonServiceRow[] }>(`/api/dashboard/salons/${salonId}/services`);
    if (!res.ok) setDenied(accessText(res.status, res.data?.error));
    setRows(res.ok && Array.isArray(res.data?.services) ? res.data.services : []);
    setLoading(false);
  }, [salonId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(row: SalonServiceRow) {
    setBusyId(row.id);
    const res = await mapi<{ success: boolean; error?: string }>(`/api/dashboard/salons/${salonId}/services/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !row.isActive }),
    });
    setBusyId("");
    if (!res.ok) {
      toast(res.data?.error || "تغییر وضعیت ممکن نشد", "error");
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, isActive: !row.isActive } : r)));
    toast(row.isActive ? "پکیج از فهرست رزرو حذف شد" : "پکیج دوباره فعال شد", "ok");
  }

  async function remove(row: SalonServiceRow) {
    setBusyId(row.id);
    const res = await mapi<{ success: boolean; error?: string }>(`/api/dashboard/salons/${salonId}/services/${row.id}`, { method: "DELETE" });
    setBusyId("");
    setConfirmId("");
    if (!res.ok) {
      toast(res.data?.error || "حذف ممکن نشد؛ می‌توانید آن را غیرفعال کنید", "error");
      return;
    }
    toast("پکیج حذف شد", "ok");
    void load();
  }

  if (loading) return <SkeletonList count={4} />;
  if (denied) return <div className="mini-note">{denied}</div>;

  return (
    <>
      <SectionTitle
        title="پکیج‌های سالن"
        hint={`${faDigits(rows.length)} مورد`}
        action={
          <button type="button" className="mini-more" onClick={() => setEditing("new")}>
            + افزودن
          </button>
        }
      />
      {rows.length === 0 ? (
        <EmptyState text="هنوز پکیجی تعریف نکرده‌اید." hint="با دکمهٔ «افزودن» اولین پکیج را بسازید." />
      ) : (
        <div className="mini-list">
          {rows.map((r) => (
            <div key={r.id} className={`mini-item${r.isActive ? "" : " is-muted"}`}>
              <span className="mini-item-main">
                <span className="mini-item-title">{r.name}</span>
                <span className="mini-item-sub">
                  {duration(r.durationMin)} · {toman(r.price)}
                  {r.category ? ` · ${r.category}` : ""}
                  {r.isActive ? "" : " · غیرفعال"}
                </span>
              </span>
              <span className="mini-item-acts">
                <button
                  type="button"
                  className={`mini-icon-btn${r.isActive ? " is-on" : " is-off"}`}
                  disabled={busyId === r.id}
                  onClick={() => void toggle(r)}
                  aria-label={r.isActive ? "غیرفعال کردن" : "فعال کردن"}
                  title={r.isActive ? "غیرفعال کردن" : "فعال کردن"}
                >
                  <Icon name={r.isActive ? "check" : "close"} size={16} />
                </button>
                <button type="button" className="mini-icon-btn" onClick={() => setEditing(r)} aria-label="ویرایش" title="ویرایش">
                  <Icon name="edit" size={16} />
                </button>
                <button type="button" className="mini-icon-btn" onClick={() => setConfirmId(r.id)} aria-label="حذف" title="حذف">
                  <Icon name="trash" size={16} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <ServiceSheet salonId={salonId} row={editing === "new" ? null : editing} open={editing !== null} onClose={() => setEditing(null)} onSaved={() => void load()} />

      <Sheet open={Boolean(confirmId)} title="حذف پکیج" onClose={() => setConfirmId("")}>
        <div className="mini-note" style={{ marginBottom: 12 }}>
          اگر نوبتی با این پکیج ثبت شده باشد، حذف آن ممکن نمی‌شود؛ در این حالت «غیرفعال» کردن بهتر است چون تاریخچه را نگه می‌دارد.
        </div>
        <div className="mini-btn-row">
          <Button variant="ghost" onClick={() => setConfirmId("")}>
            بازگشت
          </Button>
          <Button
            className="danger"
            loading={busyId === confirmId}
            onClick={() => {
              const row = rows.find((r) => r.id === confirmId);
              if (row) void remove(row);
            }}
          >
            حذف کن
          </Button>
        </div>
      </Sheet>

      <div className="mini-note" style={{ marginTop: 14 }}>
        غیرفعال کردن پکیج آن را از صفحهٔ رزرو مشتری پنهان می‌کند ولی نوبت‌های قبلی را دست نمی‌زند.
      </div>
    </>
  );
}

/** شیت ساخت/ویرایش پکیج */
function ServiceSheet({
  salonId,
  row,
  open,
  onClose,
  onSaved,
}: {
  salonId: string;
  row: SalonServiceRow | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useMini();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [minutes, setMinutes] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(row?.name ?? "");
    setPrice(row ? String(row.price) : "");
    setMinutes(row ? String(row.durationMin) : "");
    setCategory(row?.category ?? "");
    setDescription(row?.description ?? "");
  }, [open, row]);

  async function save() {
    const cleanName = name.trim();
    const priceValue = toNumber(price);
    const minuteValue = toNumber(minutes);
    if (cleanName.length < 2) {
      toast("نام پکیج را کامل بنویسید", "error");
      return;
    }
    if (minuteValue < 5) {
      toast("مدت باید حداقل ۵ دقیقه باشد", "error");
      return;
    }
    setBusy(true);
    const body = JSON.stringify({
      name: cleanName,
      price: priceValue,
      durationMin: minuteValue,
      category: category.trim() || null,
      description: description.trim() || null,
    });
    const res = row
      ? await mapi<{ success: boolean; error?: string }>(`/api/dashboard/salons/${salonId}/services/${row.id}`, { method: "PATCH", body })
      : await mapi<{ success: boolean; error?: string }>(`/api/dashboard/salons/${salonId}/services`, { method: "POST", body });
    setBusy(false);
    if (!res.ok) {
      toast(res.data?.error || "ذخیره نشد", "error");
      return;
    }
    toast(row ? "پکیج ویرایش شد" : "پکیج اضافه شد", "ok");
    onSaved();
    onClose();
  }

  return (
    <Sheet open={open} title={row ? "ویرایش پکیج" : "پکیج جدید"} onClose={onClose}>
      <Field label="نام پکیج" name="svc_name" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً رنگ مو + شینیون" />
      <div className="mini-btn-row" style={{ gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="قیمت (تومان)" name="svc_price" dir="ltr" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="350000" />
        </div>
        <div style={{ flex: 1 }}>
          <Field label="مدت (دقیقه)" name="svc_min" dir="ltr" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="90" />
        </div>
      </div>
      <Field label="دسته‌بندی (اختیاری)" name="svc_cat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="مثلاً مو" />
      <Area label="توضیح (اختیاری)" name="svc_desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="همان چیزی که مشتری در صفحهٔ رزرو می‌خواند" />
      <Button onClick={save} loading={busy}>
        {row ? "ذخیرهٔ تغییرات" : "افزودن پکیج"}
      </Button>
    </Sheet>
  );
}

/* ── مشتریان ──────────────────────────────────────────────────────── */

const CUSTOMERS_PAGE = 20;

export function CustomersTab({ salonId }: { salonId: string }) {
  const { toast } = useMini();
  const [rows, setRows] = useState<SalonCustomerRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [denied, setDenied] = useState("");
  const [openRow, setOpenRow] = useState<SalonCustomerRow | null>(null);

  /**
   * replace=true یعنی شروع دوباره (جست‌وجو یا صفحهٔ اول)؛ در حالت بعدی صفحه‌های تازه
   * به انتهای فهرست اضافه می‌شوند تا کاربر جای فعلی را گم نکند (همان سبک «نوبت‌های من»).
   */
  const load = useCallback(
    async (targetPage: number, replace: boolean, search: string) => {
      if (replace) setLoading(true);
      else setLoadingMore(true);
      setDenied("");
      const params = new URLSearchParams({ page: String(targetPage), limit: String(CUSTOMERS_PAGE) });
      if (search.trim()) params.set("q", search.trim());
      const res = await mapi<{ success: boolean; error?: string; customers?: SalonCustomerRow[]; total?: number; totalPages?: number }>(
        `/api/dashboard/salons/${salonId}/customers?${params.toString()}`
      );
      if (!res.ok) setDenied(accessText(res.status, res.data?.error));
      const chunk = res.ok && Array.isArray(res.data?.customers) ? res.data.customers : [];
      setRows((prev) => {
        if (replace) return chunk;
        const seen = new Set(prev.map((c) => c.phone));
        return [...prev, ...chunk.filter((c) => !seen.has(c.phone))];
      });
      setTotal(res.data?.total ?? 0);
      setTotalPages(res.data?.totalPages ?? 1);
      setPage(targetPage);
      if (replace) setLoading(false);
      else setLoadingMore(false);
    },
    [salonId]
  );

  /* تایپ فقط یک درخواست می‌زند (دیباونس) — قبلاً onChange و effect هر دو بار می‌زدند */
  useEffect(() => {
    const id = window.setTimeout(() => void load(1, true, query), query ? 350 : 0);
    return () => window.clearTimeout(id);
  }, [salonId, query, load]);

  /** بعد از ذخیرهٔ پرونده، همان صفحه‌هایی که باز شده بودند دوباره خوانده می‌شوند */
  const reloadLoaded = useCallback(async () => {
    for (let p = 1; p <= page; p++) await load(p, p === 1, query);
  }, [load, page, query]);

  if (denied) return <div className="mini-note">{denied}</div>;

  return (
    <>
      <SectionTitle title="مشتریان" hint={loading ? "" : `${faDigits(total)} نفر`} />
      <Field
        label="جست‌وجو"
        name="cust_q"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="نام یا شمارهٔ موبایل"
      />
      {loading ? (
        <SkeletonList count={3} />
      ) : rows.length === 0 ? (
        <EmptyState text="مشتری‌ای پیدا نشد." hint="پرونده‌های مشتری از نوبت‌ها خودکار ساخته می‌شوند." />
      ) : (
        <div className="mini-list">
          {rows.map((c) => {
            const full = [c.firstName, c.lastName].filter(Boolean).join(" ") || "بدون نام";
            return (
              <button key={c.phone} type="button" className="mini-item" style={{ width: "100%", textAlign: "start" }} onClick={() => setOpenRow(c)}>
                <span className="mini-avatar" style={{ width: 34, height: 34, flex: "0 0 34px", fontSize: 13 }}>
                  {initials(full)}
                </span>
                <span className="mini-item-main">
                  <span className="mini-item-title">{full}</span>
                  <span className="mini-item-sub" dir="ltr">
                    {c.phone}
                  </span>
                </span>
                <span className="mini-item-side">
                  {c.completed ? `${faDigits(c.completed)} مراجعه` : "بدون مراجعه"}
                  <span className="mini-item-sub" style={{ display: "block" }}>{c.spend ? `${shortPrice(c.spend)} تومان` : "بدون هزینه"}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!loading && rows.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          {page < totalPages ? (
            <button
              type="button"
              className="mini-btn soft"
              disabled={loadingMore}
              onClick={() => void load(page + 1, false, query)}
            >
              {loadingMore
                ? "در حال بارگذاری…"
                : `مشتری‌های بیشتر (${faDigits(rows.length)} از ${faDigits(total)})`}
            </button>
          ) : (
            <div className="mini-option-sub" style={{ textAlign: "center" }}>
              {`همهٔ ${faDigits(total)} مشتری نمایش داده شد`}
            </div>
          )}
        </div>
      ) : null}

      <CustomerSheet salonId={salonId} row={openRow} onClose={() => setOpenRow(null)} onSaved={() => void reloadLoaded()} onToast={toast} />
    </>
  );
}

/** شیت پروندهٔ مشتری: یادداشت‌ها، عکس، ویس و دسترسی تماس */

/** سقف ضبط ویس در مینی‌اپ (ثانیه) — از حجم مجاز ویسِ سوپرادمین مشتق می‌شود (تخمین ۸KB/s؛ کف ۱۲۰ ثانیه مثل پیشین) */
const VOICE_MIN_SECONDS = 120;
const VOICE_BYTES_PER_SECOND = 8000;
function voiceMaxSeconds(voiceMaxMb: number): number {
  return Math.max(VOICE_MIN_SECONDS, Math.floor((voiceMaxMb * 1024 * 1024) / VOICE_BYTES_PER_SECOND));
}
const MB = 1024 * 1024;

function fileSizeLabel(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes >= MB) return `${(bytes / MB).toFixed(1).replace(/\.0$/, "")} مگابایت`;
  return `${Math.max(1, Math.round(bytes / 1024))} کیلوبایت`;
}

function CustomerSheet({
  salonId,
  row,
  onClose,
  onSaved,
  onToast,
}: {
  salonId: string;
  row: SalonCustomerRow | null;
  onClose: () => void;
  onSaved: () => void;
  onToast: (message: string, kind?: "info" | "ok" | "error") => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // پروندهٔ کامل (یادداشت‌ها + فایل‌ها + سقف‌هایی که سوپرادمین ست کرده است)
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const secondsRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  /** سقف ثانیه‌های ضبط، هم‌راستا با حجم مجاز ویسی که سوپرادمین ست کرده است */
  const recCapSeconds = voiceMaxSeconds(profile?.voiceMaxMb ?? 10);

  /** میکروفون و تایمر ضبط را آزاد می‌کند (بستن شیت یا unmount) */
  function releaseRecorder() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  const customerId = row?.id ?? "";

  const loadProfile = useCallback(async () => {
    if (!customerId) {
      setProfile(null);
      return;
    }
    setLoadingProfile(true);
    const res = await mapi<CustomerProfile>(`/api/dashboard/salons/${salonId}/customers/${customerId}`);
    if (res.ok) setProfile(res.data);
    else {
      setProfile(null);
      onToast(res.data?.error || "فایل‌های پرونده بارگذاری نشد", "error");
    }
    setLoadingProfile(false);
    // onToast پایدار است (useCallback در store) و در deps نمی‌آید تا حلقهٔ رندر نشود
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, salonId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (row) setNote(row.note ?? "");
  }, [row]);

  useEffect(
    () => () => {
      releaseRecorder();
    },
    []
  );

  /** در بستن شیت هم اگر ضبطی باز است بسته شود (میکروفون آزاد بماند) */
  useEffect(() => {
    if (!row) stopRecorder();
  }, [row]);

  const notes: CustomerNoteRow[] = profile?.notes ?? [];
  const media: CustomerMediaRow[] = profile?.media ?? [];
  const noteLimit = profile?.noteLimit ?? 5;
  const mediaLimit = profile?.mediaLimit ?? 10;
  const mediaEnabled = profile?.mediaEnabled !== false;
  const notesFull = notes.length >= noteLimit;
  const mediaFull = media.length >= mediaLimit;

  async function save() {
    if (!row) return;
    setBusy(true);
    const res = await mapi<{ success: boolean; error?: string }>(`/api/dashboard/salons/${salonId}/customers`, {
      method: "PATCH",
      body: JSON.stringify({ phone: row.phone, note: note.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      onToast(res.data?.error || "ذخیره نشد", "error");
      return;
    }
    onToast("یادداشت ذخیره شد", "ok");
    onSaved();
  }

  async function addNote() {
    const text = noteDraft.trim();
    if (!text || !customerId) return;
    setAddingNote(true);
    const res = await mapi<{ success: boolean; error?: string }>(`/api/dashboard/salons/${salonId}/customers/${customerId}/notes`, {
      method: "POST",
      body: JSON.stringify({ note: text }),
    });
    setAddingNote(false);
    if (!res.ok) {
      onToast(res.data?.error || "یادداشت ثبت نشد", "error");
      return;
    }
    setNoteDraft("");
    onToast("یادداشت به پرونده اضافه شد", "ok");
    void loadProfile();
  }

  async function removeNote(id: string) {
    if (!customerId) return;
    const res = await mapi<{ success: boolean; error?: string }>(
      `/api/dashboard/salons/${salonId}/customers/${customerId}/notes/${id}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      onToast(res.data?.error || "حذف یادداشت ممکن نشد", "error");
      return;
    }
    onToast("یادداشت حذف شد", "ok");
    void loadProfile();
  }

  async function uploadMedia(file: File) {
    if (!customerId) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await mapi<{ success: boolean; error?: string }>(`/api/dashboard/salons/${salonId}/customers/${customerId}/media`, {
      method: "POST",
      body: form,
    });
    setUploading(false);
    if (!res.ok) {
      onToast(res.data?.error || "بارگذاری فایل ممکن نشد", "error");
      return;
    }
    onToast("فایل به پرونده اضافه شد", "ok");
    void loadProfile();
  }

  async function removeMedia(id: string) {
    if (!customerId) return;
    const res = await mapi<{ success: boolean; error?: string }>(
      `/api/dashboard/salons/${salonId}/customers/${customerId}/media?mediaId=${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      onToast(res.data?.error || "حذف فایل ممکن نشد", "error");
      return;
    }
    onToast("فایل حذف شد", "ok");
    void loadProfile();
  }

  function stopRecorder() {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }

  async function startRecording() {
    if (!customerId) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onToast("این پیام‌رسان ضبط ویس را پشتیبانی نمی‌کند؛ از «بارگذاری ویس» استفاده کنید.", "error");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onToast("دسترسی به میکروفون داده نشد؛ مجوز را از پیام‌رسان بررسی کنید.", "error");
      return;
    }
    streamRef.current = stream;
    const mime = MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = async () => {
      const type = mime || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setRecording(false);
      if (blob.size === 0) return;
      const target = customerId;
      setUploading(true);
      const form = new FormData();
      form.append("file", blob, type === "audio/mp4" ? "voice-note.m4a" : "voice-note.webm");
      const res = await mapi<{ success: boolean; error?: string }>(`/api/dashboard/salons/${salonId}/customers/${target}/media`, {
        method: "POST",
        body: form,
      });
      setUploading(false);
      if (!res.ok) {
        onToast(res.data?.error || "ویس بارگذاری نشد", "error");
        return;
      }
      onToast("ویس ضبط‌شده به پرونده اضافه شد", "ok");
      void loadProfile();
    };
    rec.start();
    recorderRef.current = rec;
    secondsRef.current = 0;
    setRecSeconds(0);
    setRecording(true);
    timerRef.current = window.setInterval(() => {
      secondsRef.current += 1;
      setRecSeconds(secondsRef.current);
      if (secondsRef.current >= recCapSeconds) stopRecorder();
    }, 1000);
  }

  const full = row ? [row.firstName, row.lastName].filter(Boolean).join(" ") || "مشتری" : "";

  return (
    <Sheet open={Boolean(row)} title="پروندهٔ مشتری" onClose={onClose}>
      {row ? (
        <>
          <div className="mini-card" style={{ padding: 10, marginBottom: 12 }}>
            <Row label="نام" value={full} />
            <Row
              label="تماس"
              value={
                <a className="mini-link" href={`tel:${row.phone}`} dir="ltr">
                  {faDigits(row.phone)}
                </a>
              }
            />
            <Row label="مراجعهٔ انجام‌شده" value={faDigits(row.completed)} />
            <Row label="لغو / عدم حضور" value={`${faDigits(row.cancelled)} / ${faDigits(row.noShow)}`} />
            <Row label="هزینه‌کرد" value={toman(row.spend)} />
            {row.lastVisit ? <Row label="آخرین بازدید" value={dayLabel(String(row.lastVisit).slice(0, 10))} /> : null}
          </div>
          <Area label="یادداشت سالن" name="cust_note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً به رنگ بلوند حساسیت دارد" />
          <Button onClick={save} loading={busy}>
            ذخیرهٔ یادداشت
          </Button>

          {/* ── یادداشت‌های پرونده (چندتایی) ───────────────────────── */}
          <div className="mini-cust-block">
            <div className="mini-cust-head">
              <span>یادداشت‌های پرونده</span>
              <small>
                {faDigits(notes.length)} / {faDigits(noteLimit)}
              </small>
            </div>
            {loadingProfile ? (
              <SkeletonList count={2} />
            ) : notes.length === 0 ? (
              <div className="mini-cust-empty">هنوز یادداشتی در پرونده ثبت نشده است.</div>
            ) : (
              <div className="mini-cust-notes">
                {notes.map((n) => (
                  <div key={n.id} className="mini-cust-note">
                    <p>{n.note}</p>
                    <div className="mini-cust-note-foot">
                      <span>{fromNow(n.createdAt)}</span>
                      <button type="button" className="mini-cust-del" onClick={() => void removeNote(n.id)}>
                        حذف
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!notesFull ? (
              <div className="mini-cust-addrow">
                <input
                  className="mini-input"
                  value={noteDraft}
                  maxLength={2000}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="یادداشت کوتاه (حساسیت، فرم صورت، رنگ موردعلاقه…)"
                  aria-label="یادداشت جدید پرونده"
                />
                <Button tiny variant="soft" onClick={() => void addNote()} loading={addingNote} disabled={!noteDraft.trim()}>
                  افزودن
                </Button>
              </div>
            ) : (
              <div className="mini-cust-empty">به سقف {faDigits(noteLimit)} یادداشت رسیدید؛ برای افزودن، یکی را حذف کنید.</div>
            )}
          </div>

          {/* ── عکس و ویس ──────────────────────────────────────────── */}
          <div className="mini-cust-block">
            <div className="mini-cust-head">
              <span>عکس و ویس</span>
              <small>
                {faDigits(media.length)} / {faDigits(mediaLimit)}
              </small>
            </div>

            {mediaEnabled ? (
              <>
                {media.length === 0 && !loadingProfile ? <div className="mini-cust-empty">فایلی در این پرونده نیست.</div> : null}
                <div className="mini-cust-media">
                  {media.map((m) => (
                    <div key={m.id} className="mini-cust-media-item">
                      {m.type === "photo" ? (
                        <a href={m.url} target="_blank" rel="noreferrer" className="mini-cust-photo">
                          <img src={m.url} alt={m.name || "عکس مشتری"} loading="lazy" />
                        </a>
                      ) : (
                        <audio controls preload="metadata" src={m.url} className="mini-cust-audio" />
                      )}
                      <div className="mini-cust-media-foot">
                        <span>
                          {m.type === "photo" ? "عکس" : "ویس"} · {fromNow(m.createdAt)}
                          {fileSizeLabel(m.size) ? ` · ${faDigits(fileSizeLabel(m.size))}` : ""}
                        </span>
                        <button type="button" className="mini-cust-del" onClick={() => void removeMedia(m.id)} aria-label="حذف فایل">
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {recording ? (
                  <div className="mini-cust-rec">
                    <span className="mini-cust-rec-dot" aria-hidden="true" />
                    <span>در حال ضبط… {faDigits(recSeconds)} ثانیه</span>
                    <Button tiny variant="ghost" onClick={stopRecorder}>
                      <Icon name="stop" size={14} />
                      <span>توقف و ذخیره</span>
                    </Button>
                  </div>
                ) : (
                  <div className="mini-cust-actions">
                    <label className={`mini-btn soft tiny${uploading || mediaFull ? " is-disabled" : ""}`}>
                      <Icon name="camera" size={16} />
                      <span>{uploading ? "در حال بارگذاری…" : "درج عکس"}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                        style={{ display: "none" }}
                        disabled={uploading || mediaFull}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadMedia(f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <label className={`mini-btn soft tiny${uploading || mediaFull ? " is-disabled" : ""}`}>
                      <Icon name="plus" size={16} />
                      <span>بارگذاری ویس</span>
                      <input
                        type="file"
                        accept="audio/*"
                        style={{ display: "none" }}
                        disabled={uploading || mediaFull}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadMedia(f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <Button tiny variant="primary" onClick={() => void startRecording()} disabled={uploading || mediaFull}>
                      <Icon name="mic" size={15} />
                      <span>ضبط ویس</span>
                    </Button>
                  </div>
                )}
                {mediaFull ? <div className="mini-cust-empty">سقف {faDigits(mediaLimit)} فایل این پرونده پر است؛ برای افزودن، یکی را حذف کنید.</div> : null}
                <div className="mini-cust-hint">
                  حجم مجاز: عکس تا {faDigits(profile?.photoMaxMb ?? 5)} مگابایت و ویس تا {faDigits(profile?.voiceMaxMb ?? 10)} مگابایت · ضبط ویس تا{" "}
                  {faDigits(recCapSeconds)} ثانیه. این فایل‌ها فقط در همین سالن دیده می‌شوند.
                </div>
              </>
            ) : (
              <div className="mini-cust-empty">عکس و ویس در پروندهٔ مشتری از سمت پنل غیرفعال شده است.</div>
            )}
          </div>
        </>
      ) : null}
    </Sheet>
  );
}

/* ── مالی ──────────────────────────────────────────────────────────── */

export function FinanceTab({ salonId, balance }: { salonId: string; balance: number }) {
  const { toast, config } = useMini();
  const [cash, setCash] = useState<{ entries: CashEntryRow[]; todayTotals: CashTotals } | null>(null);
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [series, setSeries] = useState<RevenueSeries | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setDenied("");
    const to = ymd(new Date());
    const from = ymd(new Date(Date.now() - 30 * 864e5));
    const [cashRes, reportRes, seriesRes] = await Promise.all([
      mapi<{ success: boolean; error?: string; entries?: CashEntryRow[]; todayTotals?: CashTotals }>(`/api/dashboard/salons/${salonId}/cash?limit=8`),
      mapi<{ success: boolean; error?: string; report?: FinancialReport }>(`/api/dashboard/salons/${salonId}/financial?from=${from}&to=${to}`),
      mapi<RevenueSeries & { success: boolean }>(`/api/dashboard/salons/${salonId}/revenue`),
    ]);
    if (!cashRes.ok && !reportRes.ok) setDenied(accessText(cashRes.status, cashRes.data?.error));
    if (cashRes.ok) setCash({ entries: cashRes.data?.entries ?? [], todayTotals: cashRes.data?.todayTotals ?? { cash: 0, card: 0, online: 0, expense: 0, net: 0 } });
    if (reportRes.ok) setReport(reportRes.data?.report ?? null);
    if (seriesRes.ok) setSeries(seriesRes.data);
    setLoading(false);
  }, [salonId]);

  useEffect(() => {
    void load();
  }, [load]);

  const bars = useMemo(() => {
    if (!series?.labels?.length) return [];
    const n = series.labels.length;
    const take = Math.min(7, n);
    return series.labels.slice(n - take).map((label, i) => ({
      label,
      value: series.revenue.slice(n - take)[i] ?? 0,
      count: series.appointments.slice(n - take)[i] ?? 0,
    }));
  }, [series]);
  const barMax = Math.max(1, ...bars.map((b) => b.value));
  /** اگر درآمدی ثبت نشده باشد ستون‌ها همه صفرند و نمودار چیزی نمی‌گوید */
  const hasRevenue = bars.some((b) => b.value > 0);

  if (loading) return <SkeletonList count={3} />;
  if (denied) return <div className="mini-note">{denied}</div>;

  return (
    <>
      <SectionTitle title="صندوق امروز" hint="نقد، کارت و هزینه" />
      {cash ? (
        <div className="mini-stats is-4">
          <div className="mini-stat">
            <b>{compactToman(cash.todayTotals.cash)}</b>
            <span>نقد (تومان)</span>
          </div>
          <div className="mini-stat">
            <b>{compactToman(cash.todayTotals.card)}</b>
            <span>کارت</span>
          </div>
          <div className="mini-stat">
            <b>{compactToman(cash.todayTotals.expense)}</b>
            <span>هزینه</span>
          </div>
          <div className="mini-stat">
            <b>{compactToman(cash.todayTotals.net)}</b>
            <span>خالص</span>
          </div>
        </div>
      ) : (
        <div className="mini-note">جمع‌های امروز خوانده نشد.</div>
      )}

      <div className="mini-quick" style={{ marginTop: 12 }}>
        <Button variant="soft" onClick={() => setSheetOpen(true)}>
          <Icon name="plus" size={17} />
          ثبت درآمد/هزینه
        </Button>
      </div>

      {report ? (
        <>
          <SectionTitle title="۳۰ روز گذشته" hint={`${faDigits(report.totalAppointments)} نوبت`} />
          <div className="mini-card">
            <Row label="درآمد انجام‌شده" value={toman(report.revenue)} />
            <Row label="ارزش نوبت‌های در انتظار" value={toman(report.potentialRevenue)} />
            <Row label="تأیید نشده / لغو" value={`${faDigits(report.requested)} / ${faDigits(report.cancelled)}`} />
            {config.brand.showPrices ? <Row label="پرداخت اشتراک" value={toman(report.paidSubscriptions)} /> : null}
          </div>

          {report.topServices?.length ? (
            <>
              <SectionTitle title="پرفروش‌ترین پکیج‌ها" />
              <div className="mini-list">
                {report.topServices.map((s, i) => (
                  <div key={`${s.name}-${i}`} className="mini-item">
                    <span className="mini-item-main">
                      <span className="mini-item-title">{s.name || "بدون نام"}</span>
                      <span className="mini-item-sub">{faDigits(s.count ?? 0)} نوبت انجام‌شده</span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {bars.length ? (
        <>
          <SectionTitle title="درآمد هفت روز اخیر" hint={hasRevenue ? "ستون‌ها نسبت به هم‌اند" : ""} />
          {hasRevenue ? (
          <div className="mini-card">
            <div className="mini-bars">
              {bars.map((b) => (
                <div key={b.label} className="mini-bar" title={`${dayLabel(b.label)} — ${toman(b.value)}`}>
                  <i style={{ height: `${Math.max(3, Math.round((b.value / barMax) * 100))}%` }} />
                  <b>{faDigits(b.count)}</b>
                  <span>{dayLabel(b.label).split(" ")[0]}</span>
                </div>
              ))}
            </div>
            <div className="mini-option-sub" style={{ marginTop: 8, textAlign: "center" }}>
              عدد روی هر ستون = تعداد نوبت آن روز
            </div>
          </div>
          ) : (
            <div className="mini-note">در هفت روز اخیر درآمدی ثبت نشده است؛ ستون‌ها از «ثبت صندوق» و نوبت‌های انجام‌شده پر می‌شوند.</div>
          )}
        </>
      ) : null}

      {cash?.entries?.length ? (
        <>
          <SectionTitle title="آخرین ثبت‌ها" />
          <div className="mini-list">
            {cash.entries.slice(0, 8).map((e) => (
              <div key={e.id} className="mini-item">
                <span className="mini-item-main">
                  <span className="mini-item-title">{e.note || (e.branchName ? `شعبهٔ ${e.branchName}` : "ثبت صندوق")}</span>
                  <span className="mini-item-sub">
                    نقد {compactToman(e.cashAmount)} · کارت {compactToman(e.cardAmount)} · آنلاین {compactToman(e.onlineAmount)}
                    {e.expenseAmount ? ` · هزینه ${compactToman(e.expenseAmount)}` : ""}
                  </span>
                </span>
                <span className="mini-item-side">{dayLabel(String(e.createdAt).slice(0, 10))}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <div className="mini-card" style={{ marginTop: 14 }}>
        <Row label="موجودی کیف پول" value={toman(balance)} />
        <div className="mini-option-sub" style={{ marginTop: 6, lineHeight: 1.9 }}>
          برای درخواست تسویه، فاکتور و گزارش کامل به پنل وب بروید.
        </div>
      </div>

      <CashSheet salonId={salonId} open={sheetOpen} onClose={() => setSheetOpen(false)} onSaved={() => void load()} onToast={toast} />
    </>
  );
}

type CashEntryRow = {
  id: string;
  cashAmount: number;
  cardAmount: number;
  onlineAmount: number;
  expenseAmount: number;
  note: string | null;
  createdAt: string;
  branch?: { name: string } | null;
  branchName?: string;
};

/** شیت ثبت سریع درآمد/هزینهٔ روز */
function CashSheet({
  salonId,
  open,
  onClose,
  onSaved,
  onToast,
}: {
  salonId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onToast: (message: string, kind?: "info" | "ok" | "error") => void;
}) {
  const [cash, setCash] = useState("");
  const [card, setCard] = useState("");
  const [online, setOnline] = useState("");
  const [expense, setExpense] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCash("");
    setCard("");
    setOnline("");
    setExpense("");
    setNote("");
  }, [open]);

  async function save() {
    const body = {
      cashAmount: toNumber(cash),
      cardAmount: toNumber(card),
      onlineAmount: toNumber(online),
      expenseAmount: toNumber(expense),
      note: note.trim() || undefined,
    };
    if (!body.cashAmount && !body.cardAmount && !body.onlineAmount && !body.expenseAmount) {
      onToast("حداقل یک مبلغ را وارد کنید", "error");
      return;
    }
    setBusy(true);
    const res = await mapi<{ success: boolean; error?: string }>(`/api/dashboard/salons/${salonId}/cash`, { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) {
      onToast(res.data?.error || "ثبت نشد", "error");
      return;
    }
    onToast("به صندوق اضافه شد", "ok");
    onSaved();
    onClose();
  }

  return (
    <Sheet open={open} title="ثبت در صندوق" onClose={onClose}>
      <div className="mini-btn-row" style={{ gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="نقد" name="cash_a" dir="ltr" inputMode="numeric" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" />
        </div>
        <div style={{ flex: 1 }}>
          <Field label="کارت" name="card_a" dir="ltr" inputMode="numeric" value={card} onChange={(e) => setCard(e.target.value)} placeholder="0" />
        </div>
      </div>
      <div className="mini-btn-row" style={{ gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="آنلاین" name="online_a" dir="ltr" inputMode="numeric" value={online} onChange={(e) => setOnline(e.target.value)} placeholder="0" />
        </div>
        <div style={{ flex: 1 }}>
          <Field label="هزینه" name="expense_a" dir="ltr" inputMode="numeric" value={expense} onChange={(e) => setExpense(e.target.value)} placeholder="0" />
        </div>
      </div>
      <Field label="توضیح (اختیاری)" name="cash_note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً فروش ماسک مو" />
      <Button onClick={save} loading={busy}>
        ثبت
      </Button>
      <div className="mini-option-sub" style={{ marginTop: 10, textAlign: "center", lineHeight: 1.9 }}>
        این ثبت فقط در صندوق سالن است و روی نوبت‌ها اثری ندارد.
      </div>
    </Sheet>
  );
}
