/**
 * رزرو صوتی در زبان طراحی مینی‌اپ — همان endpoint های سایت:
 *   POST /api/voice/transcribe  (audio | text + field/partial برای پرسش مجدد)
 * پکیج اجباری است و نام آرایشگر اختیاری؛ تطبیق هر دو با کاتالوگ واقعی سالن سمت سرور
 * انجام می‌شود و شناسه‌ها (`serviceId`/`staffId`) همراه گزینه‌های مبهم برمی‌گردند.
 * وقتی همهٔ موارد خوانده شد یک آلارتِ «نوبت را ثبت کنم؟» نشان داده می‌شود و ثبت فقط
 * با تأیید صریح مشتری (از طریق `onConfirm`) انجام می‌شود.
 * حالت متنی برای بستر ناامن (http) هست که مرورگر میکروفون را قفل می‌کند.
 */
import { useRef, useState } from "react";
import { Icon, Spinner } from "@/mini/components/ui";
import { haptic } from "@/mini/lib/bridge";
import { useMini } from "@/mini/lib/store";
import { faDigits, gregorianToShamsiFa } from "@/mini/lib/format";
import { mbToBytes, sizeHintFa, uploadLimitsSync } from "@/lib/upload-limits";

export type VoicePatch = { name?: string; phone?: string; service?: string; staff?: string; date?: string; time?: string };
export type VoiceFieldKey = "name" | "phone" | "service" | "staff" | "date" | "time";
export type VoiceCandidate = { id: string; name: string; score: number };
/** شناسهٔ خالی یعنی «پیدا نشد یا مبهم بود» — گزینه‌ها برای پرسش از مشتری برمی‌گردند */
export type VoiceResolution = {
  serviceId?: string;
  staffId?: string;
  staffAny?: boolean;
  serviceCandidates?: VoiceCandidate[];
  staffCandidates?: VoiceCandidate[];
};

const FIELD_LABELS: Record<VoiceFieldKey, string> = {
  name: "نام",
  phone: "شماره موبایل",
  service: "پکیج",
  staff: "آرایشگر",
  date: "تاریخ",
  time: "ساعت",
};

/** پکیج اجباری است؛ آرایشگر اختیاری */
const REQUIRED_FIELDS: VoiceFieldKey[] = ["name", "phone", "service", "date", "time"];

/** نمایشِ مقدارِ خوانده‌شده برای مشتری: تاریخ شمسی و همهٔ ارقام فارسی (مقدار فرم همان ISO می‌ماند) */
function displayValue(field: VoiceFieldKey, value: string): string {
  return field === "date" ? gregorianToShamsiFa(value) : faDigits(value);
}

const SAMPLE_SCRIPT =
  "سلام، می‌خوام نوبت رزرو کنم: برای فردا ساعت ده صبح، پکیج کوتاهی مو با آرایشگر مریم رضایی، به نام سارا احمدی، شماره موبایل ۰۹۱۲۳۴۵۶۷۸۹";

