import { z } from "zod";
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

const schema = z.object({ note: z.string().min(1).max(2000) });
const MAX_NOTES = 5;

async function isCustomerOfSalon(salonId: string, customerId: string) {
  const customer = await prisma.salonCustomer.findUnique({ where: { id: customerId }, select: { salonId: true } });
  return Boolean(customer && customer.salonId === salonId);
}

export async function GET(_req: Request, { params }: { params: { id: string; customerId: string } | Promise<{ id: string; customerId: string }> }) {
  try {
    const { id, customerId } = await params;
    await requireSalonManage(id);
    if (!(await isCustomerOfSalon(id, customerId))) return json({ success: false, error: "customer not found" }, { status: 404 });
    const notes = await prisma.salonCustomerNote.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } });
    return json({ success: true, notes, limit: MAX_NOTES });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request, { params }: { params: { id: string; customerId: string } | Promise<{ id: string; customerId: string }> }) {
  try {
    const { id, customerId } = await params;
    const user = await requireSalonManage(id);
    if (!(await isCustomerOfSalon(id, customerId))) return json({ success: false, error: "customer not found" }, { status: 404 });
    const body = schema.parse(await req.json());
    const count = await prisma.salonCustomerNote.count({ where: { customerId } });
    if (count >= MAX_NOTES) {
      return json(
        { success: false, error: `حداکثر ${MAX_NOTES} یادداشت برای هر مشتری مجاز است. ابتدا یکی را حذف کنید.` },
        { status: 400 },
      );
    }
    const note = await prisma.salonCustomerNote.create({ data: { customerId, note: body.note, authorId: user.id } });
    return json({ success: true, note }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
