/**
 * صفحهٔ اول مینی‌اپ — معرفی برند، جست‌وجو، سالن‌های ویژه و فهرست سالن‌ها.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import SalonCard from "../components/salon-card";
import { EmptyState, Icon, SectionTitle, SkeletonList } from "../components/ui";
import { faDigits } from "../lib/format";
import { mapi, useMini } from "../lib/store";
import type { MiniSalon } from "../lib/types";

const PAGE_SIZE = 12;

export default function MiniHome() {
  const navigate = useNavigate();
  const { config, configReady, me, messengerName, platformLabel } = useMini();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [salons, setSalons] = useState<MiniSalon[]>([]);
  const [featured, setFeatured] = useState<MiniSalon[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const debounce = useRef<number | null>(null);

  useEffect(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => setDebounced(query.trim()), 350);
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [query]);

  const load = useCallback(
    async (targetPage: number, replace: boolean) => {
      if (replace) setLoading(true);
      else setLoadingMore(true);
      setError("");
      const url = `/api/salons/search?limit=${PAGE_SIZE}&page=${targetPage}${debounced ? `&q=${encodeURIComponent(debounced)}` : ""}`;
      const res = await mapi<{
        success: boolean;
        error?: string;
        total: number;
        salons: MiniSalon[];
      }>(url);
      if (!res.ok) setError(res.data?.error || "فهرست سالن‌ها بارگذاری نشد");
      const rows = Array.isArray(res.data?.salons) ? res.data.salons : [];
      setSalons((prev) => (replace ? rows : [...prev, ...rows]));
      setTotal(res.data?.total ?? rows.length);
      setPage(targetPage);
      setLoading(false);
      setLoadingMore(false);
    },
    [debounced]
  );

  useEffect(() => {
    if (!configReady) return;
    void load(1, true);
  }, [configReady, load]);

  useEffect(() => {
    if (!configReady || !config.features.showFeatured) return;
    void (async () => {
      const res = await mapi<{ salons: MiniSalon[] }>("/api/mini/featured");
      if (res.ok) setFeatured(res.data?.salons ?? []);
    })();
  }, [configReady, config.features.showFeatured]);

  const greeting = useMemo(() => {
    const name = me?.name || messengerName;
    if (name) return `سلام ${name} 👋`;
    return `سلام 👋 در ${platformLabel} هستید`;
  }, [me?.name, messengerName, platformLabel]);

  const heroText = config.brand.heroText || config.brand.subtitle;
  const hasMore = salons.length < total;

  return (
    <div className="mini-fade">
      <div className="mini-hero">
        <h1>{config.brand.title}</h1>
        <p>{heroText}</p>
        <p style={{ marginTop: 10, fontSize: 12.5, opacity: 0.9 }}>{greeting}</p>
      </div>

      <div className="mini-section-title" style={{ marginTop: 16 }}>
        <span>جست‌وجوی سالن</span>
      </div>
      <div className="mini-search">
        <Icon name="search" size={18} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="نام سالن، محله یا خدمت…"
          aria-label="جست‌وجوی سالن"
          enterKeyHint="search"
        />
        {query ? (
          <button type="button" className="mini-back" style={{ width: 28, height: 28 }} onClick={() => setQuery("")} aria-label="پاک کردن">
            <Icon name="close" size={14} />
          </button>
        ) : null}
      </div>

      {config.features.showFeatured && featured.length ? (
        <>
          <SectionTitle title="پیشنهاد ویژه" hint="انتخاب سوپرادمین" />
          <div className="mini-list">
            {featured.map((s) => (
              <SalonCard key={`f-${s.id}`} salon={s} onClick={() => navigate(`/mini/s/${s.slug}`)} />
            ))}
          </div>
        </>
      ) : null}

      <SectionTitle
        title={debounced ? `نتیجهٔ «${debounced}»` : "همهٔ سالن‌ها"}
        hint={loading ? "" : `${faDigits(total)} سالن`}
        action={
          <span className="mini-chip" onClick={() => void load(1, true)} role="button" tabIndex={0}>
            <Icon name="refresh" size={14} />
          </span>
        }
      />

      {loading ? (
        <SkeletonList count={4} />
      ) : error ? (
        <div className="mini-note" style={{ color: "#b91c1c" }}>{error}</div>
      ) : salons.length === 0 ? (
        <EmptyState text="سالنی با این مشخصات پیدا نشد." hint="نام سالن یا محله را کوتاه‌تر بنویسید." />
      ) : (
        <>
          <div className="mini-list">
            {salons.map((s) => (
              <SalonCard key={s.id} salon={s} onClick={() => navigate(`/mini/s/${s.slug}`)} />
            ))}
          </div>
          {hasMore ? (
            <div style={{ marginTop: 12 }}>
              <button type="button" className="mini-btn soft" disabled={loadingMore} onClick={() => void load(page + 1, false)}>
                {loadingMore ? "در حال بارگذاری…" : `نمایش ${faDigits(Math.min(PAGE_SIZE, total - salons.length))} سالن دیگر`}
              </button>
            </div>
          ) : (
            <div className="mini-option-sub" style={{ textAlign: "center", marginTop: 14 }}>
              پایان فهرست · {faDigits(salons.length)} سالن
            </div>
          )}
        </>
      )}
    </div>
  );
}
