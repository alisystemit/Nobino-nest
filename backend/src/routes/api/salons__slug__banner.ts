/**
 * تولید و ارسال بنر SVG برای سالن
 * GET /api/salons/:slug/banner.svg
 */
import { prisma } from "@/lib/prisma";
import { generateSalonBanner } from "@/lib/banner-generator";
import { apiError } from "@/lib/utils";

export async function GET(_req: Request, { params }: { params: { slug: string } | Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    
    const salon = await prisma.salon.findUnique({
      where: { slug },
      select: { name: true, coverColor: true },
    });
    
    if (!salon) {
      return new Response("Salon not found", { status: 404 });
    }
    
    const svg = generateSalonBanner({
      name: salon.name,
      color: salon.coverColor ?? undefined,
    });
    
    return new Response(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400", // Cache for 1 day
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