export default function VoiceBooking({
  salonId,
  phone,
  onApply,
  onNotice,
  onConfirm,
  canConfirm = false,
  confirming = false,
}: {
  salonId: string;
  phone: string;
  onApply: (patch: VoicePatch, resolution?: VoiceResolution) => void;
  onNotice: (text: string, kind?: "ok" | "error" | "info") => void;
  /** ثبت نوبت فقط از این مسیر و با تأیید صریح مشتری انجام می‌شود */
  onConfirm?: () => void;
  /** روز/ساعتِ واقعاً آزاد انتخاب شده و ثبت ممکن است */
  canConfirm?: boolean;
  confirming?: boolean;
}) {
  const { toast } = useMini();
  const [recording, setRecording] = useState(false);
  const [recField, setRecField] = useState<VoiceFieldKey | "">("");
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [extracted, setExtracted] = useState<VoicePatch | null>(null);
  const [resolution, setResolution] = useState<VoiceResolution>({});
  const [dismissed, setDismissed] = useState(false);
  const [fragments, setFragments] = useState<{ field: VoiceFieldKey; text: string }[]>([]);
  const [voiceCallId, setVoiceCallId] = useState("");
  const [showScript, setShowScript] = useState(false);
  const [copied, setCopied] = useState(false);
  const [typed, setTyped] = useState("");
  const [micBlocked, setMicBlocked] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function post(parts: Record<string, string>, blob?: Blob) {
    // پیش‌بررسی حجم با سقف پویای سوپرادمین (بررسی قطعی سمت سرور است)
    if (blob && blob.size > mbToBytes(uploadLimitsSync().voiceMaxMb)) {
      onNotice(`حجم فایل صوتی ${sizeHintFa(uploadLimitsSync().voiceMaxMb)} است.`, "error");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      if (blob) form.append("audio", blob, "recording.webm");
      form.append("salonId", salonId);
      form.append("phone", phone);
      for (const [k, v] of Object.entries(parts)) if (v) form.append(k, v);
      if (voiceCallId) form.append("voiceCallId", voiceCallId);

      const res = await fetch("/api/voice/transcribe", { method: "POST", body: form, credentials: "same-origin" });
      const data = await res.json().catch(() => null);
      if (!data?.success) throw new Error(data?.error || "پردازش گفتار ممکن نشد");
      if (data.voiceCallId) setVoiceCallId(String(data.voiceCallId));
      const ex = (data.extracted ?? {}) as VoicePatch;
      const resolved: VoiceResolution = {
        serviceId: data.serviceId ?? "",
        staffId: data.staffId ?? "",
        staffAny: Boolean(data.staffAny),
        serviceCandidates: data.serviceCandidates ?? [],
        staffCandidates: data.staffCandidates ?? [],
      };
      setTranscript(String(data.transcript ?? ""));
      setExtracted(ex);
      setResolution(resolved);
      setDismissed(false);
      onApply(ex, resolved);
      return { data, ex, resolved };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطا در پردازش صدا";
      onNotice(msg, "error");
      toast(msg, "error");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function reportMissing(ex: VoicePatch, resolved: VoiceResolution) {
    // پکیج وقتی «خوانده شده» حساب می‌شود که به شناسهٔ واقعیِ همین سالن رسیده باشد
    const missing = REQUIRED_FIELDS.filter((f) => (f === "service" ? !resolved.serviceId : !ex[f]));
    if (missing.length) {
      onNotice(
        missing.includes("service") && (resolved.serviceCandidates?.length ?? 0) > 1
          ? `«${ex.service ?? ""}» به چند پکیج می‌خورد — کدام را می‌خواهید؟`
          : `اطلاعات خوانده شد؛ ${missing.map((f) => FIELD_LABELS[f]).join("، ")} پیدا نشد. فقط همان را بگویید یا تایپ کنید.`,
        "error"
      );
      return;
    }
    haptic("success");
    onNotice("همه چیز را گفتید — پکیج، روز و ساعت را ببینید و با تأیید شما ثبت می‌شود.", "ok");
  }

  async function startRecording(field: VoiceFieldKey | "") {
    if (busy) return;
    if (!field) {
      setTranscript("");
      setExtracted(null);
      setFragments([]);
      setResolution({});
      setDismissed(false);
    }
    setRecField(field);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (field) {
          void post({ field, partial: JSON.stringify(extracted ?? {}) }, blob).then((r) => {
            if (!r) return;
            setFragments((prev) => [...prev, { field, text: String(r.data.transcript ?? "") }]);
            if (r.data.fieldValue) onNotice(`${FIELD_LABELS[field]} دریافت شد: ${displayValue(field, String(r.data.fieldValue))}`, "ok");
            else onNotice(`${FIELD_LABELS[field]} باز هم قابل تشخیص نبود؛ لطفاً تایپ کنید.`, "error");
          });
        } else {
          void post({}, blob).then((r) => r && reportMissing(r.ex, r.resolved));
        }
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
      setMicBlocked(false);
    } catch {
      setRecField("");
      setMicBlocked(true);
      onNotice("میکروفون در دسترس نیست (اجازهٔ مرورگر یا بستر ناامن http). می‌توانید متن را تایپ کنید.", "error");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    setRecording(false);
  }

  async function sendTyped() {
    const text = typed.trim();
    if (text.length < 3) {
      onNotice("متن را کامل بنویسید.", "error");
      return;
    }
    const r = await post({ text });
    if (r) reportMissing(r.ex, r.resolved);
  }

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(SAMPLE_SCRIPT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* کلیپ‌بورد در http مسدود است */
    }
  }

  /** انتخاب یکی از گزینه‌های مبهم — همان شناسهٔ واقعی به فرم رزرو می‌رود */
  function choose(kind: "service" | "staff", candidate: VoiceCandidate) {
    const nextEx = { ...(extracted ?? {}), [kind]: candidate.name };
    const nextRes = {
      ...resolution,
      [kind === "service" ? "serviceId" : "staffId"]: candidate.id,
      [kind === "service" ? "serviceCandidates" : "staffCandidates"]: [],
      ...(kind === "service" ? { staffId: "", staffCandidates: [] } : {}),
    };
    setExtracted(nextEx);
    setResolution(nextRes);
    setDismissed(false);
    onApply(nextEx, nextRes);
    haptic("light");
  }

  const missing = extracted
    ? REQUIRED_FIELDS.filter((f) => (f === "service" ? !resolution.serviceId : !extracted[f]))
    : [];
  const allSaid = Boolean(extracted) && missing.length === 0 && !dismissed;

  return (
    <div className="sm-voice">
      <div className="sm-voice-row">
        <button
          type="button"
          className={`sm-mic${recording ? " is-on" : ""}`}
          onClick={() => (recording ? stopRecording() : void startRecording(""))}
          disabled={busy || (recording && recField !== "") || recField !== ""}
          aria-label={recording ? "پایان ضبط" : "نوبت با صدا — شروع ضبط"}
        >
          {busy ? <Spinner size={20} /> : <Icon name={recording ? "close" : "chat"} size={22} />}
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 13.5 }}>نوبت با صدا</div>
          <div className="mini-option-sub">
            {recording
              ? "در حال ضبط… برای پایان دوباره بزنید"
              : busy
                ? "در حال پردازش هوش مصنوعی…"
                : "بگویید چه پکیجی، چه روزی و چه ساعتی؛ نام آرایشگر اختیاری است و بقیه را خودکار پر می‌کنیم."}
          </div>
        </div>
        <button type="button" className="mini-btn ghost tiny" onClick={() => setShowScript((v) => !v)}>
          {showScript ? "بستن" : "متن نمونه"}
        </button>
      </div>

      {showScript ? (
        <div className="sm-script">
          «{SAMPLE_SCRIPT}»
          <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
            <button type="button" className="mini-btn soft tiny" onClick={() => void copyScript()}>
              <Icon name="link" size={14} />
              {copied ? "کپی شد" : "کپی متن"}
            </button>
            <button type="button" className="mini-btn ghost tiny" onClick={() => void startRecording("name")}>
              <Icon name="user" size={14} />
              فقط نام را بگو
            </button>
          </div>
        </div>
      ) : null}

      {transcript ? <p className="sm-transcript">“{transcript}”</p> : null}

      {fragments.map((fr, i) => (
        <p key={i} className="sm-transcript" style={{ background: "rgba(var(--m-rgb), 0.06)" }}>
          <b>{FIELD_LABELS[fr.field]}:</b> “{fr.text}”
        </p>
      ))}

      {extracted ? (
        <div style={{ marginTop: 10 }}>
          <div className="mini-section-title" style={{ margin: "0 0 6px", fontSize: 12.5 }}>
            <span>خروجی گفتار</span>
            <small>{faDigits(Object.keys(extracted).filter((k) => (extracted as any)[k]).length)} مورد خوانده شد</small>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(Object.keys(FIELD_LABELS) as VoiceFieldKey[]).map((k) =>
              extracted[k] ? (
                <span key={k} className="sm-chip-ok">
                  <Icon name="check" size={12} />
                  {FIELD_LABELS[k]}: {displayValue(k, String(extracted[k] ?? ""))}
                </span>
              ) : null
            )}
          </div>
          {(resolution.serviceCandidates?.length ?? 0) > 1 ? (
            <div className="sm-chip-miss">
              <span>«{extracted.service}» به چند پکیج می‌خورد — کدام؟</span>
              {resolution.serviceCandidates!.map((c) => (
                <button key={c.id} type="button" onClick={() => choose("service", c)}>
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}
          {(resolution.staffCandidates?.length ?? 0) > 1 ? (
            <div className="sm-chip-miss">
              <span>«{extracted.staff}» به چند آرایشگر می‌خورد — کدام؟</span>
              {resolution.staffCandidates!.map((c) => (
                <button key={c.id} type="button" onClick={() => choose("staff", c)}>
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}
          {missing.map((f) => (
            <div key={f} className="sm-chip-miss">
              <span>«{FIELD_LABELS[f]}» متوجه نشدم</span>
              <button type="button" onClick={() => (recording && recField === f ? stopRecording() : void startRecording(f))}>
                {recording && recField === f ? "پایان ضبط" : "فقط این را بگو"}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* آلارت تأیید — همهٔ موارد گفته شده؛ ثبت فقط با تأیید صریح مشتری */}
      {allSaid && onConfirm ? (
        <div className="sm-voice-confirm" role="alertdialog" aria-labelledby="sm-voice-confirm-title">
          <b id="sm-voice-confirm-title">
            <Icon name="check" size={16} />
            همه چیز را گفتید — نوبت را ثبت کنم؟
          </b>
          <p>
            پکیج «{extracted?.service}»
            {extracted?.staff ? ` با ${extracted.staff}` : " (آرایشگر به انتخاب سالن)"}
            {extracted?.date ? `، ${gregorianToShamsiFa(extracted.date)}` : ""}
            {extracted?.time ? ` ساعت ${faDigits(extracted.time)}` : ""}.
            {canConfirm ? " ساعتِ انتخاب‌شده واقعاً آزاد است." : " اول یک ساعتِ آزاد را از فهرست پایین انتخاب کنید."}
          </p>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button type="button" className="mini-btn soft tiny" onClick={onConfirm} disabled={!canConfirm || confirming || busy}>
              {confirming ? <Spinner size={14} /> : <Icon name="check" size={14} />}
              بله، ثبت کن
            </button>
            <button type="button" className="mini-btn ghost tiny" onClick={() => setDismissed(true)} disabled={confirming}>
              نه، اصلاح می‌کنم
            </button>
          </div>
        </div>
      ) : null}

      {/* مسیر پشتیبان: بستر ناامن (http) یا نبود مجوز میکروفون */}
      <div style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "center" }}>
        <input
          className="mini-input"
          style={{ flex: 1 }}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={micBlocked ? "مثلاً: فردا ساعت ۱۰ کوتاهی مو با مریم رضایی، سارا احمدی، ۰۹۱۲۳۴۵۶۷۸۹" : "یا اینکه تایپ کنید…"}
          aria-label="توضیح متنی برای استخراج نوبت"
        />
        <button type="button" className="mini-btn soft tiny" onClick={() => void sendTyped()} disabled={busy}>
          <Icon name="send" size={15} />
          خواندن
        </button>
      </div>
    </div>
  );
}
