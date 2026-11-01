// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/domain/verify/route.ts — بدون تغییر منطق
import { resolveTxt } from "node:dns/promises";
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

/** تأیید مالکیت دامنه از طریق رکورد TXT */
export async function POST(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);

    const salon = await prisma.salon.findUnique({ where: { id }, select: { customDomain: true, domainToken: true } });
    if (!salon) return json({ success: false, error: "salon not found" }, { status: 404 });
    if (!salon.customDomain || !salon.domainToken) {
      return json({ success: false, error: "domain config not initialized" }, { status: 400 });
    }

    const expected = `nobino-verify=${salon.domainToken}`;
    let records: string[][] = [];
    try {
      records = await resolveTxt(salon.customDomain);
    } catch (e) {
      return json({ success: false, error: e instanceof Error ? e.message : "dns lookup failed" }, { status: 400 });
    }

    const found = records.some((r) => r.join("").trim() === expected);
    if (!found) return json({ success: false, error: "txt record not found" }, { status: 400 });

    const updated = await prisma.salon.update({
      where: { id },
      data: { domainStatus: "VERIFIED" },
    });

    return json({ success: true, salon: updated });
  } catch (err) {
    return apiError(err);
  }
}