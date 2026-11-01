/**
 * منطق پنل سوپرادمین برای ماتریس محدودیت‌ها.
 *
 * هر خانهٔ ماتریس یک کلید تنظیمات است: `plan.limit.<PLAN>.<key>`.
 * - اگر کلید وجود نداشته باشد → پیش‌فرض پلن استفاده می‌شود (بدون رکورد اضافه در دیتابیس).
 * - اگر مقدار داده شود → همان لحظه در سراسر سامانه اعمال می‌شود (بدون دیپلوی).
 * - «بازگشت به پیش‌فرض» یعنی حذف همان رکورد.
 */
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { deleteSetting, updateSetting } from "@/lib/settings";
import { UNLIMITED_FROM, type LimitDef } from "./limit-defs";
import { INPUT_LIMIT_DEFS, PLAN_DEFAULTS, PLAN_LABELS, PLAN_ORDER, findInputLimitDef, getPlanLimitsForPlan, normalizePlan, type PlanName } from "./limits";

export type LimitCell = {
  plan: PlanName;
  key: string;
  /** مقدار پیش‌فرض پلن */
  fallback: number | boolean;
  /** مقدار دست‌ی ذخیره‌شده (null یعنی پیش‌فرض)؛ کلید قدیمی با پیشوند `legacy:` می‌آید */
  override: string | null;
  /** مقداری که همین الان اعمال می‌شود */
  effective: number | boolean;
  overridden: boolean;
  /** دست‌ی است ولی همان عدد پیش‌فرض را می‌دهد (ردیف به‌جا مانده از seed قدیمی) */
  atDefault: boolean;
};

export type LimitMatrix = {
  plans: { id: PlanName; label: string }[];
  defs: LimitDef[];
  cells: Record<string, LimitCell>; // `${plan}:${key}`
  /** آستانه‌ای که از آن به بالا عدد «نامحدود» خوانده می‌شود (پنل آن را hard-code نمی‌کند) */
  unlimitedFrom: number;
};

export class LimitConfigError extends Error {
  status = 400;
}

function cellKey(plan: PlanName, key: string) {
  return `${plan}:${key}`;
}

/** ماتریس کامل: پیش‌فرضها + دست‌کاری‌های فعلی + مقدار اعمال‌شده */
export async function getLimitsMatrix(): Promise<LimitMatrix> {
  const rows = await prisma.setting.findMany({ where: { key: { startsWith: "plan.limit." } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value ?? null]));
  const cells: Record<string, LimitCell> = {};

  for (const plan of PLAN_ORDER) {
    const effective = await getPlanLimitsForPlan(plan);
    for (const def of INPUT_LIMIT_DEFS) {
      const scoped = byKey.get(`plan.limit.${plan}.${def.key}`) ?? null;
      const legacy = byKey.get(`plan.limit.${def.key}`) ?? null;
      const override = scoped ?? (scoped == null && legacy != null ? `legacy:${legacy}` : null);
      const fallback = PLAN_DEFAULTS[plan][def.key];
      cells[cellKey(plan, def.key as string)] = {
        plan,
        key: def.key as string,
        fallback,
        override,
        effective: effective[def.key],
        overridden: scoped != null || legacy != null,
        atDefault: (scoped != null || legacy != null) && effective[def.key] === fallback,
      };
    }
  }

  return {
    plans: PLAN_ORDER.map((id) => ({ id, label: PLAN_LABELS[id] })),
    defs: INPUT_LIMIT_DEFS,
    cells,
    unlimitedFrom: UNLIMITED_FROM,
  };
}

