/**
 * مشتریان — نسخهٔ مینی‌استایلِ /dashboard/customers (CRM سالن).
 * همان مسیرهای پنل وب: فهرست صفحه‌به‌صفحه با جستجو، پروندهٔ کامل مشتری (آمار،
 * نوبت‌های قبلی، یادداشت سالن)، یادداشت‌های چندتایی با سقف پنل، و عکس و ویس
 * (بارگذاری، ضبط ویس با سقف زمان، حذف). هویت فقط با کوکی نشست پنل است.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Area, Button, EmptyState, Field, Icon, Row, SectionTitle, Sheet, SkeletonList, StatusBadge } from "@/mini/components/ui";
import { compactToman, dayLabel, faDigits, fromNow, initials, isPhone, normalizePhone, shortPrice, timeLabel, toman, weekdayLabel } from "@/mini/lib/format";
import { dapi, qs } from "../lib/api";
import { SalonSwitcher } from "../lib/parts";
import { useDash } from "../lib/store";

type CustomerRow = {
  id: string;
  phone: string;
  name: string | null;
  firstName?: string | null;
  lastName?: string | null;
  visits: number;
  completed: number;
  cancelled: number;
  noShow: number;
  spend: number;
  lastVisit: string | null;
  note?: string | null;
  mediaCount?: number;
  notesCount?: number;
};

type NoteRow = { id: string; note: string; createdAt: string };
type MediaRow = { id: string; url: string; type: string; name: string | null; createdAt: string; size?: number | null };
type FileAppt = {
  id: string;
  startAt: string;
  status: string;
  service?: { name: string; price?: number } | null;
  employee?: { name: string } | null;
  branch?: { name: string } | null;
};
type Profile = {
  customer: { id: string; name: string | null; phone: string; note?: string | null };
  notes: NoteRow[];
  media: MediaRow[];
  appointments: FileAppt[];
  stats: { visits: number; completed: number; cancelled: number; noShow: number; spend: number; lastVisit: string | null };
  noteLimit: number;
  mediaLimit: number;
  photoMaxMb: number;
  voiceMaxMb: number;
  mediaEnabled: boolean;
};

const PAGE_SIZE = 24;
const VOICE_MIN_SECONDS = 120;
const VOICE_BYTES_PER_SECOND = 8000;
const MB = 1024 * 1024;

/** سقف ضبط ویس از حجم مجاز ویسِ همان پرونده (تخمین ۸KB بر ثانیه) */
function voiceMaxSeconds(voiceMaxMb: number): number {
  return Math.max(VOICE_MIN_SECONDS, Math.floor((voiceMaxMb * MB) / VOICE_BYTES_PER_SECOND));
}

function fileSizeLabel(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes >= MB) return `${(bytes / MB).toFixed(1).replace(/\.0$/, "")} مگابایت`;
  return `${Math.max(1, Math.round(bytes / 1024))} کیلوبایت`;
}

function fullName(c: CustomerRow): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || c.name || "بدون نام";
}

