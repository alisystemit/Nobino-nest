import { Injectable } from '@nestjs/common';
import { SettingsService } from '@/modules/settings/settings.service';
import { PrismaService } from '@/common/database/prisma.service';
import { normalizeChatUrl } from './llm-helpers';

export type LlmProviderId = 'openai' | 'groq' | 'deepseek' | 'custom';

export interface LlmProviderMeta {
  id: LlmProviderId;
  name: string;
  description: string;
  defaultBaseUrl: string;
  defaultModel: string;
  modelHint: string;
  keySetting: string;
  keyEnv: string;
}

export interface ResolvedLlm {
  provider: LlmProviderId;
  key: string;
  model: string;
  baseUrl: string;
  supportsJsonMode: boolean;
}

export interface LlmResult {
  ok: boolean;
  content?: string;
  provider?: LlmProviderId;
  model?: string;
  latencyMs?: number;
  error?: string;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class AiLlmService {
  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  async llmEnabled(): Promise<boolean> {
    const raw = (await this.settings.get('ai.enabled')) ?? 'true';
    const enabled = raw.trim().toLowerCase();
    return enabled !== 'false' && enabled !== '0' && enabled !== 'off';
  }

  async switchOn(): Promise<boolean> {
    return this.llmEnabled();
  }

  async resolveActive(): Promise<ResolvedLlm | null> {
    if (!(await this.llmEnabled())) return null;

    const wanted = ((await this.settings.get('ai.provider')) ?? '').trim().toLowerCase();
    const providers: LlmProviderId[] = ['openai', 'groq', 'deepseek', 'custom'];
    const order = providers.filter((id) => id !== wanted);
    if (wanted && ['openai', 'groq', 'deepseek', 'custom'].includes(wanted)) order.unshift(wanted as LlmProviderId);

    for (const id of order) {
      const meta = this.getProviderMeta(id);
      if (!meta) continue;

      const key = (await this.settings.get(meta.keySetting) ?? '').trim();
      if (!key) continue;

      const modelOverride = ((await this.settings.get(`ai.${id}.model`)) ?? '').trim();
      const baseOverride = ((await this.settings.get('ai.custom.base_url')) ?? '').trim();
      const baseUrl = id === 'custom' ? (baseOverride || meta.defaultBaseUrl) : (baseOverride && id === wanted ? baseOverride : meta.defaultBaseUrl);
      const model = modelOverride || (await this.settings.get('ai.model') ?? '') || meta.defaultModel || 'gpt-4o-mini';

      return {
        provider: id,
        key,
        model,
        baseUrl: baseUrl.replace(/\/+$/, ''),
        supportsJsonMode: id !== 'deepseek' || /deepseek-chat|deepseek-reasoner/.test(model),
      };
    }
    return null;
  }

  getProviderMeta(id: string): LlmProviderMeta | undefined {
    const providers: LlmProviderMeta[] = [
      {
        id: 'openai',
        name: 'OpenAI',
        description: 'کیفیت بالا؛ نیازمند اعتبار ارزی (gpt-4o-mini ارزان‌ترین گزینهٔ مناسب فارسی است).',
        defaultBaseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o-mini',
        modelHint: 'مثلاً gpt-4o-mini یا gpt-4.1-mini',
        keySetting: 'openai.api_key',
        keyEnv: 'OPENAI_API_KEY',
      },
      {
        id: 'groq',
        name: 'Groq',
        description: 'سرعت بسیار بالا با پلن رایگان؛ مدل‌های Llama و Whisper رایگان.',
        defaultBaseUrl: 'https://api.groq.com/openai/v1',
        defaultModel: 'llama-3.3-70b-versatile',
        modelHint: 'مثلاً llama-3.3-70b-versatile',
        keySetting: 'stt.groq.key',
        keyEnv: 'GROQ_API_KEY',
      },
      {
        id: 'deepseek',
        name: 'DeepSeek',
        description: 'قیمت بسیار پایین و کیفیت خوب فارسی؛ نیازمند کلید از platform.deepseek.com.',
        defaultBaseUrl: 'https://api.deepseek.com/v1',
        defaultModel: 'deepseek-chat',
        modelHint: 'deepseek-chat',
        keySetting: 'ai.deepseek.key',
        keyEnv: 'DEEPSEEK_API_KEY',
      },
      {
        id: 'custom',
        name: 'سرویس سفارشی/محلی',
        description: 'هر API سازگار با OpenAI (OpenRouter، Ollama، LM Studio، پروکسی داخلی).',
        defaultBaseUrl: '',
        defaultModel: '',
        modelHint: 'نام دقیق مدل در سرویس شما',
        keySetting: 'ai.custom.key',
        keyEnv: 'AI_CUSTOM_API_KEY',
      },
    ];
    return providers.find((p) => p.id === id);
  }

  async listProviders(): Promise<{ id: string; name: string; description: string; modelHint: string; defaultModel: string; keySet: boolean; keyMasked: string | null }[]> {
    const providers = ['openai', 'groq', 'deepseek', 'custom'];
    const results = await Promise.all(
      providers.map(async (id) => {
        const meta = this.getProviderMeta(id);
        if (!meta) return null;
        const key = (await this.settings.get(meta.keySetting) ?? '').trim();
        return {
          id: meta.id,
          name: meta.name,
          description: meta.description,
          modelHint: meta.modelHint,
          defaultModel: meta.defaultModel,
          keySet: Boolean(key),
          keyMasked: key ? this.maskKey(key) : null,
        };
      }),
    );
    return results.filter((x): x is NonNullable<typeof x> => x !== null);
  }

  maskKey(key: string): string {
    if (key.length <= 8) return '***';
    return key.slice(0, 4) + '***' + key.slice(-4);
  }

  async testConnection(): Promise<{ ok: boolean; provider?: string; model?: string; latencyMs?: number; sample?: string; error?: string }> {
    const res = await this.llmChatResult(
      [
        { role: 'system', content: 'یک دستیار کوتاه فارسی‌زبان. فقط با چند کلمه پاسخ بده.' },
        { role: 'user', content: 'سلام! خودت را در سه کلمه معرفی کن.' },
      ],
      { temperature: 0.2, maxTokens: 40, timeoutMs: 15000 },
    );
    if (!res.ok) return { ok: false, provider: res.provider, model: res.model, latencyMs: res.latencyMs, error: res.error };
    return { ok: true, provider: res.provider, model: res.model, latencyMs: res.latencyMs, sample: res.content };
  }

  async llmChat(messages: LlmMessage[], opts?: { temperature?: number; json?: boolean; maxTokens?: number }): Promise<string | null> {
    const res = await this.llmChatResult(messages, opts);
    return res.ok ? (res.content ?? null) : null;
  }

  async llmChatResult(messages: LlmMessage[], opts?: { temperature?: number; json?: boolean; maxTokens?: number; timeoutMs?: number }): Promise<LlmResult> {
    if (!(await this.llmEnabled())) {
      return { ok: false, error: 'هوش مصنوعی از پنل غیرفعال است (ai.enabled = false).' };
    }

    const llm = await this.resolveActive();
    if (!llm) return { ok: false, error: 'کلید API برای هیچ سرویس هوش مصنوعی‌ای تنظیم نشده است.' };

    const startedAt = Date.now();
    const body: Record<string, unknown> = {
      model: llm.model,
      temperature: opts?.temperature ?? 0.4,
      messages,
      max_tokens: opts?.maxTokens ?? 700,
    };
    if (opts?.json && llm.supportsJsonMode) body.response_format = { type: 'json_object' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 20000);
    try {
      const res = await fetch(normalizeChatUrl(llm.baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llm.key}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = (await res.text().catch(() => '')).slice(0, 180);
        return {
          ok: false,
          provider: llm.provider,
          model: llm.model,
          latencyMs: Date.now() - startedAt,
          error: `HTTP ${res.status}: ${text}`,
        };
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) return { ok: false, provider: llm.provider, model: llm.model, error: 'پاسخ خالی از سرویس دریافت شد.' };
      return { ok: true, content, provider: llm.provider, model: llm.model, latencyMs: Date.now() - startedAt };
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      return {
        ok: false,
        provider: llm.provider,
        model: llm.model,
        error: aborted ? 'مهلت پاسخ‌دهی سرویس تمام شد (timeout).' : `خطای شبکه: ${err instanceof Error ? err.message : 'نامشخص'}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async generateContent(opts: {
    type: 'service_description' | 'staff_bio' | 'promo' | 'announcement' | 'sms_campaign';
    salonId: string;
    targetId?: string;
    name?: string;
    brief?: string;
  }): Promise<{ text: string; usedAI: boolean }> {
    const salon = await this.prisma.salon.findUnique({
      where: { id: opts.salonId },
      include: {
        services: { where: { isActive: true }, select: { name: true, price: true, durationMin: true }, take: 12 },
      },
    });

    let service = null;
    if (opts.type === 'service_description' && opts.targetId && opts.targetId !== 'new') {
      service = await this.prisma.service.findUnique({ where: { id: opts.targetId } });
      if (!service) return { text: 'خدمت موردنظر یافت نشد یا به این سالن تعلق ندارد.', usedAI: false };
    }

    let staff = null;
    if (opts.type === 'staff_bio' && opts.targetId && opts.targetId !== 'new') {
      staff = await this.prisma.staff.findUnique({ where: { id: opts.targetId } });
      if (!staff) return { text: 'کارمند موردنظر یافت نشد یا به این سالن تعلق ندارد.', usedAI: false };
    }

    const serviceName = service?.name ?? opts.name ?? '';
    const staffName = staff?.name ?? opts.name ?? '';

    if (await this.llmEnabled()) {
      const facts = {
        salon: salon?.name,
        city: salon?.city ?? undefined,
        description: salon?.description ?? undefined,
        services: (salon?.services ?? []).map((s: { name: string }) => s.name),
        type: opts.type,
        service: serviceName
          ? { name: serviceName, durationMin: service?.durationMin, price: service?.price, category: service?.category ?? opts.brief }
          : undefined,
        staff: staffName ? { name: staffName, title: staff?.title, specialties: staff?.specialties ?? (opts.brief ? [opts.brief] : []) } : undefined,
        brief: opts.brief || undefined,
      };

      const promptByType: Record<string, string> = {
        service_description: 'برای این خدمت آرایشگاه یک توضیح کوتاه، جذاب و صادقانه به فارسی بنویس (حداکثر دو جمله). نام خدمت را تکرار نکن و قیمت را وعده نده.',
        staff_bio: 'برای این آرایشگر/کارمند یک بیوی کوتاه و حرفه‌ای به فارسی بنویس (حداکثر دو جمله) که تخصص‌هایش را برجسته کند.',
        promo: 'یک متن تبلیغاتی کوتاه و دوستانه به فارسی برای صفحهٔ معرفی سالن بنویس (حداکثر سه جمله) با یک دعوت به رزرو.',
        announcement: 'یک اعلان کوتاه (حداکثر ۲۵ کلمه) به فارسی برای پنل مشتریان سالن بنویس؛ لحن محترمانه و بدون اغراق.',
        sms_campaign: 'یک پیامک تبلیغاتی حداکثر ۱۶۰ کاراکتر به فارسی بنویس؛ با سلام کوتاه و یک دعوت به رزرو؛ لینک و عدد ساختگی نگذار.',
      };

      const text = await this.llmChat(
        [
          { role: 'system', content: `تو کپی‌رایتر سالن‌های زیبایی هستی. فقط بر اساس اطلاعات داده‌شده بنویس و چیزی اختراع نکن. خروجی فقط متن نهایی باشد، بدون توضیح اضافه.\n${promptByType[opts.type]}` },
          { role: 'user', content: JSON.stringify(facts) },
        ],
        { temperature: 0.7, maxTokens: 300 },
      );

      if (text) return { text: this.cleanGeneratedText(text), usedAI: true };
    }

    // Fallback
    if (opts.type === 'service_description') {
      return {
        text: this.cleanGeneratedText(
          service
            ? `${service.name} در «${salon?.name}» با کیفیت بالا و در ${service.durationMin} دقیقه ارائه می‌شود. برای رزرو همین حالا اقدام کنید.`
            : serviceName
            ? `${serviceName} در «${salon?.name}» با نظافت و کیفیت حرفه‌ای ارائه می‌شود. برای رزرو همین حالا اقدام کنید.`
            : `خدمات «${salon?.name}» با کیفیت بالا و در زمان‌بندی منظم ارائه می‌شود.`,
        ),
        usedAI: false,
      };
    }
    if (opts.type === 'staff_bio') {
      const specs = staff?.specialties?.length ? `متخصص در ${staff.specialties.join('، ')} — ` : opts.brief ? `متخصص در ${opts.brief} — ` : '';
      return {
        text: this.cleanGeneratedText(`${staffName || 'همکار'}${staff?.title ? ` (${staff.title})` : ''} ${specs}آمادهٔ ارائهٔ بهترین خدمات به شما در «${salon?.name}».`),
        usedAI: false,
      };
    }
    if (opts.type === 'promo') {
      return {
        text: this.cleanGeneratedText(`به «${salon?.name}» خوش آمدید! همین حالا نوبت خود را رزرو کنید و از خدمات حرفه‌ای ما لذت ببرید.`),
        usedAI: false,
      };
    }
    if (opts.type === 'announcement') {
      return {
        text: this.cleanGeneratedText(`برای دریافت بهترین خدمات در «${salon?.name}» همین حالا نوبت خود را رزرو کنید.`),
        usedAI: false,
      };
    }
    return {
      text: this.cleanGeneratedText(`«${salon?.name}» — خدمات حرفه‌ای زیبایی؛ برای رزرو نوبت به صفحهٔ سالن مراجعه کنید.`),
      usedAI: false,
    };
  }

  cleanGeneratedText(text: string): string {
    return text.replace(/^["'\s]+|["'\s]+$/g, '').replace(/\n\s*\n/g, '\n').trim();
  }
}
