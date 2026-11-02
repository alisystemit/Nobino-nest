import { toPersianDigits } from "@/lib/utils";

type PaginationProps = {
  page: number;
  totalPages: number;
  total?: number;
  onChange: (page: number) => void;
};

const btnBase =
  "h-9 min-w-9 rounded-lg px-3 text-sm font-bold transition disabled:opacity-40 disabled:cursor-not-allowed";
const btnIdle =
  "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700";
const btnActive = "bg-[#1c2434] text-white";

export default function Pagination({ page, totalPages, total, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <nav aria-label="صفحه‌بندی فهرست" className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
      <button
        type="button"
        aria-label="صفحهٔ قبلی"
        className={`${btnBase} ${btnIdle}`}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        قبلی
      </button>

      {pages[0] > 1 && <span aria-hidden="true" className="px-1 text-neutral-400">…</span>}
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          aria-label={`صفحهٔ ${p}`}
          aria-current={p === page ? "page" : undefined}
          className={`${btnBase} ${p === page ? btnActive : btnIdle}`}
          onClick={() => onChange(p)}
        >
          {toPersianDigits(p)}
        </button>
      ))}
      {pages[pages.length - 1] < totalPages && <span aria-hidden="true" className="px-1 text-neutral-400">…</span>}

      <button
        type="button"
        aria-label="صفحهٔ بعدی"
        className={`${btnBase} ${btnIdle}`}
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        بعدی
      </button>

      {typeof total === "number" && (
        <span className="mr-2 text-xs text-neutral-400">کل: {toPersianDigits(total)}</span>
      )}
    </nav>
  );
}
