// خودکار: پورت‌شده از src/app/api/ai/generate-content/route.ts — بدون تغییر منطق


import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { generateContent } from "@/lib/ai/content";
import { json, apiError } from "@/lib/utils";

const schema = z.object({
  salonId: z.string(),
  type: z.enum(["service_description", "staff_bio", "promo"]),
  targetId: z.string(),
});

export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireRole(["SALON_OWNER", "ADMIN"]);
    const body = schema.parse(await req.json());

    const salon = await prisma.salon.findUnique({ where: { id: body.salonId } });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });
    if (user.role !== "ADMIN" && salon.ownerId !== user.id) {
      return json({ success: false, error: "دسترسی غیرمجاز" }, { status: 403 });
    }

    const { text, usedAI } = await generateContent({ type: body.type, salonId: body.salonId, targetId: body.targetId });
    return json({ success: true, text, usedAI });
  } catch (err) {
    return apiError(err);
  }
}

