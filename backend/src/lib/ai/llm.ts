import { aiEnabled, llmModel, openaiApiKey } from "@/lib/ai/keys";

/** آیا LLM فعال است؟ (کلید از پنل یا env باشد و `ai.enabled` خاموش نشده باشد) */
export async function llmEnabled(): Promise<boolean> {
  return aiEnabled();
}

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** فراخوانی LLM (OpenAI) — در نبود کلید، null برمی‌گرداند */
export async function llmChat(messages: LlmMessage[], opts?: { temperature?: number; json?: boolean }): Promise<string | null> {
  if (!(await aiEnabled())) return null;
  const apiKey = await openaiApiKey();
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: await llmModel(),
        temperature: opts?.temperature ?? 0.4,
        messages,
        ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}
