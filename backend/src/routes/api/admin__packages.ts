// خودکار: پورت‌شده از src/app/api/admin/packages/route.ts — بدون تغییر منطق


import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { createPackage, deletePackage, listPackagesForAdmin, updatePackage } from "@/lib/plans/packages";
import { json, apiError } from "@/lib/utils";

/** ماژول پکیج: یا کلید کاتالوگ (اختیاری: سقف عددی) یا متن دلخواه */
const featureSchema = z.union([
  z.string().min(1).max(120),
  z.object({
    key: z.string().min(1).max(60),
    value: z.number().int().min(0).max(100000).nullish(),
  }),
]);

export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    return json({ success: true, packages: await listPackagesForAdmin() });
  } catch (err) {
    return apiError(err);
  }
}

const patchSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(80).optional(),
  plan: z.string().optional(),
  price: z.number().int().min(0).optional(),
  yearlyPrice: z.number().int().min(0).nullable().optional(),
  durationDays: z.number().int().positive().optional(),
  features: z.array(featureSchema).optional(),
  isActive: z.boolean().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(80),
  plan: z.string().default("BASIC"),
  price: z.number().int().min(0),
  yearlyPrice: z.number().int().min(0).nullable().optional(),
  durationDays: z.number().int().positive().default(30),
  features: z.array(featureSchema).default([]),
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
