/**
 * رزرو صوتی در زبان طراحی مینی‌اپ — همان endpoint های سایت:
 *   POST /api/voice/transcribe  (audio | text + field/partial برای پرسش مجدد)
 * منطق استخراج و «فقط همان فیلد را دوباره بگو» از نسخهٔ قبلیِ نوبت‌دهی صوتی
 * بی‌تغییر مانده؛ فقط ظاهر به شکل کارت/شیت مینی‌اپ درآمده است.
 * حالت متنی برای بستر ناامن (http) اضافه شده که مرورگر میکروفون را قفل می‌کند.
 */
import { useRef, useState } from "react";
import { Icon, Spinner } from "@/mini/components/ui";
import { haptic } from "@/mini/lib/bridge";
import { useMini } from "@/mini/lib/store";
import { faDigits } from "@/mini/lib/format";

export type VoicePatch = { name?: string; phone?: string; service?: string; date?: string; time?: string };
export type VoiceFieldKey = "name" | "phone" | "service" | "date" | "time";

const FIELD_LABELS: Record<VoiceFieldKey, string> = {
  name: "نام",
  phone: "شماره موبایل",
  service: "نام خدمت",
  date: "تاریخ",
  time: "ساعت",
};

const REQUIRED_FIELDS: VoiceFieldKey[] = ["name", "phone", "date", "time"];

const SAMPLE_SCRIPT =
  "سلام، می‌خوام نوبت رزرو کنم: برای فردا ساعت ده صبح، خدمت کوتاهی مو، به نام سارا احمدی، شماره موبایل ۰۹۱۲۳۴۵۶۷۸۹";

export default function VoiceBooking({
  salonId,
  phone,
  onApply,
  onNotice,
}: {
  salonId: string;
  phone: string;
  onApply: (patch: VoicePatch) => void;
  onNotice: (text: string, kind?: "ok" | "error" | "info") => void;
}) {
  const { toast } = useMini();
  const [recording, setRecording] = useState(false);
  const [recField, setRecField] = useState<VoiceFieldKey | "">("");
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [extracted, setExtracted] = useState<VoicePatch | null>(null);
  const [fragments, setFragments] = useState<{ field: VoiceFieldKey; text: string }[]>([]);
  const [voiceCallId, setVoiceCallId] = useState("");
  const [showScript, setShowScript] = useState(false);
  const [copied, setCopied] = useState(false);
  const [typed, setTyped] = useState("");
  const [micBlocked, setMicBlocked] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function post(parts: Record<string, string>, blob?: Blob) {
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
      setTranscript(String(data.transcript ?? ""));
      setExtracted(ex);
      onApply(ex);
      return { data, ex } as { data: any; ex: VoicePatch };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطا در پردازش صدا";
      onNotice(msg, "error");
      toast(msg, "error");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function reportMissing(ex: VoicePatch) {
    const missing = REQUIRED_FIELDS.filter((f) => !ex[f]);
    if (missing.length) {
      onNotice(`اطلاعات خوانده شد؛ ${missing.map((f) => FIELD_LABELS[f]).join("، ")} پیدا نشد. فقط همان را بگویید یا تایپ کنید.`, "error");
      return;
    }
    haptic("success");
    onNotice("همه اطلاعات خوانده شد. خدمت، روز و ساعت را تأیید کنید.", "ok");
  }

  async function startRecording(field: VoiceFieldKey | "") {
    if (busy) return;
    if (!field) {
      setTranscript("");
      setExtracted(null);
      setFragments([]);
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
            if (r.data.fieldValue) onNotice(`${FIELD_LABELS[field]} دریافت شد: ${r.data.fieldValue}`, "ok");
            else onNotice(`${FIELD_LABELS[field]} باز هم قابل تشخیص نبود؛ لطفاً تایپ کنید.`, "error");
          });
        } else {
          void post({}, blob).then((r) => r && reportMissing(r.ex));
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
    if (r) reportMissing(r.ex);
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

  const missing = extracted ? REQUIRED_FIELDS.filter((f) => !extracted[f]) : [];

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
                : "بگویید چه خدمتی، چه روزی و چه ساعتی؛ بقیه را خودکار پر می‌کنیم."}
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
                  {FIELD_LABELS[k]}: {extracted[k]}
                </span>
              ) : null
            )}
          </div>
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

      {/* مسیر پشتیبان: بستر ناامن (http) یا نبود مجوز میکروفون */}
      <div style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "center" }}>
        <input
          className="mini-input"
          style={{ flex: 1 }}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={micBlocked ? "مثلاً: فردا ساعت ۱۰ کوتاهی مو، سارا احمدی، ۰۹۱۲۳۴۵۶۷۸۹" : "یا اینکه تایپ کنید…"}
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
