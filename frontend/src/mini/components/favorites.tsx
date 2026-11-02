/**
 * کارت‌های «علاقه‌مندی‌ها» — هم برای نوار افقی خانه و هم برای صفحهٔ کامل.
 * داده از ../lib/favorites.ts می‌آید (همان /api/favorites سایت).
 */
import type { CSSProperties } from "react";
import { Icon } from "./ui";
import type { FavoriteSalon } from "../lib/favorites";

function coverStyle(salon: FavoriteSalon): CSSProperties {
  return salon.coverColor ? { background: salon.coverColor, color: "#fff" } : {};
}

/** چیپ کوچک نوار افقی بالای خانه */
export function FavoriteChip({ salon, onOpen }: { salon: FavoriteSalon; onOpen: () => void }) {
  return (
    <button type="button" className="mini-fav-chip" onClick={onOpen}>
      <span className="mini-fav-chip-cover" style={coverStyle(salon)}>
        {salon.bannerUrl ? <img src={salon.bannerUrl} alt="" /> : salon.name.slice(0, 1)}
      </span>
      <span className="mini-fav-chip-name">{salon.name}</span>
      {salon.city ? <span className="mini-fav-chip-city">{salon.city}</span> : null}
    </button>
  );
}

/** نوار افقی علاقه‌مندی‌های دیگر (سالنِ خودِ صفحه حذف می‌شود) */
export function FavoritesStrip({ list, onOpen }: { list: FavoriteSalon[]; onOpen: (slug: string) => void }) {
  if (!list.length) return null;
  return (
    <div className="mini-scroll-x" style={{ marginTop: 10 }}>
      {list.map((s) => (
        <FavoriteChip key={s.id} salon={s} onOpen={() => onOpen(s.slug)} />
      ))}
    </div>
  );
}

/** ردیف کامل یک سالن در صفحهٔ «علاقه‌مندی‌های من» */
export function FavoriteRow({
  salon,
  onOpen,
  onRemove,
  busy,
}: {
  salon: FavoriteSalon;
  onOpen: () => void;
  onRemove: () => void;
  busy: boolean;
}) {
  return (
    <div className="mini-item">
      <button type="button" className="mini-item-main mini-fav-open" onClick={onOpen}>
        <span className="mini-item-title">{salon.name}</span>
        <span className="mini-item-sub">{salon.city || "—"}</span>
      </button>
      <span className="mini-item-side" style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button type="button" className="mini-btn tiny" onClick={onOpen} disabled={busy}>
          <Icon name="calendar" size={14} />
          رزرو
        </button>
        <button type="button" className="mini-icon-btn mini-fav-btn is-on" onClick={onRemove} disabled={busy} aria-label={`حذف ${salon.name} از علاقه‌مندی‌ها`} title="حذف از علاقه‌مندی‌ها">
          <Icon name="heart" size={16} />
        </button>
      </span>
    </div>
  );
}
