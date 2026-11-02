// پورت‌شده از src/app/api/admin/settings/route.ts
// این نسخه علاوه بر ردیف‌های جدول Setting، «کاتالوگ تنظیمات» را هم سرو می‌کند تا
// پنل سوپرادمین بتواند کلیدهایی که هنوز ساخته نشده‌اند (کلید AI، اعتبارنامهٔ درگاه، …)
// را هم نمایش و ذخیره کند. مقادیر secret هرگز به کلاینت ارسال نمی‌شود.

import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { getAllSettings, updateSetting, deleteSetting, invalidateSettings } from "@/lib/settings";
import { smsProviderMeta, resolveActiveSmsProviderId } from "@/lib/sms/providers";
import { catalogFields, catalogMetaFor, settingsSections, type CatalogFieldType } from "@/lib/settings-catalog";
import { json, apiError } from "@/lib/utils";
import { KEEP_SECRET } from "@/lib/markers";

export interface CatalogValue {
  key: string;
  group: string;
  label: string;
  type: CatalogFieldType;
  options?: string[];
  hint?: string;
  isSecret: boolean;
  readOnly: boolean;
  /** نام متغیر محیطی جایگزین */
  env?: string;
  /** پیش‌فرض کد (برای نمایش در پنل وقتی چیزی ست نشده است) */
  defaultValue?: string;
  /** آیا مقدار در دیتابیس ذخیره شده است */
  hasDbValue: boolean;
  /** آیا متغیر محیطی جایگزین پر است */
  hasEnvValue: boolean;
  /** منبع فعلی مقدار: دیتابیس / env / پیش‌فرض کد / هیچی */
  source: "db" | "env" | "default" | "none";
  /** برای secret فقط نشانهٔ KEEP_SECRET ارسال می‌شود، نه مقدار */
  value: string;
}

const envValue = (name?: string): string => (name ? (process.env[name] ?? "").trim() : "");

export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    const rows = await getAllSettings();
    const rowMap = new Map(rows.map((r) => [r.key, r]));
    const activeSmsProvider = await resolveActiveSmsProviderId();
    const fields = catalogFields();

    const values: CatalogValue[] = fields.map(({ section, field }) => {
      const row = rowMap.get(field.key);
      const hasDbValue = Boolean(row?.value && row.value.length > 0);
      const envRaw = envValue(field.env);
      const hasEnvValue = envRaw.length > 0;
      const masked = field.readOnly || field.type === "secret";
      const fallback = field.defaultValue ?? "";
      return {
        key: field.key,
        group: section.id,
        label: field.label,
        type: field.type,
        options: field.options,
        hint: field.hint,
        isSecret: field.type === "secret",
        readOnly: Boolean(field.readOnly),
        env: field.env,
        defaultValue: fallback || undefined,
        hasDbValue,
        hasEnvValue,
        source: hasDbValue ? "db" : hasEnvValue ? "env" : fallback ? "default" : "none",
        // `envRaw` همیشه رشته است (حتی وقتی env ست نشده)، پس از `||` استفاده می‌کنیم
        // تا پیش‌فرض کد جای خالی را پر کند.
        value: masked ? (hasDbValue ? KEEP_SECRET : "") : (row?.value || envRaw || fallback),
      };
    });

    const catalogKeys = new Set(fields.map((f) => f.field.key));
    // ردیف‌های دیتابیسی که در کاتالوگ نیستند هم برگردانده می‌شوند تا چیزی پنهان/گم نشود
    const extras = rows
      .filter((r) => !catalogKeys.has(r.key))
      .map((s) => ({
        key: s.key,
        group: s.group,
        type: s.type,
        options: s.options ? (JSON.parse(s.options) as string[]) : undefined,
        label: s.description ?? s.key,
        isSecret: s.isSecret,
        hasDbValue: Boolean(s.value),
        value: s.isSecret ? (s.value ? KEEP_SECRET : "") : (s.value ?? ""),
      }));

    return json({
      success: true,
      activeSmsProvider,
      smsProviders: smsProviderMeta,
      sections: settingsSections(),
      values,
      extras,
      // سازگاری با نسخهٔ قبلی پنل
      settings: rows.map((s) => ({
        key: s.key,
        group: s.group,
        type: s.type,
        options: s.options ? JSON.parse(s.options) : undefined,
        description: s.description,
        isSecret: s.isSecret,
        hasValue: s.isSecret ? Boolean(s.value) : true,
        value: s.isSecret ? (s.value ? KEEP_SECRET : "") : s.value,
      })),
    });
  } catch (err) {
    return apiError(err);
  }
}

const updateSchema = z.object({
  updates: z.array(
    z.object({
      key: z.string(),
      value: z.string().optional(),
      clear: z.boolean().optional(),
      group: z.string().optional(),
      type: z.string().optional(),
      isSecret: z.boolean().optional(),
    })
  ),
});

export async function PATCH(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    const body = updateSchema.parse(await req.json());

    const rows = await getAllSettings();
    const rowMap = new Map(rows.map((s) => [s.key, s]));
    const skipped: { key: string; reason: string }[] = [];

    for (const u of body.updates) {
      const meta = catalogMetaFor(u.key);
      const prev = rowMap.get(u.key);

      // کلیدهای env-only قابل ذخیره نیستند (در زمان بوت خوانده می‌شوند)
      if (meta?.readOnly) {
        skipped.push({ key: u.key, reason: "env-only" });
        continue;
      }

      // اولویت با متادیتای کاتالوگ است تا secretها حتماً رمزنگاری شوند
      const isSecret = meta?.isSecret ?? u.isSecret ?? prev?.isSecret ?? false;
      if (isSecret && u.value === KEEP_SECRET) continue; // کاربر قصد تغییر ندارد

      if (u.clear) {
        // حذف رکورد → مقدار پیش‌فرض/env دوباره فعال می‌شود («بازگشت به پیش‌فرض»)
        await deleteSetting(u.key);
        continue;
      }

      await updateSetting(u.key, u.value ?? "", {
        group: u.group ?? meta?.group ?? prev?.group ?? "general",
        type: u.type ?? meta?.type ?? prev?.type ?? (isSecret ? "secret" : "string"),
        isSecret,
        description: prev?.description ?? meta?.description ?? null,
        options: meta?.options ? JSON.stringify(meta.options) : prev?.options ?? null,
      });
    }

    invalidateSettings();
    return json({ success: true, skipped });
  } catch (err) {
    return apiError(err);
  }
}
