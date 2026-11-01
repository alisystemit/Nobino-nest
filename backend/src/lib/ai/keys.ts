import { getSetting, settingOrEnv } from "@/lib/settings";
import { env } from "@/lib/env";

/**
 * خواندن کلیدهای AI از پنل سوپرادمین (جدول Setting) با جایگزین متغیر محیطی.
 *
 * دو خانوادهٔ کلید در پروژه وجود دارد که هر دو باید کار کنند:
 * - `openai.api_key`  → مسیر متنی (assistant/LLM) — همان که در پنل قدیمی ذخیره شده بود
 * - `stt.openai.key`  → مسیر تبدیل گفتار به متن (زنجیرهٔ ربات‌ها در stt.ts)
 * یک کلید مشترک کافی است، پس هر دو نام در ترتیب پایین جست‌وجو می‌شوند.
 */

/** کلید OpenAI: تنظیم پنل ← تنظیم ربات Whisper ← متغیر محیطی */
export async function openaiApiKey(): Promise<string> {
  const fromPanel = await settingOrEnv("openai.api_key", undefined);
  if (fromPanel?.trim()) return fromPanel.trim();
  const fromStt = await getSetting("stt.openai.key");
  if (fromStt?.trim()) return fromStt.trim();
  return (env.OPENAI_API_KEY ?? "").trim();
}

/** آیا هوش مصنوعی روشن است؟ (کلید لازم است مگر اینکه دستی روشن/خاموش شده باشد) */
export async function aiEnabled(): Promise<boolean> {
  const flag = (await settingOrEnv("ai.enabled", undefined))?.trim().toLowerCase();
  if (flag === "false") return false;
  if (flag === "true") return true;
  return Boolean(await openaiApiKey());
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
