/**
 * پکیج‌ها — نسخهٔ مینی‌استایل از /packages برای داشبورد سالن
 *
 * داده از همان endpoint های وب:
 *   GET  /api/packages?page&limit=6      پکیج‌های فعال + total/totalPages (پیجینیشن سرور)
 *   GET  /api/payments/gateways          درگاه‌های آماده (علائم تست/سندباکس از سرور)
 *   POST /api/payments/create            {packageId, gateway, discountCode, period, autoRenew}
 *
 * رفتار خرید همان وب است: اگر سرور redirectUrl داد به درگاه می‌رویم؛ اگر سفارش رایگان
 * بود به /payment/result می‌رویم تا تأیید سمت سرور انجام شود.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Chip, EmptyState, Icon, SectionTitle, SkeletonList, Tabs } from "@/mini/components/ui";
import { faDigits, toman } from "@/mini/lib/format";
import { dapi } from "../lib/api";
import { Pager } from "../lib/parts";
import { useDash } from "../lib/store";

type Feature = { key: string | null; label: string; icon: string };
type Pkg = { id: string; name: string; description?: string; plan?: string; price: number; yearlyPrice?: number | null; durationDays: number; features: Feature[] };
type Gateway = { id: string; name: string; sandbox: boolean };
type Period = "MONTHLY" | "YEARLY";

const PAGE_SIZE = 6;

export default function DashPackages() {
  const navigate = useNavigate();
  const { me, toast } = useDash();
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [gateway, setGateway] = useState("");
  const [period, setPeriod] = useState<Period>("MONTHLY");
  const [discountCode, setDiscountCode] = useState("");
  const [autoRenew, setAutoRenew] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState("");
  const [err, setErr] = useState("");

  const isCustomer = me?.role === "CUSTOMER";

  const load = useCallback(async () => {
    setLoading(true);
    const [pkgRes, gwRes] = await Promise.all([
      dapi<{ success: boolean; error?: string; packages?: Pkg[]; total?: number; totalPages?: number }>(`/api/packages?page=${page}&limit=${PAGE_SIZE}`),
      dapi<{ success: boolean; error?: string; gateways?: Gateway[] }>("/api/payments/gateways"),
    ]);
    if (pkgRes.ok) {
      setPackages(pkgRes.data?.packages ?? []);
      setTotal(Number(pkgRes.data?.total ?? pkgRes.data?.packages?.length ?? 0));
      setTotalPages(Math.max(1, Number(pkgRes.data?.totalPages ?? 1)));
    } else {
      setErr(pkgRes.data?.error || "خطا در بارگیری پکیج‌ها");
    }
    if (gwRes.ok) {
      const list = gwRes.data?.gateways ?? [];
      setGateways(list);
      setGateway((cur) => cur || list[0]?.id || "");
    }
    setLoading(false);
  }, [page]);

  useEffect(() => {
    if (isCustomer) {
      navigate("/dash", { replace: true });
      return;
    }
    void load();
  }, [isCustomer, load, navigate]);

  const priceOf = (p: Pkg) => (period === "YEARLY" ? (p.yearlyPrice ?? p.price * 10) : p.price);

  async function buy(p: Pkg) {
    if (!gateway) {
      setErr("نخست یک درگاه پرداخت انتخاب کنید.");
      return;
    }
    setBuying(p.id);
    setErr("");
    const res = await dapi<{ success: boolean; error?: string; redirectUrl?: string; free?: boolean; orderId?: string }>("/api/payments/create", {
      method: "POST",
      body: JSON.stringify({
        packageId: p.id,
        gateway,
        discountCode: discountCode.trim() || undefined,
        period,
        autoRenew,
      }),
    });
    setBuying("");
    if (!res.ok) {
      const text = res.data?.error || "خطا در ایجاد پرداخت";
      setErr(text);
      toast(text, "error");
      return;
    }
    if (res.data?.redirectUrl) {
      window.location.assign(res.data.redirectUrl);
      return;
    }
    if (res.data?.free && res.data?.orderId) {
      navigate(`/payment/result?order=${encodeURIComponent(res.data.orderId)}`);
      return;
    }
    setErr("پاسخی از درگاه دریافت نشد. دوباره تلاش کنید.");
  }

  const best = useMemo(() => (page === 1 && packages.length > 1 ? 1 : -1), [page, packages.length]);

  return (
    <div className="mini-fade">
      <div className="dash-toolbar">
        <SectionTitle title="پکیج‌ها" hint="اشتراک سالن خود را انتخاب یا تمدید کنید" />
      </div>

      {err ? (
        <div className="mini-note dash-note-bad" style={{ marginTop: 12 }}>
          {err}
        </div>
      ) : null}

      <div className="mini-card dash-pane" style={{ marginTop: 12 }}>
        <div className="dash-tabs">
          <Tabs<Period>
            value={period}
            onChange={setPeriod}
            items={[
              { id: "MONTHLY", label: "ماهانه", icon: "calendar" },
              { id: "YEARLY", label: "سالانه", icon: "star" },
            ]}
          />
        </div>
        <div className="dash-tags" style={{ marginTop: 12 }}>
          <Chip on={autoRenew} onClick={() => setAutoRenew((v) => !v)}>
            تمدید خودکار {autoRenew ? "روشن" : "خاموش"}
          </Chip>
        </div>
        <div className="mini-field" style={{ marginTop: 12 }}>
          <label htmlFor="f-pkgDiscount">کد تخفیف (اختیاری)</label>
          <input
            id="f-pkgDiscount"
            className="mini-input is-ltr"
            dir="ltr"
            placeholder="مثلاً NOBINO20"
            value={discountCode}
            onChange={(e) => setDiscountCode(e.target.value)}
          />
        </div>
        {gateways.length ? (
          <div className="mini-field" style={{ marginTop: 10 }}>
            <label htmlFor="f-pkgGateway">درگاه پرداخت</label>
            <select id="f-pkgGateway" className="mini-input" value={gateway} onChange={(e) => setGateway(e.target.value)}>
              {gateways.map((g) => (
                <option key={g.id} value={g.id}>
                  {/* نام درگاه‌ها گاه خودش «(تست)» دارد؛ برچسب سندباکس را دو بار نمی‌نویسیم */}
                  {g.name}
                  {g.sandbox && !g.name.includes("تست") ? " (تست)" : ""}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="mini-note" style={{ marginTop: 12 }}>
            هنوز درگاه پرداختی فعال نیست. از سوپرادمین بخواهید یک درگاه را روشن کند.
          </div>
        )}
        {period === "YEARLY" ? (
          <div className="mini-option-sub" style={{ marginTop: 10 }}>
            سالانه معادل ۱۰ ماه پرداخت می‌شود و دو ماه مهمان هستید.
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="dash-pane">
          <SkeletonList count={3} />
        </div>
      ) : packages.length === 0 ? (
        <div className="mini-card dash-pane">
          <EmptyState text="پکیج فعالی تعریف نشده است." hint="تا وقتی سوپرادمین پکیجی نسازد، همین صفحه خالی می‌ماند." />
        </div>
      ) : (
        <div className="dash-pkgs">
          {packages.map((p, idx) => (
            <div key={p.id} className={`dash-pkg mini-card${idx === best ? " is-best" : ""}`}>
              <div className="dash-pkg-head">
                <span className="dash-pkg-name">{p.name}</span>
                {idx === best ? <span className="dash-tag">پیشنهاد ویژه</span> : null}
              </div>
              {p.description ? <div className="mini-option-sub">{p.description}</div> : null}
              <div className="dash-pkg-price">
                {toman(priceOf(p))}
                <small>{period === "YEARLY" ? "برای یک سال" : `هر ${faDigits(p.durationDays || 30)} روز`}</small>
              </div>
              <div className="dash-pkg-feats">
                {(p.features ?? []).map((f, i) => (
                  <div key={f.key ?? `f-${i}`} className="dash-feat">
                    <span className="dash-feat-icon" aria-hidden="true">
                      {f.icon || "✓"}
                    </span>
                    <span>{f.label}</span>
                  </div>
                ))}
              </div>
              <Button variant={idx === best ? "primary" : "soft"} loading={buying === p.id} disabled={Boolean(buying) || !gateway} onClick={() => void buy(p)}>
                <Icon name="wallet" size={17} />
                {buying === p.id ? "در حال انتقال…" : "خرید این پکیج"}
              </Button>
            </div>
          ))}
        </div>
      )}

      {!loading ? <Pager page={page} totalPages={totalPages} total={total} onChange={setPage} /> : null}

      <div className="dash-section-note" style={{ marginTop: 14 }}>
        مبلغ پس از پرداخت موفق به اشتراک سالن افزوده می‌شود و رسید آن در «کیف پول» و «فاکتورها» قابل پیگیری است.
      </div>

      <SectionTitle title="بخش‌های مرتبط" />
      <div className="dash-tiles" style={{ marginTop: 10 }}>
        <button type="button" className="dash-tile" onClick={() => navigate("/dash/wallet")}>
          <span className="dash-tile-icon">
            <Icon name="wallet" size={18} />
          </span>
          <span className="dash-tile-title">کیف پول</span>
          <span className="dash-tile-sub">موجودی و تراکنش‌های خرید پکیج</span>
        </button>
        <button type="button" className="dash-tile" onClick={() => navigate("/dash/finance")}>
          <span className="dash-tile-icon">
            <Icon name="chart" size={18} />
          </span>
          <span className="dash-tile-title">مالی و گزارش</span>
          <span className="dash-tile-sub">فاکتورها و گزارش درآمد</span>
        </button>
        <button type="button" className="dash-tile" onClick={() => navigate("/dash/salon")}>
          <span className="dash-tile-icon">
            <Icon name="store" size={18} />
          </span>
          <span className="dash-tile-title">سالن من</span>
          <span className="dash-tile-sub">پلن فعال و سقف‌های مصرفی</span>
        </button>
      </div>
    </div>
  );
}
