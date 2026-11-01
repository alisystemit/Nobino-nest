/**
 * یک‌باره: کپی صفحات pure-client از src/app به frontend/src/pages با بدل‌های:
 *  - next/link و next/navigation → shim محلی "@/next"
 *  - حذف `export const instant/metadata/revalidate...` و importهای next منقرض‌شده
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const OUT = join(ROOT, "frontend", "src", "pages");
mkdirSync(OUT, { recursive: true });

const MAP = {
  "src/app/packages/page.tsx": "PackagesPage.tsx",
  "src/app/salons/page.tsx": "SalonsPage.tsx",
  "src/app/login/page.tsx": "LoginPage.tsx",
  "src/app/help/page.tsx": "HelpPage.tsx",
  "src/app/offline/page.tsx": "OfflinePage.tsx",
  "src/app/wa/page.tsx": "WaPage.tsx",
  "src/app/dashboard/wallet/page.tsx": "DashboardWallet.tsx",
  "src/app/dashboard/commission/page.tsx": "DashboardCommission.tsx",
  "src/app/pay/[token]/PayCard.tsx": "PayCard.tsx",
};

for (const [src, dest] of Object.entries(MAP)) {
  let t = readFileSync(join(ROOT, src), "utf8");
  // imports from next
  t = t.replace(/import Link from "next\/link";?\n/g, 'import { Link } from "@/next";\n');
  t = t.replace(/import\s+\{([^}]+)\}\s+from\s+"next\/navigation";?\n/g, 'import {$1} from "@/next";\n');
  t = t.replace(/import type \{ Metadata \} from "next";?\n/g, "");
  // حذف exportهای سمت سرور
  t = t.replace(/^export const (instant|dynamic|revalidate|fetchCache|runtime|dynamicParams)\b.*\n/gm, "");
  // ابتدا حالت یک‌خطی، سپس چندخطی (بستن روی خطِ مستقل «};» تا کد بعدی خورده نشود)
  t = t.replace(/^export const metadata(:[^=\n]+)? = \{[^\n]*\};\n/gm, "");
  t = t.replace(/^export const metadata(:[^=\n]+)? = \{[\s\S]*?\n\};\n/gm, "");
  // ارجاع به ./PayCard در همان پوشه
  t = t.replace(/from "\.\/PayCard"/g, 'from "./PayCard"');
  writeFileSync(join(OUT, dest), t.trimEnd() + "\n", "utf8");
  console.log("ported", src, "→", dest);
}