/** مقدار ورودی پنل را اعتبارسنجی و به رشتهٔ قابل ذخیره تبدیل می‌کند */
function coerceValue(def: LimitDef, raw: string | number | boolean | null): string | null {
  if (raw === null || raw === "" || raw === undefined) return null;
  if (def.kind === "bool") {
    const v = typeof raw === "boolean" ? raw : String(raw).toLowerCase();
    if (v === true || v === "true") return "true";
    if (v === false || v === "false") return "false";
    throw new LimitConfigError(`مقدار «${def.label}» باید true یا false باشد.`);
  }
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new LimitConfigError(`مقدار «${def.label}» باید عددی نامنفی باشد.`);
  if (n > def.max) throw new LimitConfigError(`مقدار «${def.label}» نباید بیشتر از ${def.max.toLocaleString("en-US")} باشد.`);
  return String(Math.floor(n));
}

export type LimitUpdate = { plan: string; key: string; value: string | number | boolean | null };

/**
 * ذخیرهٔ مجموعه‌ای از خانه‌های ماتریس.
 * `value = null` یعنی بازگشت به پیش‌فرض (حذف رکورد تنظیمات).
 */
export async function savePlanLimits(updates: LimitUpdate[], actor: { id?: string; phone?: string }) {
  const saved: { plan: PlanName; key: string; value: string | null }[] = [];

  for (const u of updates) {
    const upper = (u.plan ?? "").toUpperCase();
    if (!(PLAN_ORDER as string[]).includes(upper)) throw new LimitConfigError(`پلن ناشناخته: ${u.plan}`);
    const plan = normalizePlan(upper) as PlanName;
    const def = findInputLimitDef(u.key);
    if (!def) throw new LimitConfigError(`محدودیت ناشناخته: ${u.key}`);

    const value = coerceValue(def, u.value);
    const key = `plan.limit.${plan}.${def.key}`;

    if (value === null) {
      await deleteSetting(key);
      await retireLegacyLimit(plan, def);
    } else {
      await updateSetting(key, value, {
        group: "plans",
        type: def.kind === "count" ? "number" : "boolean",
        description: `${def.label} — پلن ${PLAN_LABELS[plan]}`,
        isSecret: false,
      });
    }
    saved.push({ plan, key: def.key as string, value });
  }

  await logAudit({
    actorId: actor.id,
    actorPhone: actor.phone,
    action: "update_plan_limits",
    entityType: "Setting",
    after: saved,
  });

  return { saved: saved.length, matrix: await getLimitsMatrix() };
}

/**
 * «بازگشت به پیش‌فرض» در نسخه‌های قبلی یک کلید عمومی داشت (`plan.limit.<key>`) که
 * روی هر ۴ پلن اثر می‌ گذاشت. با حذف آن، رفتار بقیهٔ پلن‌ها نباید عوض شود؛ پس
 * مقدار قدیمی ابتدا به کلید اختصاصی همان پلن‌ها (که هنوز دست‌ی نشده‌اند) منتقل و
 * بعد کلید عمومی حذف می‌شود.
 */
async function retireLegacyLimit(plan: PlanName, def: LimitDef) {
  const legacyKey = `plan.limit.${def.key}`;
  const legacy = await prisma.setting.findUnique({ where: { key: legacyKey }, select: { value: true } });
  if (!legacy?.value) return;

  for (const other of PLAN_ORDER) {
    if (other === plan) continue;
    const scopedKey = `plan.limit.${other}.${def.key}`;
    const exists = await prisma.setting.findUnique({ where: { key: scopedKey }, select: { id: true } });
    if (exists) continue;
    await updateSetting(scopedKey, legacy.value, {
      group: "plans",
      type: def.kind === "count" ? "number" : "boolean",
      description: `${def.label} — پلن ${PLAN_LABELS[other]} (منتقل‌شده از تنظیم قدیمی)`,
      isSecret: false,
    });
  }
  await deleteSetting(legacyKey);
}

/** فهرست محدودیت‌ها برای فرم (با سقف ورودی محاسبه‌شده) */
export function limitDefs() {
  return INPUT_LIMIT_DEFS;
}
/** نام‌های پلن برای سرستون‌ها */
export function planColumns(): { id: PlanName; label: string }[] {
  return PLAN_ORDER.map((id) => ({ id, label: PLAN_LABELS[id] }));
}
