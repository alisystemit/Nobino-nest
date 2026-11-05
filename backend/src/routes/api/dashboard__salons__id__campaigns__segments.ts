// سازندهٔ مسیر: گزینه‌های بخش‌بندی کمپین (تگ‌ها، دسته‌ها، آرایشگران و شمار هر preset)
import { requireSalonManage } from "@/lib/auth/guards";
import { segmentOptions } from "@/lib/marketing/segments";
import { json, apiError } from "@/lib/utils";

/** فرم کمپین قبل از نوشتن هر چیزی این را می‌خواند تا چیپ‌ها دادهٔ واقعی همان سالن را نشان دهند */
export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    return json({ success: true, ...(await segmentOptions(id)) });
  } catch (err) {
    return apiError(err);
  }
}
