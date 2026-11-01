import { aiEnabled, resolveLlm } from "@/lib/ai/keys";

/**
 * ساخت آدرس کامل chat/completions از آدرس پایهٔ هر سرویس.
 * (مشترک با modules/ai/llm/llm-helpers.ts — آنجا نسخهٔ Nest سرویس است.)
 */
export function normalizeChatUrl(raw: string, fallback = "https://api.openai.com/v1"): string {
  let u = (raw ?? "").trim().replace(/\/+$/, "");
  if (!u) u = fallback;
  if (/\/chat\/completions$/.test(u)) return u;
  if (/\/v\d+$/.test(u) || !/\/v\d/.test(u)) u = `${u}/chat/completions`;
  else u = `${u}/v1/chat/completions`;
  return u;
}

/** آیا LLM فعال است؟ (کلید از پنل یا env باشد و `ai.enabled` خاموش نشده باشد) */
export async function llmEnabled(): Promise<boolean> {
  return aiEnabled();
}

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * فراخوانی LLM با سرویس فعال پنل (openai/groq/deepseek/custom) —
 * در نبود کلید یا خطا، null برمی‌گرداند تا مسیرهای fallback قاعده‌محور فعال شوند.
 */
export async function llmChat(messages: LlmMessage[], opts?: { temperature?: number; json?: boolean }): Promise<string | null> {
  const llm = await resolveLlm();
  if (!llm) return null;

  const body: Record<string, unknown> = {
    model: llm.model,
    temperature: opts?.temperature ?? 0.4,
    messages,
    max_tokens: 700,
  };
  if (opts?.json && llm.supportsJsonMode) body.response_format = { type: "json_object" };

  try {
    const res = await fetch(normalizeChatUrl(llm.baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${llm.key}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}
