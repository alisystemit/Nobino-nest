import { getSetting, settingOrEnv } from "@/lib/settings";
import { localAsrStatus, transcribeLocal } from "@/lib/ai/asr-local";

/**
 * زنجیره ربات‌های تبدیل گفتار به متن (STT) با fallback.
 *
 * ترتیب پیش‌فرض: مدل محلی Shenava (بدون هزینه و بدون اینترنت) → ربات‌های رایگان
 * (Groq → HuggingFace → Cloudflare → Deepgram) → سرویس پولی (OpenAI). اگر هر ربات
 * در دسترس نبود (مدل/کلید نداشت، محدودیت نرخ داشت یا خطا داد) به ربات بعدی می‌رود
 * و در پایان از Mock محلی استفاده می‌کند تا ثبت نوبت هرگز به‌خاطر قطعی سرویس
 * شکست نخورد.
 *
 * ترتیب را می‌توان از تنظیمات `stt.order` (با کاما) تغییر داد.
 * فعال/غیرفعال کردن هر ربات: `stt.<id>.enabled` = true|false
 */

export type SttProvider = "local" | "openai" | "groq" | "huggingface" | "cloudflare" | "deepgram" | "mock";

type ProviderDef = {
  id: Exclude<SttProvider, "mock">;
  label: string;
  free: boolean;
  /** کلید محیطی معادل (اگر ربات کلید داشته باشد) */
  envKey?: string;
  /** کلیدهای لازم؛ اگر همه خالی باشند ربات نادیده گرفته می‌شود */
  requiredSettings: string[];
  /** بررسی اختصاصی دسترس‌پذیری — برای ربات‌هایی مثل مدل محلی که کلید API ندارند */
  available?: () => Promise<{ ok: boolean; reason?: string }>;
  transcribe: (audio: Uint8Array, filename: string, mime: string) => Promise<string>;
};

async function secret(key: string, envKey?: string): Promise<string | undefined> {
  return settingOrEnv(key, envKey ? process.env[envKey] : undefined);
}

