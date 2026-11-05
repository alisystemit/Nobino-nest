// خودکار: پورت‌شده از src/app/api/admin/packages/route.ts — بدون تغییر منطق


import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { createPackage, deletePackage, listPackagesForAdmin, updatePackage } from "@/lib/plans/packages";
import { PLAN_ORDER } from "@/lib/plans/limits";
import { json, apiError, enumQueryParam, assertKnownQueryParams } from "@/lib/utils";

/** ماژول پکیج: یا کلید کاتالوگ (اختیاری: سقف عددی) یا متن دلخواه */
const featureSchema = z.union([
  z.string().min(1).max(120),
  z.object({
    key: z.string().min(1).max(60),
    value: z.number().int().min(0).max(100000).nullish(),
  }),
]);

/**
 * پلن باید از فهرست پلن‌ها باشد.
 * شکل ورودی این‌جا و قاعدهٔ تجاری (قیمت صفر برای پلن پولی، نسبت سالانه/ماهانه) در
 * `lib/plans/packages.ts` چک می‌شود؛ دلیلش این است که `normalizePlan()` هر رشتهٔ
 * ناشناخته‌ای را بی‌صدا «FREE» می‌کند و ردیف ناسازگارِ قدیمی نباید با یک
 * «خاموش/روشن‌کردن» ساده ویرایش‌ناپذیر شود (یافتهٔ A21).
 */
const planSchema = z
  .string()
  .trim()
  .refine((v) => (PLAN_ORDER as string[]).includes(v.toUpperCase()), {
    message: `پلن انتخابی معتبر نیست. مجاز: ${PLAN_ORDER.join("، ")}`,
  })
  .transform((v) => v.toUpperCase());

/** سقف منطقی قیمت (تومان) — از عدد تایپی اشتباه و «پکیج رایگانِ پولی» جلوگیری می‌کند */
const PRICE_MAX = 100_000_000;

const priceSchema = z.number().int({ message: "قیمت باید عدد صحیح باشد" });

export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    // فیلتر برنامه‌ریزی‌شدهٔ پنل؛ پارامتر یا مقدار ناشناخته باید 400 بگیرد نه «همهٔ پکیج‌ها»
    assertKnownQueryParams(req.url, ["plan"]);
    const plan = enumQueryParam(req.url, "plan", PLAN_ORDER as unknown as string[], { label: "پلن" });
    return json({ success: true, packages: await listPackagesForAdmin(plan ? { plan } : undefined) });
  } catch (err) {
    return apiError(err);
  }
}

const patchSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(80).optional(),
  plan: planSchema.optional(),
  price: priceSchema.min(0).max(PRICE_MAX).optional(),
  yearlyPrice: priceSchema.min(0).max(PRICE_MAX).nullable().optional(),
  durationDays: z.number().int().min(1).max(3650).optional(),
  features: z.array(featureSchema).max(60).optional(),
  isActive: z.boolean().optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  plan: planSchema.default("BASIC"),
  price: priceSchema.min(0).max(PRICE_MAX),
  yearlyPrice: priceSchema.min(0).max(PRICE_MAX).nullable().optional(),
  durationDays: z.number().int().min(1).max(3650).default(30),
  features: z.array(featureSchema).max(60).default([]),
  isActive: z.boolean().default(true),
});

export async function PATCH(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireRole(["ADMIN"]);
    const { id, ...data } = patchSchema.parse(await req.json());

    const updated = await updatePackage(id, data, { id: user.id, phone: user.phone });
    if (!updated) return json({ success: false, error: "پکیج یافت نشد" }, { status: 404 });

    return json({ success: true, package: updated });
  } catch (err) {
    return apiError(err);
  }
}

/** ساخت پکیج جدید توسط سوپرادمین */
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireRole(["ADMIN"]);
    const body = createSchema.parse(await req.json());
    const pkg = await createPackage(body, { id: user.id, phone: user.phone });
    return json({ success: true, package: pkg }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}

/**
 * حذف یا غیرفعال‌سازی پکیج.
 * `?id=…` حذف امن: اگر اشتراک/سفارش وصل باشد فقط غیرفعال می‌شود.
 * `?id=…&force=1` حذف قطعی با پاک‌کردن اشتراک/سفارش تسویه‌نشده (اگر سفارش
 * پرداخت‌شده داشته باشد با 409 رد می‌شود).
 */
export async function DELETE(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireRole(["ADMIN"]);
    const params = new URL(req.url).searchParams;
    const id = params.get("id");
    if (!id) return json({ success: false, error: "شناسه پکیج الزامی است" }, { status: 400 });
    const force = params.get("force") === "1";

    const result = await deletePackage(id, { id: user.id, phone: user.phone }, { force });
    if (!result.ok) return json({ success: false, error: result.error }, { status: result.status });

    return json({ success: true, ...result });
  } catch (err) {
    return apiError(err);
  }
}
