import { getSetting, settingOrEnv } from "@/lib/settings";
import { env } from "@/lib/env";

/**
 * خواندن کلیدها و سرویس‌دهندهٔ متن (LLM) از پنل سوپرادمین (جدول Setting) با
 * جایگزین متغیر محیطی.
 *
 * دو خانوادهٔ کلید در پروژه وجود دارد که هر دو باید کار کنند:
 * - `openai.api_key`  → مسیر متنی (assistant/LLM) — همان که در پنل قدیمی ذخیره شده بود
 * - `stt.openai.key`  → مسیر تبدیل گفتار به متن (زنجیرهٔ ربات‌ها در stt.ts)
 * یک کلید مشترک کافی است، پس هر دو نام در ترتیب پایین جست‌وجو می‌شوند.
 *
 * سرویس‌دهندهٔ متن چندگانه است (openai / groq / deepseek / custom) و کلیدهایش
 * همان کلیدهایی است که سرویس `AiLlmService` (پنل تب «هوش مصنوعی») مصرف می‌کند؛
 * یعنی هر سرویسی که ادمین در پنل انتخاب و فعال کند، دستیار سایت و تحلیل و تولید
 * محتوا هم دقیقاً از همان استفاده می‌کنند.
 */

export type LlmProviderId = "openai" | "groq" | "deepseek" | "custom";

export const LLM_PROVIDER_META: {
  id: LlmProviderId;
  name: string;
  defaultBaseUrl: string;
  defaultModel: string;
  keySetting: string;
  keyEnv: string;
}[] = [
  {
    id: "openai",
    name: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    keySetting: "openai.api_key",
    keyEnv: "OPENAI_API_KEY",
  },
  {
    id: "groq",
    name: "Groq",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    keySetting: "stt.groq.key",
    keyEnv: "GROQ_API_KEY",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    keySetting: "ai.deepseek.key",
    keyEnv: "DEEPSEEK_API_KEY",
  },
  {
    id: "custom",
    name: "سرویس سفارشی/محلی",
    defaultBaseUrl: "",
    defaultModel: "",
    keySetting: "ai.custom.key",
    keyEnv: "AI_CUSTOM_API_KEY",
  },
];

/** کلید OpenAI: تنظیم پنل ← تنظیم ربات Whisper ← متغیر محیطی */
export async function openaiApiKey(): Promise<string> {
  const fromPanel = await settingOrEnv("openai.api_key", undefined);
  if (fromPanel?.trim()) return fromPanel.trim();
  const fromStt = await getSetting("stt.openai.key");
  if (fromStt?.trim()) return fromStt.trim();
  return (env.OPENAI_API_KEY ?? "").trim();
}

/** کلید Groq (مشترک بین مسیر STT و مسیر متن) */
export async function groqApiKey(): Promise<string> {
  const fromPanel = await getSetting("stt.groq.key");
  if (fromPanel?.trim()) return fromPanel.trim();
  return (process.env.GROQ_API_KEY ?? "").trim();
}

/** کلید DeepSeek */
export async function deepseekApiKey(): Promise<string> {
  const fromPanel = await getSetting("ai.deepseek.key");
  if (fromPanel?.trim()) return fromPanel.trim();
  return (process.env.DEEPSEEK_API_KEY ?? "").trim();
}

/** کلید سرویس سفارشی (سازگار با OpenAI) */
export async function customApiKey(): Promise<string> {
  const fromPanel = await getSetting("ai.custom.key");
  if (fromPanel?.trim()) return fromPanel.trim();
  return (process.env.AI_CUSTOM_API_KEY ?? "").trim();
}

/** آدرس پایهٔ سرویس سفارشی */
export async function customBaseUrl(): Promise<string> {
  const fromPanel = await getSetting("ai.custom.base_url");
  if (fromPanel?.trim()) return fromPanel.trim();
  return (process.env.AI_CUSTOM_BASE_URL ?? "").trim();
}

async function keyFor(id: LlmProviderId): Promise<string> {
  if (id === "openai") return openaiApiKey();
  if (id === "groq") return groqApiKey();
  if (id === "deepseek") return deepseekApiKey();
  return customApiKey();
}

export interface ResolvedLlm {
  provider: LlmProviderId;
  key: string;
  model: string;
  baseUrl: string;
  supportsJsonMode: boolean;
}

/**
 * حل سرویس فعال متن: `ai.provider` انتخاب‌شده در پنل؛ اگر کلیدش خالی بود،
 * اولین سرویسی که کلید دارد. `ai.enabled=false` کل مسیر را می‌بندد.
 */
export async function resolveLlm(): Promise<ResolvedLlm | null> {
  const flag = (await getSetting("ai.enabled"))?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") return null;

  const wanted = (await getSetting("ai.provider"))?.trim().toLowerCase();
  const order: LlmProviderId[] = (["openai", "groq", "deepseek", "custom"] as LlmProviderId[]).filter((id) => id !== wanted);
  if (wanted && LLM_PROVIDER_META.some((m) => m.id === wanted)) order.unshift(wanted as LlmProviderId);

  for (const id of order) {
    const meta = LLM_PROVIDER_META.find((m) => m.id === id);
    if (!meta) continue;

    const key = await keyFor(id);
    if (!key) continue;

    const modelOverride = (await getSetting(`ai.${id}.model`))?.trim();
    const baseOverride = await customBaseUrl();
    const baseUrl =
      id === "custom" ? baseOverride || meta.defaultBaseUrl : baseOverride && id === wanted ? baseOverride : meta.defaultBaseUrl;
    const model = modelOverride || (await getSetting("ai.model"))?.trim() || meta.defaultModel;

    if (id === "custom" && !baseUrl) continue; // سفارشی بدون آدرس قابل استفاده نیست

    return {
      provider: id,
      key,
      model,
      baseUrl: baseUrl.replace(/\/+$/, ""),
      supportsJsonMode: id !== "deepseek" || /deepseek-chat|deepseek-reasoner/.test(model),
    };
  }
  return null;
}

/** آیا هوش مصنوعی روشن است؟ (سوییچ پنل صریح است؛ در غیر این صورت وجود کلید) */
export async function aiEnabled(): Promise<boolean> {
  const flag = (await settingOrEnv("ai.enabled", undefined))?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") return false;
  if (flag === "true" || flag === "on" || flag === "1") return true;
  return Boolean(await resolveLlm());
}

/** مدل متنی (chat) — پیش‌فرض رفتاری قبلی کد حفظ شده است */
export async function llmModel(): Promise<string> {
  return (await settingOrEnv("llm.model", undefined))?.trim() || "gpt-4o-mini";
}

/** درایور صوت: تنظیم پنل ← env ← mock */
export async function voiceProvider(): Promise<"openai" | "mock"> {
  const v = ((await settingOrEnv("voice.provider", env.VOICE_PROVIDER)) ?? "mock").trim().toLowerCase();
  return v === "openai" ? "openai" : "mock";
}

/** مدل Whisper برای مسیر transcribeAudio */
export async function whisperModel(): Promise<string> {
  return (await settingOrEnv("stt.openai.model", env.OPENAI_MODEL))?.trim() || "whisper-1";
}