const PROVIDERS: ProviderDef[] = [
  {
    id: "local",
    label: "Shenava محلی (آفلاین)",
    free: true,
    requiredSettings: [],
    available: () => localAsrStatus(),
    async transcribe(audio) {
      // تنظیمات (مسیر مدل، ffmpeg و تعداد ترد) داخل asr-local خوانده می‌شود
      return transcribeLocal(audio);
    },
  },
  {
    id: "groq",
    label: "Groq Whisper (رایگان)",
    free: true,
    envKey: "GROQ_API_KEY",
    requiredSettings: ["stt.groq.key"],
    async transcribe(audio, filename, mime) {
      const key = await secret("stt.groq.key", "GROQ_API_KEY");
      if (!key) throw new Error("کلید Groq تنظیم نشده است");
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), filename);
      form.append("model", (await getSetting("stt.groq.model")) || "whisper-large-v3-turbo");
      form.append("language", "fa");
      form.append("response_format", "json");
      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      });
      if (!res.ok) throw new Error(`groq HTTP ${res.status}`);
      const data = (await res.json()) as { text?: string };
      return data.text ?? "";
    },
  },
  {
    id: "huggingface",
    label: "HuggingFace Inference (رایگان)",
    free: true,
    envKey: "HF_TOKEN",
    requiredSettings: ["stt.huggingface.key"],
    async transcribe(audio, _filename, mime) {
      const key = await secret("stt.huggingface.key", "HF_TOKEN") || (await secret("stt.huggingface.key", "HUGGINGFACE_API_KEY"));
      if (!key) throw new Error("توکن HuggingFace تنظیم نشده است");
      const model = (await getSetting("stt.huggingface.model")) || "openai/whisper-large-v3";
      const res = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": mime || "application/octet-stream",
          "x-wait-for-model": "true",
        },
        body: new Uint8Array(audio),
      });
      if (!res.ok) throw new Error(`huggingface HTTP ${res.status}`);
      const data = (await res.json()) as { text?: string } | { error?: string };
      if ("error" in data && data.error) throw new Error(`huggingface: ${data.error}`);
      return (data as { text?: string }).text ?? "";
    },
  },
  {
    id: "cloudflare",
    label: "Cloudflare Workers AI (رایگان)",
    free: true,
    envKey: "CLOUDFLARE_API_TOKEN",
    requiredSettings: ["stt.cloudflare.key", "stt.cloudflare.account"],
    async transcribe(audio, _filename, mime) {
      const token = await secret("stt.cloudflare.key", "CLOUDFLARE_API_TOKEN");
      const account = await secret("stt.cloudflare.account", "CLOUDFLARE_ACCOUNT_ID");
      if (!token || !account) throw new Error("حساب/توکن Cloudflare تنظیم نشده است");
      const model = (await getSetting("stt.cloudflare.model")) || "@cf/openai/whisper-large-v3-turbo";
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": mime || "application/octet-stream",
        },
        body: new Uint8Array(audio),
      });
      if (!res.ok) throw new Error(`cloudflare HTTP ${res.status}`);
      const data = (await res.json()) as { result?: { text?: string }; errors?: { message?: string }[] };
      if (data.errors?.length) throw new Error(`cloudflare: ${data.errors[0]?.message ?? "error"}`);
      return data.result?.text ?? "";
    },
  },
  {
    id: "deepgram",
    label: "Deepgram Nova (اعتبار رایگان)",
    free: true,
    envKey: "DEEPGRAM_API_KEY",
    requiredSettings: ["stt.deepgram.key"],
    async transcribe(audio, _filename, mime) {
      const key = await secret("stt.deepgram.key", "DEEPGRAM_API_KEY");
      if (!key) throw new Error("کلید Deepgram تنظیم نشده است");
      const model = (await getSetting("stt.deepgram.model")) || "nova-3";
      const res = await fetch(
        `https://api.deepgram.com/v1/listen?model=${encodeURIComponent(model)}&language=fa&smart_format=true`,
        {
          method: "POST",
          headers: { Authorization: `Token ${key}`, "Content-Type": mime || "audio/webm" },
          body: new Uint8Array(audio),
        }
      );
      if (!res.ok) throw new Error(`deepgram HTTP ${res.status}`);
      const data = (await res.json()) as {
        results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
      };
      return data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    },
  },
  {
    id: "openai",
    label: "OpenAI Whisper",
    free: false,
    envKey: "OPENAI_API_KEY",
    requiredSettings: ["stt.openai.key"],
    async transcribe(audio, filename, mime) {
      const key = await secret("stt.openai.key", "OPENAI_API_KEY");
      if (!key) throw new Error("کلید OpenAI تنظیم نشده است");
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), filename);
      form.append("model", (await getSetting("stt.openai.model")) || "whisper-1");
      form.append("language", "fa");
      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      });
      if (!res.ok) throw new Error(`openai HTTP ${res.status}`);
      const data = (await res.json()) as { text?: string };
      return data.text ?? "";
    },
  },
];

const DEFAULT_ORDER: SttProvider[] = ["local", "groq", "huggingface", "cloudflare", "deepgram", "openai"];

/**
 * توصیف فیلدهای پیکربندی هر ربات STT برای پنل تنظیمات (منبع واحد حقیقت).
 * هر فیلد با کلید `stt.<id>.<field>` در جدول Setting ذخیره می‌شود و اگر نبود
 * از متغیر محیطی معادلش خوانده می‌شود (همان مسیری که `secret()` بالا می‌زند).
 */
export interface SttFieldMeta {
  key: string; // کلید کامل، مثل stt.groq.key
  label: string;
  type: "secret" | "string";
  env?: string;
  placeholder?: string;
}
export interface SttProviderMeta {
  id: Exclude<SttProvider, "mock">;
  label: string;
  free: boolean;
  /** توضیح کارت در پنل تنظیمات (اختیاری؛ پیش‌فرض بر اساس free ساخته می‌شود) */
  description?: string;
  /** مدل پیش‌فرض اگر فیلد model خالی بماند */
  modelDefault?: string;
  /** فیلد «مدل» خودکار ساخته نشود (ربات‌های غیر API مثل مدل محلی) */
  hideModelField?: boolean;
  fields: SttFieldMeta[];
}

