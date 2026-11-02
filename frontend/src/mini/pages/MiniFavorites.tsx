/**
 * «علاقه‌مندی‌های من» — فهرست سالن‌هایی که کاربر خودش اضافه کرده است.
 *
 * راه‌های افزودن: اسکن کیو‌آر با دوربین داخل وب‌اپ (دکمهٔ «باز کردن دوربین»،
 * متن کیو‌آر محلاً با پردازش تصویر خوانده می‌شود)، باز کردن لینک سالن از
 * بیرون (خودکار در صفحهٔ خانه)، یا چسباندن لینک/اسلگ سالن در این صفحه.
 * همه از همین سه endpoint سایت می‌گذرند:
 *   GET /api/salons/:slug (برای گرفتن شناسهٔ سالن) · POST/DELETE /api/favorites/:salonId
 * هیچ سالن پیشنهادی یا نمونه‌ای در این فهرست نمی‌آید.
 */
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FavoriteRow } from "../components/favorites";
import LoginSheet from "../components/login-sheet";
import QrScanner, { cameraScanSupported } from "../components/qr-scanner";
import { Button, EmptyState, Icon, SectionTitle, SkeletonList } from "../components/ui";
import { faDigits } from "../lib/format";
import { MAX_FAVORITES, slugFromAnything, useFavorites, type FavoriteSalon } from "../lib/favorites";
import { mapi, useMini } from "../lib/store";
import type { MiniSalonDetail } from "../lib/types";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

/**
 * خروجی اسکنر دوربین: اگر لینک کامل سالن باشد خودش قابل خواندن است؛ اگر
 * دوربین رو به یک متن ساده (مثلاً اسلگ) گرفته باشد، همان متن را می‌فرستیم.
 */
export function scanTextToInput(value: string): string {
  const text = value.trim();
  if (/^(https?:\/\/|www\.)|\/s\//i.test(text) || text.includes(".")) return text;
  return SLUG_RE.test(text.toLowerCase()) ? text : "";
}

export default function MiniFavorites() {
  const navigate = useNavigate();
  const { me, authReady, toast } = useMini();
  const favorites = useFavorites(me?.id ?? null);
  const [removing, setRemoving] = useState("");
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

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

  /** کیو‌آر اسکن شد: لینک در کادر می‌نشیند و افزودن خودش اجرا می‌شود */
  const onScanned = useCallback(
    (text: string) => {
      const value = scanTextToInput(text);
      setScannerOpen(false);
      if (!value) {
        toast("متن اسکن‌شده لینک یا اسلگ سالن نبود", "error");
        return;
      }
      setInput(value);
      const slug = slugFromAnything(value);
      if (!slug) {
        toast("این کیو‌آر به سالنی وصل نیست؛ لینک را در کادر بچسبانید", "error");
        return;
      }
      void addBySlug(slug);
    },
    [addBySlug, toast]
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

      {/* ── افزودن با دوربین / لینک / اسلگ ───────────────────────────── */}
      <div className="mini-card" style={{ marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 8 }}>افزودن سالن با لینک</div>
        {cameraScanSupported() ? (
          <button type="button" className="mini-btn soft mini-scan-btn" onClick={() => setScannerOpen(true)}>
            <Icon name="camera" size={18} />
            باز کردن دوربین و اسکن کیو‌آر
          </button>
        ) : null}
        <div className="mini-slug-row" style={{ marginTop: cameraScanSupported() ? 10 : 0 }}>
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
          {cameraScanSupported()
            ? "سریع‌ترین راه: دکمهٔ بالا را بزنید و کیو‌آرِ روی کارت سالن را جلوی دوربین بگیرید — لینک خودش در کادر می‌نشیند و سالن اضافه می‌شود."
            : "سریع‌ترین راه: کیو‌آرِ روی کارت سالن را با دوربین گوشی اسکن کنید؛ لینک باز می‌شود و سالن خودش به این فهرست می‌آید."}
        </div>
      </div>

      {scannerOpen ? <QrScanner onResult={onScanned} onClose={() => setScannerOpen(false)} /> : null}

      <div style={{ marginTop: 14 }}>
        <Button variant="ghost" onClick={() => navigate("/mini")}>
          <Icon name="home" size={17} />
          بازگشت به خانه
        </Button>
      </div>
    </div>
  );
}
