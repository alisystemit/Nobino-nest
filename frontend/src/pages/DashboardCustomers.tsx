/**
 * صفحه مدیریت مشتریان سالن — لیست کامل مشتریان + پروندهٔ کامل هر مشتری
 * (یادداشت‌ها، عکس‌ها و پیام‌های صوتی).
 */
import { useState, useEffect, useRef } from "react";
import { Navigate, Link, useSearchParams } from "@/router-shim";
import { Search, MoreVertical, X, Plus, Trash2, Upload, Mic } from "lucide-react";
import { formatToman, toPersianDigits } from "@/lib/utils";
import { getUploadLimits, mbToBytes, sizeHintFa, uploadLimitsSync } from "@/lib/upload-limits";
import { useAuth } from "@/auth";
import DashboardShell from "@/components/DashboardShell";
import Pagination from "@/components/ui/Pagination";

/**
 * سقف ضبط ویس پرونده — از «حجم مجاز ویس پرونده» سوپرادمین مشتق می‌شود.
 * مبنای تخمین همان ۸KB/s سرور برای webm است؛ کف ۶۰ ثانیه تا رفتار پیشین
 * با پایین آمدن سقف تغییر ناگهانی نکند.
 */
const RECORD_MIN_SECONDS = 60;
const BYTES_PER_SECOND = 8000;

/** سقف حجم فایل پرونده: اول مقدار همان پرونده از سرور، بعد کش سوپرادمین، بعد پیش‌فرض */
function crmMaxMb(detail: { photoMaxMb?: number; voiceMaxMb?: number } | null, kind: "photo" | "voice"): number {
  const fromDetail = detail ? (kind === "voice" ? detail.voiceMaxMb : detail.photoMaxMb) : undefined;
  const fromPanel = uploadLimitsSync().crm[kind === "voice" ? "voiceMaxMb" : "photoMaxMb"];
  return Number(fromDetail ?? fromPanel) || Number(fromPanel) || (kind === "voice" ? 10 : 5);
}

type Customer = {
  id: string;
  phone: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  visits: number;
  completed: number;
  cancelled: number;
  noShow: number;
  spend: number;
  lastVisitAt?: string | null;
  lastVisit?: string | null;
  createdAt: string;
  notesCount?: number;
  mediaCount?: number;
  notes?: { id: string; note: string; createdAt: string }[];
};

type Note = { id: string; note: string; createdAt: string };
type Media = {
  id: string;
  type: "photo" | "voice";
  url: string;
  name?: string | null;
  mimeType?: string | null;
  size?: number;
  createdAt: string;
};
type CustomerAppt = {
  id: string;
  startAt: string;
  status: string;
  channel?: string | null;
  service?: { name: string; price: number } | null;
  employee?: { name: string } | null;
  branch?: { name: string } | null;
};
type DetailCustomer = Customer & {
  notes: Note[];
  media: Media[];
};

type Detail = {
  customer: DetailCustomer;
  appointments: CustomerAppt[];
  stats: { visits: number; completed: number; cancelled: number; noShow: number; spend: number; lastVisit: string | null };
  noteLimit: number;
  mediaLimit: number;
  /** سقف حجم و فعال/غیرفعال بودن فایل‌ها — از تنظیمات سوپرادمین */
  photoMaxMb?: number;
  voiceMaxMb?: number;
  mediaEnabled?: boolean;
};

