/**
 * کارت سالن در فهرست‌های مینی‌اپ (خانه، نتایج جست‌وجو، ویژه‌ها).
 */
import type { MiniSalon } from "../lib/types";
import { initials } from "../lib/format";
import { StarIcon } from "./ui";

function Cover({ salon }: { salon: MiniSalon }) {
  const img = salon.logoUrl || salon.bannerUrl;
  return (
    <div
      className="mini-salon-cover"
      style={salon.coverColor && !img ? { background: `linear-gradient(140deg, ${salon.coverColor}, rgba(var(--m-rgb), 0.5))` } : undefined}
    >
      {img ? <img src={img} alt="" loading="lazy" /> : initials(salon.name)}
    </div>
  );
}

export default function SalonCard({ salon, onClick }: { salon: MiniSalon; onClick: () => void }) {
  const rating = salon.rating == null ? null : Number(salon.rating);
  const meta = [salon.city, salon.address].filter(Boolean).join(" · ");
  return (
    <button type="button" className="mini-salon" onClick={onClick}>
      <Cover salon={salon} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="mini-salon-name">{salon.name}</div>
        <div className="mini-salon-meta">{meta || "—"}</div>
        <div style={{ marginTop: 4 }}>
          {rating != null ? (
            <span className="mini-rate">
              <StarIcon />
              {new Intl.NumberFormat("fa-IR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(rating)}
              <span style={{ color: "var(--m-muted)", fontWeight: 700 }}>({new Intl.NumberFormat("fa-IR").format(salon.reviewCount)} نظر)</span>
            </span>
          ) : (
            <span className="mini-salon-meta">هنوز نظری ثبت نشده</span>
          )}
        </div>
      </div>
      <span style={{ color: "var(--m-muted)", fontSize: 18 }} aria-hidden="true">
        ‹
      </span>
    </button>
  );
}
