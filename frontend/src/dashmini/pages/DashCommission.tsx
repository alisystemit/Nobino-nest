/**
 * کمیسیون — نسخهٔ مینی‌استایل از /dashboard/commission
 *
 * داده از همان endpoint وب:
 *   GET /api/commission   فقط برای نقش‌های AGENT و ADMIN (وگرنه ۴۰۳)
 *
 * برخلاف مالی، این بخش سالن‌محور نیست؛ درآمد نمایندگیِ همین حساب را نشان می‌دهد،
 * پس سالن‌سوییچر ندارد و تاریخ‌ها هم لازم نیست.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, EmptyState, Icon, Row, SectionTitle, SkeletonList } from "@/mini/components/ui";
import { compactToman, faDigits, toman } from "@/mini/lib/format";
import { subdomainUrl } from "@/lib/subdomain";
import { dapi } from "../lib/api";
import { StatGrid } from "../lib/parts";
import { useDash } from "../lib/store";

type Plan = { salonName: string; slug: string; percent: number };
type Summary = {
  balance: number;
  totalEarned: number;
  activePlanCount: number;
  plans: Plan[];
  totalEarnedLabel: string;
  balanceLabel: string;
};
type CommissionRes = { success: boolean; error?: string; summary?: Summary };

export default function DashCommission() {
  const navigate = useNavigate();
  const { toast } = useDash();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [err, setErr] = useState("");
  const [copiedId, setCopiedId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await dapi<CommissionRes>("/api/commission");
    if (res.ok && res.data?.summary) {
      setSummary(res.data.summary);
      setDenied(false);
      setErr("");
    } else if (res.status === 403) {
      setDenied(true);
    } else {
      setErr(res.data?.error || "خطا در دریافت اطلاعات");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const plans = summary?.plans ?? [];
  const avgPercent = plans.length ? Math.round((plans.reduce((a, p) => a + Number(p.percent || 0), 0) / plans.length) * 10) / 10 : 0;

  async function openSalon(p: Plan) {
    const url = p.slug ? subdomainUrl(p.slug) : `${window.location.origin}/s/${p.slug}`;
    window.open(url, "_blank", "noopener");
  }

  async function copyAddress(p: Plan) {
    const url = p.slug ? subdomainUrl(p.slug) : `${window.location.origin}/s/${p.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(p.slug);
      toast("نشانی عمومی سالن کپی شد.", "ok");
      window.setTimeout(() => setCopiedId(""), 1800);
    } catch {
      toast("کپی انجام نشد؛ نشانی را دستی بردارید.", "error");
    }
  }

  if (denied) {
    return (
      <div className="mini-fade">
        <div className="dash-toolbar">
          <SectionTitle title="کمیسیون" hint="درآمد نمایندگی" />
        </div>
        <div className="mini-card dash-pane">
          <EmptyState
            text="بخش کمیسیون مخصوص نمایندگان فروش و مدیران است؛ به این بخش دسترسی ندارید."
            hint="اگر نمایندهٔ نوبینو هستید، از مدیر پلتفرم قرارداد نمایندگی بخواهید."
          />
          <div style={{ marginTop: 12 }}>
            <Button variant="soft" onClick={() => navigate("/dash")}>
              <Icon name="back" size={17} />
              بازگشت به داشبورد
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mini-fade">
      <div className="dash-toolbar">
        <SectionTitle title="کمیسیون نمایندگی" hint="سهم شما از فروش پکیج سالن‌ها" />
      </div>

      {err ? (
        <div className="mini-note dash-note-bad" style={{ marginTop: 12 }}>
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="dash-pane">
          <SkeletonList count={3} />
        </div>
      ) : (
        <>
          <StatGrid
            loading={false}
            cells={[
              { label: "مجموع درآمد کمیسیون", value: compactToman(summary?.totalEarned ?? 0), hint: "کل سابقهٔ نمایندگی" },
              { label: "موجودی فعلی", value: compactToman(summary?.balance ?? 0), hint: "در کیف پول، قابل تسویه" },
              { label: "نمایندگی فعال", value: faDigits(summary?.activePlanCount ?? 0), hint: "سالن تحت پوشش شما" },
              { label: "میانگین درصد", value: plans.length ? `${faDigits(avgPercent)}٪` : "—", hint: "روی قراردادها" },
            ]}
          />

          <div className="mini-card dash-pane" style={{ marginTop: 14 }}>
            <SectionTitle
              title="سالن‌های تحت نمایندگی"
              hint={plans.length ? `${faDigits(plans.length)} سالن فعال با قرارداد کمیسیون` : "هنوز قراردادی فعال نیست"}
            />
            {plans.length === 0 ? (
              <div style={{ marginTop: 10 }}>
                <EmptyState text="هیچ نمایندگی فعالی وجود ندارد." hint="با عقد قرارداد نمایندگی، سالن‌های اینجا و درصدشان نمایش داده می‌شود." />
              </div>
            ) : (
              <div className="mini-list" style={{ marginTop: 12 }}>
                {plans.map((p) => (
                  <div key={p.slug || p.salonName} className="mini-item" style={{ alignItems: "flex-start" }}>
                    <span className="mini-item-main">
                      <span className="mini-item-title">{p.salonName}</span>
                      <span className="mini-item-sub dash-url" title={p.slug ? subdomainUrl(p.slug) : `/s/${p.slug}`} dir="ltr">
                        {p.slug ? subdomainUrl(p.slug) : `/s/${p.slug}`}
                      </span>
                    </span>
                    <span className="dash-tag">{faDigits(p.percent)}٪</span>
                    <span className="mini-item-acts">
                      <button type="button" className="mini-icon-btn" onClick={() => void openSalon(p)} aria-label="مشاهدهٔ صفحهٔ سالن" title="مشاهدهٔ صفحهٔ سالن">
                        <Icon name="search" size={16} />
                      </button>
                      <button
                        type="button"
                        className="mini-icon-btn"
                        onClick={() => void copyAddress(p)}
                        aria-label="کپی نشانی عمومی سالن"
                        title={copiedId === p.slug ? "کپی شد" : "کپی نشانی عمومی"}
                      >
                        <Icon name="link" size={16} />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mini-card dash-pane" style={{ marginTop: 14 }}>
            <SectionTitle title="خلاصه" />
            <div style={{ marginTop: 10 }}>
              <Row label="کل درآمد کمیسیون" value={toman(summary?.totalEarned ?? 0)} />
              <Row label="موجودی قابل برداشت" value={toman(summary?.balance ?? 0)} />
              <Row label="تعداد قرارداد فعال" value={faDigits(plans.length)} />
            </div>
            <div className="mini-note" style={{ marginTop: 12 }}>
              کمیسیون هر فروش پکیج به کیف پول شما واریز می‌شود؛ برای دیدن تراکنش‌ها و درخواست تسویه به بخش «کیف پول» بروید.
            </div>
          </div>
        </>
      )}

      <SectionTitle title="بخش‌های مرتبط" />
      <div className="dash-tiles" style={{ marginTop: 10 }}>
        <button type="button" className="dash-tile" onClick={() => navigate("/dash/wallet")}>
          <span className="dash-tile-icon">
            <Icon name="wallet" size={18} />
          </span>
          <span className="dash-tile-title">کیف پول</span>
          <span className="dash-tile-sub">تراکنش‌های کمیسیون و درخواست تسویه</span>
        </button>
        <button type="button" className="dash-tile" onClick={() => navigate("/dash/packages")}>
          <span className="dash-tile-icon">
            <Icon name="star" size={18} />
          </span>
          <span className="dash-tile-title">پکیج‌ها</span>
          <span className="dash-tile-sub">اشتراک‌هایی که کمیسیون‌شان به شماست</span>
        </button>
        <button type="button" className="dash-tile" onClick={() => navigate("/dash/finance")}>
          <span className="dash-tile-icon">
            <Icon name="chart" size={18} />
          </span>
          <span className="dash-tile-title">مالی و گزارش</span>
          <span className="dash-tile-sub">درآمد خدمات سالن، صندوق و فاکتورها</span>
        </button>
      </div>
    </div>
  );
}
