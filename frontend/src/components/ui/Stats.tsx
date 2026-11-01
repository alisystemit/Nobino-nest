import Link from "@/router-shim";
import type { ReactNode } from "react";

/**
 * کارت آمار به سبک TailAdmin (CardDataStats):
 * آیکون داخل دایره رنگی، برچسب کوچک، عدد بزرگ و روند تغییر (سبز/قرمز).
 */
export function StatCard({
  label,
  value,
  icon,
  iconClass,
  trend,
  trendUp,
  sub,
  href,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  iconClass?: string;
  trend?: string;
  trendUp?: boolean;
  sub?: string;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold text-neutral-500 sm:text-xs dark:text-neutral-400">{label}</div>
          <div className="mt-1.5 break-words text-lg font-black leading-tight text-neutral-900 sm:text-2xl dark:text-white">{value}</div>
          {sub && <div className="mt-1 truncate text-[11px] text-neutral-400">{sub}</div>}
          {trend && (
            <div className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${trendUp ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400"}`}>
              {trendUp ? "↑" : "↓"} {trend}
            </div>
          )}
        </div>
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-11 sm:w-11 ${
            iconClass ?? "bg-pink-100 text-pink-600 dark:bg-pink-900/40 dark:text-pink-300"
          }`}
        >
          {icon}
        </span>
      </div>
    </>
  );

  const cls = "block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5 dark:border-neutral-800 dark:bg-neutral-900";
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** کارت سفید با هدر اختیاری — بدنه اصلی صفحات داشبورد */
export function PanelCard({
  title,
  subtitle,
  icon,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={`rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900 ${className ?? ""}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3.5 sm:px-5 sm:py-4 dark:border-neutral-800">
          <div className="flex min-w-0 items-center gap-3">
            {icon && (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600 sm:h-10 sm:w-10 dark:bg-neutral-800 dark:text-neutral-300">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="text-[15px] font-extrabold text-neutral-900 sm:text-base dark:text-neutral-100">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-[11px] leading-5 text-neutral-400 sm:text-xs">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      <div className={bodyClassName ?? "p-4 sm:p-5"}>{children}</div>
    </div>
  );
}

const badgeTones = {
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  danger: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300",
  info: "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  neutral: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  brand: "bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
} as const;

/** نشان وضعیت کوچک (Badge) به سبک TailAdmin */
export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: keyof typeof badgeTones; className?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${badgeTones[tone]} ${className ?? ""}`}>{children}</span>;
}