export default function DashCustomers() {
  const { salonId, toast } = useDash();

  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  /* جستجو با تأخیر اجرا شود تا هر کلید درخواست نزند */
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(
    async (targetPage: number, replace: boolean) => {
      if (!salonId) {
        setRows([]);
        setLoading(false);
        return;
      }
      if (replace) setLoading(true);
      else setLoadingMore(true);
      setError("");
      const res = await dapi<{
        success: boolean;
        error?: string;
        customers?: CustomerRow[];
        total?: number;
        totalPages?: number;
      }>(`/api/dashboard/salons/${salonId}/customers${qs({ q: search, page: targetPage, limit: PAGE_SIZE })}`);
      if (!res.ok) {
        setError(res.data?.error || "بارگذاری مشتریان ممکن نشد.");
        if (replace) setRows([]);
      } else {
        const list = res.data.customers ?? [];
        setRows((prev) => (replace ? list : [...prev, ...list.filter((x) => !prev.some((p) => p.id === x.id))]));
        setTotal(res.data.total ?? 0);
        setTotalPages(res.data.totalPages ?? 1);
        setPage(targetPage);
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [salonId, search]
  );

  useEffect(() => {
    void load(1, true);
  }, [load]);

  const reloadAll = useCallback(async () => {
    for (let p = 1; p <= page; p++) await load(p, p === 1);
  }, [load, page]);

  /* ---------- پرونده ---------- */
  const [openRow, setOpenRow] = useState<CustomerRow | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");

  const loadProfile = useCallback(async () => {
    if (!openRow) return;
    setLoadingProfile(true);
    setProfileError("");
    const res = await dapi<Profile & { success: boolean; error?: string }>(
      `/api/dashboard/salons/${salonId}/customers/${openRow.id}`
    );
    if (!res.ok) setProfileError(res.data?.error || "پرونده باز نشد.");
    else setProfile(res.data);
    setLoadingProfile(false);
  }, [openRow, salonId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const noteLimit = profile?.noteLimit ?? 5;
  const mediaLimit = profile?.mediaLimit ?? 10;
  const mediaEnabled = profile?.mediaEnabled !== false;
  const notes = profile?.notes ?? [];
  const media = profile?.media ?? [];
  const notesFull = notes.length >= noteLimit;
  const mediaFull = media.length >= mediaLimit;
  const photoMax = profile?.photoMaxMb ?? 5;
  const voiceMax = profile?.voiceMaxMb ?? 10;

  /* یادداشت سالن (همان PATCH نسخهٔ وب) */
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  useEffect(() => {
    if (openRow) setNote(openRow.note ?? profile?.customer.note ?? "");
  }, [openRow, profile?.customer.note]);

  async function saveProfileNote() {
    if (!openRow) return;
    setSavingNote(true);
    const res = await dapi<{ success: boolean; error?: string }>(`/api/dashboard/salons/${salonId}/customers`, {
      method: "PATCH",
      body: JSON.stringify({ phone: openRow.phone, note: note.trim() }),
    });
    setSavingNote(false);
    if (!res.ok) {
      toast(res.data?.error || "ذخیره نشد", "error");
      return;
    }
    toast("یادداشت ذخیره شد", "ok");
    void reloadAll();
  }

  /* یادداشت‌های چندتایی */
  const [noteDraft, setNoteDraft] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  async function addNote() {
    const text = noteDraft.trim();
    if (!text || !openRow) return;
    setAddingNote(true);
    const res = await dapi<{ success: boolean; error?: string }>(
      `/api/dashboard/salons/${salonId}/customers/${openRow.id}/notes`,
      { method: "POST", body: JSON.stringify({ note: text.slice(0, 2000) }) }
    );
    setAddingNote(false);
    if (!res.ok) {
      setProfileError(res.data?.error || "یادداشت ثبت نشد.");
      return;
    }
    setNoteDraft("");
    void loadProfile();
    void reloadAll();
  }

  async function removeNote(noteId: string) {
    if (!openRow) return;
    const res = await dapi<{ success: boolean; error?: string }>(
      `/api/dashboard/salons/${salonId}/customers/${openRow.id}/notes/${noteId}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      setProfileError(res.data?.error || "حذف یادداشت ممکن نشد.");
      return;
    }
    void loadProfile();
    void reloadAll();
  }

  /* ---------- عکس و ویس ---------- */
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const secondsRef = useRef(0);

  function releaseRecorder() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(
    () => () => releaseRecorder(),
    []
  );
  useEffect(() => {
    if (!openRow) releaseRecorder();
  }, [openRow]);

  async function postMedia(blob: Blob | File, filename: string) {
    if (!openRow) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", blob, filename);
    const res = await dapi<{ success: boolean; error?: string }>(
      `/api/dashboard/salons/${salonId}/customers/${openRow.id}/media`,
      { method: "POST", body: fd }
    );
    setUploading(false);
    if (!res.ok) {
      setProfileError(res.data?.error || "بارگذاری فایل ممکن نشد.");
      return;
    }
    void loadProfile();
    void reloadAll();
  }

  /** پیش‌بررسی حجم با سقف همان پرونده؛ بررسی نهایی سمت سرور است */
  function uploadFile(file: File) {
    const isVoice = (file.type || "").startsWith("audio/");
    const maxMb = isVoice ? voiceMax : photoMax;
    if (file.size > maxMb * MB) {
      setProfileError(`حجم ${isVoice ? "ویس" : "عکس"} نباید از ${faDigits(maxMb)} مگابایت بیشتر باشد.`);
      return;
    }
    void postMedia(file, file.name || (isVoice ? "voice" : "photo"));
  }

  async function startRecording() {
    if (!openRow) return;
    setProfileError("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setProfileError("دسترسی به میکروفون ممکن نشد؛ مجوز را بررسی کنید.");
      return;
    }
    streamRef.current = stream;
    const cap = voiceMaxSeconds(voiceMax);
    const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
      releaseRecorder();
      setRecording(false);
      if (blob.size === 0) return;
      if (blob.size > voiceMax * MB) {
        setProfileError(`حجم ویس از ${faDigits(voiceMax)} مگابایت بیشتر شد؛ ضبط را کوتاه‌تر کنید.`);
        return;
      }
      await postMedia(blob, "voice-note.webm");
    };
    rec.start();
    recorderRef.current = rec;
    setRecording(true);
    secondsRef.current = 0;
    setRecSeconds(0);
    timerRef.current = window.setInterval(() => {
      secondsRef.current += 1;
      setRecSeconds(secondsRef.current);
      // سقف رد شد: ضبط خودکار متوقف و همان مقدار ذخیره می‌شود
      if (secondsRef.current >= cap && recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    }, 1000);
  }

  function stopRecorder() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  }

  async function removeMedia(mediaId: string) {
    if (!openRow) return;
    const res = await dapi<{ success: boolean; error?: string }>(
      `/api/dashboard/salons/${salonId}/customers/${openRow.id}/media?mediaId=${encodeURIComponent(mediaId)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      setProfileError(res.data?.error || "حذف فایل ممکن نشد.");
      return;
    }
    void loadProfile();
    void reloadAll();
  }

  /* ---------- مشتری جدید ---------- */
  const [addOpen, setAddOpen] = useState(false);
  const [addPhone, setAddPhone] = useState("");
  const [addName, setAddName] = useState("");
  const [adding, setAdding] = useState(false);

  async function addCustomer() {
    const phone = normalizePhone(addPhone);
    if (!isPhone(phone)) {
      toast("شماره معتبر نیست؛ مثلاً 09123456789", "error");
      return;
    }
    setAdding(true);
    const res = await dapi<{ success: boolean; error?: string }>(`/api/dashboard/salons/${salonId}/customers`, {
      method: "POST",
      body: JSON.stringify({ phone, name: addName.trim() || undefined }),
    });
    setAdding(false);
    if (!res.ok) {
      toast(res.data?.error || "ثبت مشتری ممکن نشد.", "error");
      return;
    }
    setAddOpen(false);
    setAddPhone("");
    setAddName("");
    toast("مشتری اضافه شد", "ok");
    void load(1, true);
  }

  return (
    <div className="mini-fade">
      <div className="dash-toolbar">
        <SectionTitle title="مشتریان" hint={loading ? "" : `${faDigits(total)} پرونده${salonId ? "" : ""}`} />
        <div className="mini-actions" style={{ marginInlineStart: "auto" }}>
          <button type="button" className="mini-btn ghost tiny" onClick={() => void load(1, true)} aria-label="نوسازی">
            <Icon name="refresh" size={15} />
          </button>
          <button type="button" className="mini-btn tiny" onClick={() => setAddOpen(true)}>
            <Icon name="plus" size={15} />
            مشتری جدید
          </button>
          <SalonSwitcher />
        </div>
      </div>

      <Field label="جست‌وجو" name="cust_q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="نام یا شمارهٔ موبایل" />

      {error ? <div className="mini-note dash-note-bad">{error}</div> : null}

      {loading ? (
        <div style={{ marginTop: 12 }}>
          <SkeletonList count={4} />
        </div>
      ) : rows.length === 0 ? (
        <div style={{ marginTop: 12 }}>
          <EmptyState
            text={search ? "مشتری‌ای با این جستجو پیدا نشد." : "هنوز مشتری‌ای در این سالن نیست."}
            hint="پرونده‌های مشتری از نوبت‌ها خودکار ساخته می‌شوند."
          />
        </div>
      ) : (
        <div className="mini-list" style={{ marginTop: 12 }}>
          {rows.map((c) => {
            const full = fullName(c);
            return (
              <button key={c.id} type="button" className="mini-item" style={{ width: "100%", textAlign: "start" }} onClick={() => setOpenRow(c)}>
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
                  {c.visits ? `${faDigits(c.visits)} نوبت · ${faDigits(c.completed)} مراجعه` : "بدون نوبت"}
                  <span className="mini-item-sub" style={{ display: "block" }}>
                    {c.spend ? `${shortPrice(c.spend)} تومان` : "بدون هزینه"}
                    {c.lastVisit ? ` · ${dayLabel(String(c.lastVisit).slice(0, 10))}` : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!loading && rows.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          {page < totalPages ? (
            <button type="button" className="mini-btn soft" disabled={loadingMore} onClick={() => void load(page + 1, false)}>
              {loadingMore ? "در حال بارگذاری…" : `مشتری‌های بیشتر (${faDigits(rows.length)} از ${faDigits(total)})`}
            </button>
          ) : (
            <div className="mini-option-sub" style={{ textAlign: "center" }}>
              {`همهٔ ${faDigits(total)} مشتری نمایش داده شد`}
            </div>
          )}
        </div>
      ) : null}

      {/* ── پروندهٔ مشتری ─────────────────────────────────────────────── */}
      <Sheet
        open={Boolean(openRow)}
        title={openRow ? `پروندهٔ ${fullName(openRow)}` : "پروندهٔ مشتری"}
        onClose={() => {
          setOpenRow(null);
          setProfile(null);
          setProfileError("");
          setNoteDraft("");
        }}
      >
        {openRow ? (
          <>
            <div className="mini-card" style={{ padding: 10, marginBottom: 12 }}>
              <Row label="نام" value={fullName(openRow)} />
              <Row
                label="تماس"
                value={
                  <span className="dash-inline-actions">
                    <a className="mini-link" href={`tel:${openRow.phone}`} dir="ltr">
                      {faDigits(openRow.phone)}
                    </a>
                    <a className="mini-btn ghost tiny" href={`sms:${openRow.phone}`}>
                      <Icon name="chat" size={13} />
                      پیامک
                    </a>
                  </span>
                }
              />
              {profile ? (
                <>
                  <Row label="نوبت‌ها" value={faDigits(profile.stats.visits)} />
                  <Row label="مراجعهٔ انجام‌شده" value={faDigits(profile.stats.completed)} />
                  <Row label="لغو / عدم حضور" value={`${faDigits(profile.stats.cancelled)} / ${faDigits(profile.stats.noShow)}`} />
                  <Row label="هزینه‌کرد" value={toman(profile.stats.spend)} />
                  {profile.stats.lastVisit ? <Row label="آخرین بازدید" value={dayLabel(String(profile.stats.lastVisit).slice(0, 10))} /> : null}
                </>
              ) : null}
            </div>

            {loadingProfile ? <SkeletonList count={3} /> : null}
            {profileError ? <div className="mini-note dash-note-bad">{profileError}</div> : null}

            {/* نوبت‌های قبلی */}
            {profile && !loadingProfile ? (
              <div className="mini-cust-block">
                <div className="mini-cust-head">
                  <span>نوبت‌های این مشتری</span>
                  <small>{faDigits(profile.appointments.length)}</small>
                </div>
                {profile.appointments.length === 0 ? (
                  <div className="mini-cust-empty">نوبتی ثبت نشده است.</div>
                ) : (
                  <div className="mini-list">
                    {profile.appointments.slice(0, 20).map((a) => (
                      <div key={a.id} className="mini-item" style={{ width: "100%", textAlign: "start" }}>
                        <span className="mini-item-main">
                          <span className="mini-item-title">
                            {weekdayLabel(a.startAt.slice(0, 10))} {timeLabel(a.startAt)}
                          </span>
                          <span className="mini-item-sub">
                            {a.service?.name ?? "بدون خدمت"}
                            {a.service?.price != null ? ` — ${toman(a.service.price)}` : ""}
                            {a.employee?.name ? ` · ${a.employee.name}` : ""}
                            {a.branch?.name ? ` · ${a.branch.name}` : ""}
                          </span>
                        </span>
                        <StatusBadge status={a.status} />
                      </div>
                    ))}
                    {profile.appointments.length > 20 ? (
                      <div className="mini-cust-empty">و {faDigits(profile.appointments.length - 20)} نوبت دیگر.</div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {/* یادداشت سالن */}
            <div className="mini-cust-block">
              <Area
                label="یادداشت سالن"
                name="cust_note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="مثلاً به رنگ بلوند حساسیت دارد"
              />
              <Button variant="soft" tiny loading={savingNote} disabled={savingNote} onClick={saveProfileNote}>
                <Icon name="check" size={14} />
                ذخیرهٔ یادداشت
              </Button>
            </div>

            {/* یادداشت‌های پرونده */}
            <div className="mini-cust-block">
              <div className="mini-cust-head">
                <span>یادداشت‌های پرونده</span>
                <small>
                  {faDigits(notes.length)} / {faDigits(noteLimit)}
                </small>
              </div>
              {notes.length === 0 && !loadingProfile ? <div className="mini-cust-empty">هنوز یادداشتی در پرونده ثبت نشده است.</div> : null}
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

            {/* عکس و ویس */}
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
                            {fileSizeLabel(m.size) ? ` · ${fileSizeLabel(m.size)}` : ""}
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
                      <span>
                        در حال ضبط… {faDigits(recSeconds)} از {faDigits(voiceMaxSeconds(voiceMax))} ثانیه
                      </span>
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
                            if (f) uploadFile(f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <label className={`mini-btn soft tiny${uploading || mediaFull ? " is-disabled" : ""}`}>
                        <Icon name="plus" size={16} />
                        <span>بارگذاری ویس</span>
                        <input
                          type="file"
                          accept="audio/mpeg,audio/wav,audio/ogg,audio/webm,audio/mp4"
                          style={{ display: "none" }}
                          disabled={uploading || mediaFull}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadFile(f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <Button tiny variant="primary" disabled={uploading || mediaFull} onClick={() => void startRecording()}>
                        <Icon name="mic" size={16} />
                        <span>ضبط ویس</span>
                      </Button>
                    </div>
                  )}

                  <div className="mini-cust-hint">
                    عکس تا {faDigits(photoMax)} مگابایت و ویس تا {faDigits(voiceMax)} مگابایت — فقط در همین سالن دیده می‌شود.
                  </div>
                </>
              ) : (
                <div className="mini-note is-warn">
                  ثبت عکس و ویس در پروندهٔ مشتریان از سوی پشتیبانی غیرفعال شده است؛ یادداشت‌ها همچنان فعال‌اند.
                </div>
              )}
            </div>
          </>
        ) : null}
      </Sheet>

      {/* ── مشتری جدید ────────────────────────────────────────────────── */}
      <Sheet open={addOpen} title="افزودن مشتری به این سالن" onClose={() => setAddOpen(false)}>
        <Field
          label="شماره موبایل"
          name="new_phone"
          type="tel"
          dir="ltr"
          className="is-ltr"
          placeholder="09123456789"
          value={addPhone}
          onChange={(e) => setAddPhone(e.target.value)}
        />
        <Field label="نام (اختیاری)" name="new_name" placeholder="مثلاً مریم رضایی" value={addName} onChange={(e) => setAddName(e.target.value)} />
        <div className="mini-cust-hint">اگر این شماره قبلاً نوبت گرفته باشد، همان پرونده به‌روز می‌شود.</div>
        <Button variant="primary" loading={adding} disabled={adding || !addPhone.trim()} onClick={() => void addCustomer()}>
          <Icon name="user" size={16} />
          ثبت مشتری
        </Button>
      </Sheet>
    </div>
  );
}
