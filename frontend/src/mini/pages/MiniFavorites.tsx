/**
 * «علاقه‌مندی‌های من» — فهرست سالن‌هایی که کاربر خودش اضافه کرده است.
 *
 * راه‌های افزودن: اسکن کیو‌آر/باز کردن لینک سالن (خودکار در صفحهٔ خانه)، یا
 * چسباندن لینک/اسلگ سالن در این صفحه. همه از همین سه endpoint سایت می‌گذرند:
 *   GET /api/salons/:slug (برای گرفتن شناسهٔ سالن) · POST/DELETE /api/favorites/:salonId
 * هیچ سالن پیشنهادی یا نمونه‌ای در این فهرست نمی‌آید.
 */
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FavoriteRow } from "../components/favorites";
import LoginSheet from "../components/login-sheet";
import { Button, EmptyState, Icon, SectionTitle, SkeletonList } from "../components/ui";
import { faDigits } from "../lib/format";
import { MAX_FAVORITES, useFavorites, type FavoriteSalon } from "../lib/favorites";
import { mapi, useMini } from "../lib/store";
import type { MiniSalonDetail } from "../lib/types";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

/**
 * از هر چیزی کاربر می‌چسباند اسلگ در بیاور:
 *   https://mah.example.com/  ·  https://site/s/mah  ·  mah  ·  @mah
 */
export function slugFromAnything(raw: string): string {
  const value = raw.trim().toLowerCase().replace(/^@+/, "");
  if (!value) return "";
  if (SLUG_RE.test(value)) return value;
  let url: URL | null = null;
  try {
    url = new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    url = null;
  }
  if (!url) return "";
  const fromPath = url.pathname.split("/").filter(Boolean).find((p) => SLUG_RE.test(p));
  if (fromPath) return fromPath;
  const host = url.hostname.split(".");
  if (host.length > 2 && SLUG_RE.test(host[0])) return host[0];
  return "";
}

export default function MiniFavorites() {
  const navigate = useNavigate();
  const { me, authReady, toast } = useMini();
  const favorites = useFavorites(me?.id ?? null);
  const [removing, setRemoving] = useState("");
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);

  const addBySlug = useCallback(
    async (slug: string) => {
      setAdding(true);
      const res = await mapi<{ success: boolean; error?: string; salon?: MiniSalonDetail }>(`/api/salons/${encodeURIComponent(slug)}`);
      const s = res.ok ? res.data?.salon : undefined;
      if (!s?.id) {
        setAdding(false);
        toast(res.data?.error || "سالنی با این نشانی پیدا نشد؛ لینک یا اسلگ را بررسی کنید", "error");
        return;
      }
      const item: FavoriteSalon = { id: s.id, slug: s.slug, name: s.name, city: s.city, coverColor: s.coverColor, bannerUrl: s.bannerUrl };
      const ok = await favorites.add(item);
      setAdding(false);
      if (!ok) {
        toast(favorites.list.length >= MAX_FAVORITES ? `بیش از ${faDigits(String(MAX_FAVORITES))} سالن نمی‌شود داشت` : "افزودن ممکن نشد؛ دوباره تلاش کنید", "error");
        return;
      }
      setInput("");
      toast(`${s.name} به علاقه‌مندی‌ها اضافه شد`, "ok");
    },
    [favorites, toast]
  );

  async function removeOne(id: string) {
    setRemoving(id);
    const ok = await favorites.remove(id);
    setRemoving("");
    toast(ok ? "از علاقه‌مندی‌ها حذف شد" : "حذف ممکن نشد؛ دوباره تلاش کنید", ok ? "ok" : "error");
  }

  // ورود که انجام شد، اسکن‌های قبلی خودکار به همین فهرست می‌آیند (در useFavorites انجام می‌شود)

  if (authReady && !me) {
    return (
      <div className="mini-fade">
        <EmptyState text="علاقه‌مندی‌ها برای حساب شماست." hint="وارد شوید تا سالن‌هایی که اسکن کرده‌اید اینجا بماند." />
        <Button onClick={() => setLoginOpen(true)}>
          <Icon name="user" size={18} />
          ورود / ساخت حساب
        </Button>
        <LoginSheet open={loginOpen} onClose={() => setLoginOpen(false)} reason="بعد از ورود، سالن‌های اسکن‌شده به علاقه‌مندی‌های شما اضافه می‌شوند." />
      </div>
    );
  }

  return (
    <div className="mini-fade">
      <SectionTitle
        title="علاقه‌مندی‌های من"
        hint={favorites.loading ? "" : favorites.list.length ? `${faDigits(String(favorites.list.length))} سالن` : "خالی است"}
      />

      {favorites.loading ? (
        <SkeletonList count={2} />
      ) : favorites.list.length ? (
        <div className="mini-card" style={{ padding: 6 }}>
          {favorites.list.map((f) => (
            <FavoriteRow
              key={f.id}
              salon={f}
              busy={removing === f.id}
              onOpen={() => navigate(`/mini/s/${f.slug}`)}
              onRemove={() => void removeOne(f.id)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          text="هنوز سالنی اضافه نکرده‌اید"
          hint="کیو‌آر سالن را اسکن کنید یا لینک آن را در کادر پایین بچسبانید؛ سالن‌های اسکن‌شده بدون ورود هم یادداشت می‌شوند و بعد از ورود به این فهرست می‌آیند."
        />
      )}

      {/* ── افزودن با لینک/اسلگ (برای وقتی که دوربین در دسترس نیست) ──── */}
      <div className="mini-card" style={{ marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 8 }}>افزودن سالن با لینک</div>
        <div className="mini-slug-row">
          <input
            className="mini-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="mah-salon یا https://…/s/mah"
            dir="ltr"
            inputMode="url"
            aria-label="لینک یا اسلگ سالن"
          />
          <button
            type="button"
            className="mini-btn tiny"
            disabled={adding || !input.trim() || favorites.list.length >= MAX_FAVORITES}
            onClick={() => {
              const slug = slugFromAnything(input);
              if (!slug) {
                toast("لینک یا اسلگ درست نیست", "error");
                return;
              }
              void addBySlug(slug);
            }}
          >
            {adding ? "…" : "افزودن"}
          </button>
        </div>
        <div className="mini-note" style={{ marginTop: 8 }}>
          ساده‌ترین راه: کیو‌آرِ روی کارت سالن را اسکن کنید — سالن خودش به این فهرست می‌آید.
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <Button variant="ghost" onClick={() => navigate("/mini")}>
          <Icon name="home" size={17} />
          بازگشت به خانه
        </Button>
      </div>
    </div>
  );
}
