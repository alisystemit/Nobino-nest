/**
 * مانیفست اختصاصی PWA هر سالن — GET /api/pwa/manifest/[slug]
 * مشتری با نصب از صفحهٔ سالن، اپی جدا با نام و آدرس همان سالن می‌گیرد.
 */
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";
import { isSalonOwnHost, requestOrigin } from "@/lib/salon-url";
import { buildSalonManifest } from "@/lib/pwa/salon-manifest";

export async function GET(req: Request, { params }: { params: { slug: string } | Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const salon = await prisma.salon.findUnique({
      where: { slug },
      select: {
        slug: true,
        name: true,
        description: true,
        city: true,
        coverColor: true,
        isActive: true,
        customDomain: true,
        domainStatus: true,
      },
    });
    if (!salon || !salon.isActive) {
      return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });
    }

    const host = req.headers.get("host");
    const origin = requestOrigin(host, req.headers.get("x-forwarded-proto"));
    const mode = isSalonOwnHost(salon, host) ? "ownOrigin" : "path";
    const manifest = buildSalonManifest({
      slug: salon.slug,
      name: salon.name,
      description: salon.description,
      city: salon.city,
      coverColor: salon.coverColor,
      mode,
    });

    return json(manifest, {
      headers: {
        "Content-Type": "application/manifest+json; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        // اوریجین برای کلاینت (اختیاری) تا لینک نصب دقیق باشد
        "X-Salon-Origin": origin,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
