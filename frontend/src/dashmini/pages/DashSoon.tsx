/**
 * صفحهٔ جایگزین بخش‌هایی که هنوز به سبک مینی‌اپ بازنویسی نشده‌اند — همان بخش را
 * با پوستهٔ وب باز می‌کند تا در طول بازنویسی مرحله‌ای، قابلیتی از دست نرود.
 */
import { useLocation } from "react-router-dom";
import { SectionTitle } from "@/mini/components/ui";
import { SoonCard } from "../lib/parts";
import { findSection } from "../lib/sections";

export default function DashSoon() {
  const location = useLocation();
  const section = findSection(location.pathname.replace(/^\/dash/, "")) ?? {
    label: "این بخش",
    classic: "/dashboard",
  };

  return (
    <div className="mini-fade">
      <SectionTitle title={section.label} hint="نسخهٔ وب" />
      <SoonCard title={section.label} classicHref={section.classic} />
    </div>
  );
}