export const sttProviderMeta: SttProviderMeta[] = [
  {
    id: "local",
    label: "Shenava محلی (آفلاین)",
    free: true,
    description:
      "مدل ۱۱۴M «شنوا کوچیک» با sherpa-onnx داخل خودِ بک‌اند اجرا می‌شود: بدون API، بدون هزینه و بدون اینترنت. مدل و ffmpeg در بوت خودکار آماده می‌شوند (AUTO_ASR=0 آن را خاموش می‌کند)؛ نیازی به نصب روی دستگاه کاربران نیست.",
    hideModelField: true,
    fields: [
      {
        key: "stt.local.model_dir",
        label: "پوشهٔ مدل",
        type: "string",
        env: "SHENAVA_MODEL_DIR",
        placeholder: "models/shenava-koochik-v1.0-sherpa-onnx",
      },
      {
        key: "stt.local.num_threads",
        label: "تعداد ترد CPU",
        type: "string",
        placeholder: "2",
      },
      {
        key: "stt.local.ffmpeg",
        label: "مسیر ffmpeg (اختیاری)",
        type: "string",
        env: "FFMPEG_PATH",
        placeholder: "خالی = models/.bin یا ffmpeg در PATH",
      },
    ],
  },
  {
    id: "groq",
    label: "Groq Whisper (رایگان)",
    free: true,
    modelDefault: "whisper-large-v3-turbo",
    fields: [
      { key: "stt.groq.key", label: "کلید API", type: "secret", env: "GROQ_API_KEY" },
      { key: "stt.groq.model", label: "مدل", type: "string", placeholder: "whisper-large-v3-turbo" },
    ],
  },
  {
    id: "huggingface",
    label: "HuggingFace Inference (رایگان)",
    free: true,
    modelDefault: "openai/whisper-large-v3",
    fields: [
      { key: "stt.huggingface.key", label: "توکن HF", type: "secret", env: "HF_TOKEN" },
      { key: "stt.huggingface.model", label: "مدل", type: "string", placeholder: "openai/whisper-large-v3" },
    ],
  },
  {
    id: "cloudflare",
    label: "Cloudflare Workers AI (رایگان)",
    free: true,
    modelDefault: "@cf/openai/whisper-large-v3-turbo",
    fields: [
      { key: "stt.cloudflare.key", label: "توکن API", type: "secret", env: "CLOUDFLARE_API_TOKEN" },
      { key: "stt.cloudflare.account", label: "Account ID", type: "string", env: "CLOUDFLARE_ACCOUNT_ID" },
      { key: "stt.cloudflare.model", label: "مدل", type: "string", placeholder: "@cf/openai/whisper-large-v3-turbo" },
    ],
  },
  {
    id: "deepgram",
    label: "Deepgram Nova (اعتبار رایگان)",
    free: true,
    modelDefault: "nova-3",
    fields: [
      { key: "stt.deepgram.key", label: "کلید API", type: "secret", env: "DEEPGRAM_API_KEY" },
      { key: "stt.deepgram.model", label: "مدل", type: "string", placeholder: "nova-3" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI Whisper",
    free: false,
    modelDefault: "whisper-1",
    fields: [
      { key: "stt.openai.key", label: "کلید API", type: "secret", env: "OPENAI_API_KEY" },
      { key: "stt.openai.model", label: "مدل", type: "string", placeholder: "whisper-1" },
    ],
  },
];

/** کلید فعال/غیرفعال کردن یک ربات (مقدار "false" آن را از زنجیره خارج می‌کند) */
export const sttEnabledKey = (id: string) => `stt.${id}.enabled`;

async function isAvailable(def: ProviderDef): Promise<boolean> {
  const enabled = await getSetting(`stt.${def.id}.enabled`);
  if (enabled === "false") return false;
  if (def.available) {
    try {
      return (await def.available()).ok;
    } catch {
      return false;
    }
  }
  if (!def.requiredSettings.length) return true;
  const primary = await secret(def.requiredSettings[0], def.envKey);
  if (!primary) return false;
  for (const key of def.requiredSettings.slice(1)) {
    if (!(await secret(key))) return false;
  }
  return true;
}

async function resolveOrder(): Promise<ProviderDef[]> {
  const raw = await getSetting("stt.order");
  const defaultOrder = () =>
    PROVIDERS.filter((p) => DEFAULT_ORDER.includes(p.id)).sort(
      (a, b) => DEFAULT_ORDER.indexOf(a.id) - DEFAULT_ORDER.indexOf(b.id)
    );
  if (!raw) return defaultOrder();
  const wanted = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  // نصب‌های قدیمی همین مقدار پیش‌فرض را دارند و مدل محلی در آن نیست؛ چون local
  // بعداً اضافه شده، بدون نیاز به seed/تغییر دستی آن را اول می‌بریم. هر ترتیب
  // دیگری (سلیقهٔ ادمین) دست‌نخورده می‌ماند و local در انتها اضافه می‌شود.
  if (wanted.join(",") === "groq,huggingface,cloudflare,deepgram,openai") return defaultOrder();
  const ordered: ProviderDef[] = [];
  for (const id of wanted) {
    const found = PROVIDERS.find((p) => p.id === id);
    if (found && !ordered.includes(found)) ordered.push(found);
  }
  // بقیه ربات‌ها (اگر در لیست نبودند) در انتها
  for (const p of PROVIDERS) if (!ordered.includes(p)) ordered.push(p);
  return ordered;
}

/** فهرست وضعیت ربات‌های STT برای نمایش در پنل تنظیمات */
export async function listSttProviders(): Promise<
  { id: SttProvider; label: string; free: boolean; configured: boolean; reason?: string }[]
> {
  const out: { id: SttProvider; label: string; free: boolean; configured: boolean; reason?: string }[] = [];
  for (const def of await resolveOrder()) {
    const configured = await isAvailable(def);
    let reason: string | undefined;
    if (!configured && def.available) {
      try {
        reason = (await def.available()).reason;
      } catch {
        reason = undefined;
      }
    }
    out.push({ id: def.id, label: def.label, free: def.free, configured, reason });
  }
  out.push({ id: "mock", label: "Mock محلی (همیشه در دسترس)", free: true, configured: true });
  return out;
}

const SAMPLE_TRANSCRIPTS = [
  "سلام، می‌خواستم برای فردا ساعت ده صبح نوبت کوتاهی مو بگیرم. نام من سارا احمدی است و شماره موبایلم ۰۹۱۲۳۴۵۶۷۸۹ است.",
  "برای امروز ساعت شش عصر یک نوبت رنگ مو می‌خواهم. اسم من مریم است.",
  "دو شنبه ساعت دوازده ظهر برای کاشت ناخن وقت می‌گیرم. شماره من ۰۹۹۱۲۳۴۵۶۷ است.",
];

/** تبدیل گفتار به متن با fallback بین ربات‌ها (هرگز خطا پرتاب نمی‌کند) */
export async function transcribeWithFallback(
  audio: Uint8Array,
  opts?: { filename?: string; mimeType?: string }
): Promise<{ transcript: string; provider: SttProvider; errors?: string[] }> {
  const filename = opts?.filename ?? "recording.webm";
  const mime = opts?.mimeType ?? "audio/webm";
  const errors: string[] = [];

  for (const def of await resolveOrder()) {
    if (!(await isAvailable(def))) {
      let why = "تنظیم نشده";
      if (def.available) {
        try {
          why = (await def.available()).reason ?? "در دسترس نیست";
        } catch {
          why = "در دسترس نیست";
        }
      }
      errors.push(`${def.id}: ${why}`);
      continue;
    }
    // تلاش دوباره کوتاه برای خطاهای موقت (محدودیت نرخ/شبکه)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const transcript = (await def.transcribe(audio, filename, mime)).trim();
        if (transcript) return { transcript, provider: def.id, errors: errors.length ? errors : undefined };
        errors.push(`${def.id}: متن خالی`);
        break;
      } catch (e) {
        errors.push(`${def.id}: ${e instanceof Error ? e.message : "خطا"}`);
        if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  return {
    transcript: SAMPLE_TRANSCRIPTS[Math.floor(Math.random() * SAMPLE_TRANSCRIPTS.length)],
    provider: "mock",
    errors: errors.length ? errors : undefined,
  };
}
