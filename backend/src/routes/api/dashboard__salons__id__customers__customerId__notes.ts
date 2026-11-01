// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/customers/[customerId]/notes/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

const schema = z.object({ note: z.string().min(1).max(2000) });

export async function GET(_req: Request, { params }: { params: { id: string; customerId: string } | Promise<{ id: string; customerId: string }> }) {
  try {
    const { id, customerId } = await params;
    await requireSalonManage(id);
    const customer = await prisma.salonCustomer.findUnique({ where: { id: customerId }, select: { salonId: true } });
    if (!customer || customer.salonId !== id) return json({ success: false, error: "customer not found" }, { status: 404 });
    const notes = await prisma.salonCustomerNote.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } });
    return json({ success: true, notes });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request, { params }: { params: { id: string; customerId: string } | Promise<{ id: string; customerId: string }> }) {
  try {
    const { id, customerId } = await params;
    await requireSalonManage(id);
    const customer = await prisma.salonCustomer.findUnique({ where: { id: customerId }, select: { salonId: true } });
    if (!customer || customer.salonId !== id) return json({ success: false, error: "customer not found" }, { status: 404 });
    const body = schema.parse(await req.json());
    const note = await prisma.salonCustomerNote.create({ data: { customerId, note: body.note } });
    return json({ success: true, note }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}