const APPT_STATUS: Record<string, { label: string; cls: string }> = {
  REQUESTED: { label: "در انتظار", cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  CONFIRMED: { label: "تأییدشده", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  COMPLETED: { label: "انجام‌شده", cls: "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
  CANCELLED: { label: "لغوشده", cls: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300" },
  NO_SHOW: { label: "عدم حضور", cls: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400" },
};

export default function DashboardCustomersPage() {
  const { me } = useAuth();
  const sp = useSearchParams();
  const salon = sp.get("salon") ?? undefined;

  const [mySalons, setMySalons] = useState<{ id: string; name: string }[]>([]);
  const [loadingSalons, setLoadingSalons] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSalonId, setSelectedSalonId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // پروندهٔ کامل مشتری
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  /** سقف نمایش داده‌شدهٔ ضبط (ثانیه) — مشتق‌شده از حجم ویس سوپرادمین */
  const [recordCap, setRecordCap] = useState(RECORD_MIN_SECONDS);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** سقف ثانیه‌های ضبط (از حجم ویس سوپرادمین)، برای خواندن از داخل تایمر */
  const recordCapRef = useRef<number>(RECORD_MIN_SECONDS);

  // پیش‌پرکردن سقف‌ها تا راهنمای حجم و سقف ضبط، از همان اولین render درست باشد
  useEffect(() => {
    void getUploadLimits().then((l) => {
      recordCapRef.current = Math.max(RECORD_MIN_SECONDS, Math.floor(mbToBytes(l.crm.voiceMaxMb) / BYTES_PER_SECOND));
    });
  }, []);

  useEffect(() => {
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

  useEffect(() => {
    if (selectedSalonId) {
      fetchCustomers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSalonId, search, page]);

  async function fetchCustomers() {
    setLoadingCustomers(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      params.set("page", String(page));
      params.set("limit", "25");
      const res = await fetch(`/api/dashboard/salons/${selectedSalonId}/customers?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setCustomers(data.customers);
        setTotal(data.total ?? 0);
        setTotalPages(Math.max(1, Math.ceil((data.total ?? 0) / 25)));
      } else {
        setError(data.error || "خطا در دریافت مشتریان");
      }
    } catch {
      setError("خطا در اتصال به سرور");
    } finally {
      setLoadingCustomers(false);
    }
  }

  // ── پروندهٔ کامل ────────────────────────────────────────────────
  function loadDetail(customerId: string) {
    setLoadingDetail(true);
    setDetailError(null);
    setDetail(null);
    fetch(`/api/dashboard/salons/${selectedSalonId}/customers/${customerId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setDetail(d);
        else setDetailError(d.error || "خطا در بارگذاری پرونده");
      })
      .catch(() => setDetailError("خطا در اتصال به سرور"))
      .finally(() => setLoadingDetail(false));
  }

  useEffect(() => {
    if (selectedCustomer && selectedSalonId) loadDetail(selectedCustomer.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer, selectedSalonId]);

  async function addNote() {
    const text = noteText.trim();
    if (!text || !selectedCustomer) return;
    setSavingNote(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/dashboard/salons/${selectedSalonId}/customers/${selectedCustomer.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: text }),
      });
      const d = await res.json();
      if (d.success) {
        setNoteText("");
        loadDetail(selectedCustomer.id);
      } else {
        setDetailError(d.error || "خطا در افزودن یادداشت");
      }
    } catch {
      setDetailError("خطا در اتصال به سرور");
    } finally {
      setSavingNote(false);
    }
  }

  async function deleteNote(noteId: string) {
    if (!selectedCustomer) return;
    const res = await fetch(`/api/dashboard/salons/${selectedSalonId}/customers/${selectedCustomer.id}/notes/${noteId}`, { method: "DELETE" });
    const d = await res.json();
    if (d.success) loadDetail(selectedCustomer.id);
    else setDetailError(d.error || "خطا در حذف یادداشت");
  }

  async function uploadMedia(file: File) {
    if (!selectedCustomer) return;
    // پیش‌بررسی حجم با سقف پنل (CRM پرونده) — بررسی نهایی سمت سرور است
    const isVoice = (file.type || "").startsWith("audio/");
    const maxMb = crmMaxMb(detail, isVoice ? "voice" : "photo");
    if (file.size > mbToBytes(maxMb)) {
      setDetailError(`حجم ${isVoice ? "ویس" : "عکس"} ${sizeHintFa(maxMb)}`);
      return;
    }
    setUploading(true);
    setDetailError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/dashboard/salons/${selectedSalonId}/customers/${selectedCustomer.id}/media`, { method: "POST", body: fd });
      const d = await res.json();
      if (d.success) loadDetail(selectedCustomer.id);
      else setDetailError(d.error || "خطا در بارگذاری فایل");
    } catch {
      setDetailError("خطا در اتصال به سرور");
    } finally {
      setUploading(false);
    }
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function startRecording() {
    if (!selectedCustomer) return;
    const customerId = selectedCustomer.id;
    setDetailError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setDetailError("دسترسی به میکروفون ممکن نشد؛ مجوز را بررسی کنید.");
      return;
    }
    streamRef.current = stream;
    // سقف ضبط از حجم ویس پروندهٔ سوپرادمین (با کف ۶۰ ثانیه)
    const capSec = Math.max(RECORD_MIN_SECONDS, Math.floor(mbToBytes(crmMaxMb(detail, "voice")) / BYTES_PER_SECOND));
    recordCapRef.current = capSec;
    setRecordCap(capSec);
    const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setRecording(false);
      stopTimer();
      if (blob.size === 0) return;
      const maxVoiceMb = crmMaxMb(detail, "voice");
      if (blob.size > mbToBytes(maxVoiceMb)) {
        setDetailError(`حجم ویس ${sizeHintFa(maxVoiceMb)} — ضبط را کوتاه‌تر کنید.`);
        return;
      }
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append("file", blob, "voice-note.webm");
        const res = await fetch(`/api/dashboard/salons/${selectedSalonId}/customers/${customerId}/media`, { method: "POST", body: fd });
        const d = await res.json();
        if (d.success) loadDetail(selectedCustomer.id);
        else setDetailError(d.error || "خطا در بارگذاری صدا");
      } catch {
        setDetailError("خطا در اتصال به سرور");
      } finally {
        setUploading(false);
      }
    };
    rec.start();
    recorderRef.current = rec;
    setRecording(true);
    setRecordSeconds(0);
    timerRef.current = setInterval(() => {
      setRecordSeconds((sec) => {
        // سقف پنل رد شد: ضبط خودکار متوقف و همان مقدار ذخیره می‌شود
        if (sec + 1 >= recordCapRef.current) {
          if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
          return recordCapRef.current;
        }
        return sec + 1;
      });
    }, 1000);
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }

  useEffect(() => () => stopTimer(), []);

  async function deleteMedia(mediaId: string) {
    if (!selectedCustomer) return;
    const res = await fetch(`/api/dashboard/salons/${selectedSalonId}/customers/${selectedCustomer.id}/media?mediaId=${encodeURIComponent(mediaId)}`, { method: "DELETE" });
    const d = await res.json();
    if (d.success) loadDetail(selectedCustomer.id);
    else setDetailError(d.error || "خطا در حذف فایل");
  }

  if (!me) return <Navigate to="/login" replace />;

  if (loadingSalons) {
    return (
      <DashboardShell role={me.role} title="مشتریان">
        <div className="py-16 text-center text-neutral-500">در حال بارگذاری…</div>
      </DashboardShell>
    );
  }

  if (mySalons.length === 0) return <Navigate to="/dashboard/salon" replace />;

  const activeSalon = mySalons.find((ms) => ms.id === selectedSalonId);
  const salonName = activeSalon?.name || "سالن";

  /* ── مودال پروندهٔ کامل ───────────────────────────────────────── */
  function DetailModal() {
    if (!selectedCustomer) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-neutral-900">
          {/* سربرگ */}
          <div className="flex items-center justify-between border-b border-neutral-100 p-4 dark:border-neutral-800">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-purple-600 text-xl text-white">
                {selectedCustomer.name ? selectedCustomer.name[0] : selectedCustomer.phone[0]}
              </div>
              <div>
                <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                  {selectedCustomer.name || "بدون نام"}
                </h2>
                <div className="text-sm text-neutral-500" dir="ltr">{selectedCustomer.phone}</div>
              </div>
            </div>
            <button onClick={() => setSelectedCustomer(null)} className="rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="max-h-[65vh] overflow-y-auto p-4 space-y-4">
            {loadingDetail && <p className="py-10 text-center text-neutral-500">در حال بارگذاری پرونده…</p>}
            {detailError && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">{detailError}</div>
            )}
            {!loadingDetail && detail && (
              <>
                {/* آمار */}
                <div className="rounded-xl bg-neutral-50 p-4 dark:bg-neutral-800">
                  <h3 className="mb-3 text-sm font-bold text-neutral-700 dark:text-neutral-300">آمار مشتری</h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <div className="text-center">
                      <div className="text-2xl font-black text-neutral-900 dark:text-neutral-100">{toPersianDigits(detail.stats.visits)}</div>
                      <div className="text-[10px] text-neutral-500">نوبت</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-black text-emerald-600">{toPersianDigits(detail.stats.completed)}</div>
                      <div className="text-[10px] text-neutral-500">مراجعه</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-black text-amber-600">{toPersianDigits(detail.stats.cancelled)}</div>
                      <div className="text-[10px] text-neutral-500">لغو</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-black text-red-500">{toPersianDigits(detail.stats.noShow)}</div>
                      <div className="text-[10px] text-neutral-500">عدم حضور</div>
                    </div>
                    <div className="col-span-2 text-center sm:col-span-1">
                      <div className="text-2xl font-black text-pink-600">{formatToman(detail.stats.spend)}</div>
                      <div className="text-[10px] text-neutral-500">مجموع خرج</div>
                    </div>
                  </div>
                </div>

                {/* نوبت‌های قبلی */}
                <div className="rounded-xl bg-neutral-50 p-4 dark:bg-neutral-800">
                  <h3 className="mb-3 text-sm font-bold text-neutral-700 dark:text-neutral-300">نوبت‌های قبلی</h3>
                  {detail.appointments.length === 0 ? (
                    <p className="text-sm text-neutral-400">نوبتی ثبت نشده است.</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.appointments.slice(0, 20).map((a) => {
                        const st = APPT_STATUS[a.status] ?? { label: a.status, cls: "bg-neutral-100 text-neutral-500" };
                        return (
                          <div key={a.id} className="rounded-xl border border-neutral-100 bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-900">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-bold text-neutral-700 dark:text-neutral-200">
                                {new Date(a.startAt).toLocaleDateString("fa-IR", { day: "numeric", month: "long" })} —{" "}
                                {new Date(a.startAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.label}</span>
                            </div>
                            <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                              {a.service?.name ?? "بدون خدمت"}
                              {a.service?.price != null ? ` — ${formatToman(a.service.price)}` : ""}
                              {a.employee?.name ? ` · ${a.employee.name}` : ""}
                              {a.branch?.name ? ` · ${a.branch.name}` : ""}
                            </div>
                          </div>
                        );
                      })}
                      {detail.appointments.length > 20 && (
                        <p className="text-[11px] text-neutral-400">و {toPersianDigits(detail.appointments.length - 20)} نوبت دیگر</p>
                      )}
                    </div>
                  )}
                </div>

                {/* یادداشت‌ها */}
                <div className="rounded-xl bg-neutral-50 p-4 dark:bg-neutral-800">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-neutral-700 dark:text-neutral-300">یادداشت‌ها</h3>
                    <span className="text-[11px] text-neutral-400">{toPersianDigits(detail.customer.notes.length)} / {toPersianDigits(detail.noteLimit)}</span>
                  </div>
                  <div className="space-y-2">
                    {detail.customer.notes.length === 0 && <p className="text-sm text-neutral-400">یادداشتی ثبت نشده است.</p>}
                    {detail.customer.notes.map((n: Note) => (
                      <div key={n.id} className="flex items-start justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-900/20">
                        <div>
                          <p className="text-xs leading-5 text-amber-900 dark:text-amber-200">{n.note}</p>
                          <span className="text-[10px] text-amber-700/70 dark:text-amber-300/60">
                            {toPersianDigits(new Date(n.createdAt).toLocaleString("fa-IR"))}
                          </span>
                        </div>
                        <button onClick={() => deleteNote(n.id)} className="shrink-0 text-[10px] font-bold text-red-500 hover:text-red-700">
                          حذف
                        </button>
                      </div>
                    ))}
                  </div>
                  {detail.customer.notes.length < detail.noteLimit && (
                    <div className="mt-3 flex gap-2">
                      <input
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="یادداشت جدید (مثلاً حساسیت، رنگ موردعلاقه...)"
                        maxLength={2000}
                        className="h-11 flex-1 rounded-xl border border-neutral-300 px-3 text-sm outline-none focus:border-pink-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                      />
                      <button
                        onClick={addNote}
                        disabled={savingNote || !noteText.trim()}
                        className="flex h-11 items-center gap-1.5 rounded-xl bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
                      >
                        <Plus className="h-4 w-4" />
                        {savingNote ? "..." : "افزودن"}
                      </button>
                    </div>
                  )}
                </div>

                {/* عکس‌ها و صداها */}
                <div className="rounded-xl bg-neutral-50 p-4 dark:bg-neutral-800">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-neutral-700 dark:text-neutral-300">عکس‌ها و صداها</h3>
                    <span className="text-[11px] text-neutral-400">{toPersianDigits(detail.customer.media.length)} / {toPersianDigits(detail.mediaLimit)}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {detail.customer.media.map((m: Media) => (
                      <div key={m.id} className="group relative overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                        {m.type === "photo" ? (
                          <img src={m.url} alt={m.name ?? "عکس مشتری"} className="h-28 w-full object-cover" />
                        ) : (
                          <div className="flex h-28 flex-col items-center justify-center gap-1 bg-neutral-100 px-2 dark:bg-neutral-800">
                            <span className="text-xl">🎙️</span>
                            <audio controls src={m.url} className="w-full" />
                          </div>
                        )}
                        <button
                          onClick={() => deleteMedia(m.id)}
                          className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-md bg-black/65 text-white transition hover:bg-red-600"
                          title="حذف فایل"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {detail.customer.media.length === 0 && (
                      <p className="col-span-full py-4 text-center text-sm text-neutral-400">فایلی بارگذاری نشده است.</p>
                    )}
                  </div>

                  {detail.mediaEnabled !== false && detail.customer.media.length < detail.mediaLimit && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label className="flex h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-neutral-100 px-3 text-xs font-bold text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700">
                        {uploading ? "در حال بارگذاری..." : <><Upload className="h-4 w-4" /> عکس</>}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                          className="hidden"
                          disabled={uploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadMedia(f);
                            e.target.value = "";
                          }}
                        />
                      </label>

                      {recording ? (
                        <button
                          onClick={stopRecording}
                          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-red-500 px-3 text-xs font-black text-white shadow-md transition hover:bg-red-600"
                        >
                          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
                          توقف ضبط · {toPersianDigits(recordSeconds)} از {toPersianDigits(recordCap)} ثانیه
                        </button>
                      ) : (
                        <button
                          onClick={startRecording}
                          disabled={uploading}
                          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-gradient-to-l from-pink-600 to-purple-600 px-3 text-xs font-black text-white shadow-md shadow-pink-500/25 transition hover:opacity-95 disabled:opacity-50"
                        >
                          <Mic className="h-4 w-4" />
                          ضبط ویس
                        </button>
                      )}

                      <span className="self-center text-[11px] text-neutral-400">
                        عکس تا {toPersianDigits(crmMaxMb(detail, "photo"))} مگابایت، ویس تا {toPersianDigits(crmMaxMb(detail, "voice"))} مگابایت — فقط در همین سالن دیده می‌شوند.
                      </span>
                    </div>
                  )}

                  {detail.mediaEnabled === false && (
                    <p className="mt-3 text-[11px] leading-6 text-amber-600 dark:text-amber-400">
                      ثبت عکس و ویس در پروندهٔ مشتریان از سوی پشتیبانی غیرفعال شده است؛ یادداشت‌ها همچنان فعال‌اند.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-neutral-100 p-4 dark:border-neutral-800">
            <button
              onClick={() => setSelectedCustomer(null)}
              className="rounded-xl px-4 py-2 text-sm font-bold text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              بستن
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell role={me.role} title="مشتریان">
      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-neutral-900 dark:text-neutral-100">مدیریت مشتریان {salonName}</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              لیست تمام مشتریانی که در این سالن نوبت گرفته‌اند
            </p>
            {error && (
              <div className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">
                {error}
              </div>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="جستجوی مشتری..."
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value); }}
              className="w-64 rounded-xl border border-neutral-300 bg-white pl-10 pr-4 py-2 text-sm outline-none focus:border-pink-500 dark:border-neutral-700 dark:bg-neutral-800 dark:focus:border-pink-500"
            />
          </div>
        </div>

        {/* سوییچر سالن‌ها */}
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="px-1 text-xs font-bold text-neutral-500">سالن‌های من:</span>
          {mySalons.map((ms) => {
            const active = ms.id === selectedSalonId;
            return (
              <Link
                key={ms.id}
                href={`/dashboard/customers?salon=${ms.id}`}
                className={`rounded-xl px-3.5 py-1.5 text-sm font-bold transition ${
                  active ? "bg-[#1c2434] text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
                }`}
              >
                {ms.name}
              </Link>
            );
          })}
        </div>

        {/* لیست مشتریان */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loadingCustomers ? (
            <div className="col-span-full py-12 text-center text-neutral-500">در حال بارگذاری...</div>
          ) : error ? (
            <div className="col-span-full py-8 text-center text-red-500">خطا در بارگذاری مشتریان</div>
          ) : customers.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-neutral-300 p-12 text-center text-neutral-400">
              مشتری‌ای یافت نشد
            </div>
          ) : (
            customers.map((c) => (
              <div
                key={c.id}
                onClick={() => setSelectedCustomer(c)}
                className="group cursor-pointer overflow-hidden rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-pink-100 to-purple-100 text-lg dark:from-pink-900/30 dark:to-purple-900/30">
                      {c.name ? c.name[0] : c.phone[0]}
                    </div>
                    <div>
                      <div className="font-bold text-neutral-900 dark:text-neutral-100">
                        {c.name || <span className="text-neutral-400">بدون نام</span>}
                      </div>
                      <div className="text-xs text-neutral-500" dir="ltr">{c.phone}</div>
                    </div>
                  </div>
                  <MoreVertical className="h-5 w-5 text-neutral-300 group-hover:text-pink-500" />
                </div>

                <div className="mt-4 rounded-lg bg-neutral-50 p-2 text-[11px] leading-5 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {toPersianDigits(c.visits)} نوبت · {toPersianDigits(c.completed)} مراجعه · {toPersianDigits(c.cancelled)} لغو · {toPersianDigits(c.noShow)} عدم حضور
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    هزینه‌کرد: <span className="font-bold text-pink-600">{formatToman(c.spend)}</span>
                    {c.lastVisit ? ` · آخرین مراجعه: ${toPersianDigits(new Date(c.lastVisit).toLocaleDateString("fa-IR"))}` : ""}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedCustomer(c); }}
                    className="shrink-0 rounded-lg bg-pink-50 px-3 py-1.5 text-xs font-bold text-pink-600 transition hover:bg-pink-100 dark:bg-pink-900/30 dark:text-pink-300"
                  >
                    مشاهده پرونده
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
      </main>

      <DetailModal />
    </DashboardShell>
  );
}
