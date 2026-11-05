/**
 * رزرو صوتی — نسخهٔ مینی‌استایل از /dashboard/voice-booking
 *
 * جریان کار (ضبط ویس → تبدیل گفتار → استخراج نام/شماره/تاریخ/ساعت → ثبت نوبت، و
 * جایگزین‌های «فایل صوتی» و «نوشتن جمله») در همان کامپوننت تجربه‌شدهٔ پنل
 * (`@/components/AdminVoiceBooking`) است و اینجا بازنویسی نشده تا مسیر میکروفون و
 * منطق تطبیق ساعت با وقت‌های واقعی سالن دقیقاً همان بماند. هر چه این صفحه اضافه
 * می‌کد پوستهٔ مینی‌اپ، سالن‌سوییچر و انتخاب شعبه است.
 *
 * داده:
 *   GET /api/dashboard/salons/:id/branches   شعبه‌های فعال همان سالن
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminVoiceBooking from "@/components/AdminVoiceBooking";
import { Chip, EmptyState, Icon, SectionTitle } from "@/mini/components/ui";
import { dapi } from "../lib/api";
import { SalonSwitcher } from "../lib/parts";
import { useDash } from "../lib/store";

type Branch = { id: string; name: string };

export default function DashVoiceBooking() {
  const navigate = useNavigate();
  const { salon, salonId, canManage } = useDash();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");

  const base = useMemo(() => (salonId ? `/api/dashboard/salons/${salonId}` : ""), [salonId]);

  useEffect(() => {
    if (!base) {
      setBranches([]);
      setBranchId("");
      return;
    }
    let alive = true;
    void (async () => {
      const res = await dapi<{ success: boolean; branches?: Branch[] }>(`${base}/branches`);
      if (!alive) return;
      const list = res.ok ? res.data?.branches ?? [] : [];
      setBranches(list);
      // مثل بارگذاری وب: شعبهٔ اول پیش‌فرض است (سرویس‌ِ خودِ کامپوننت شعبه را از سرور می‌گیرد)
      setBranchId(list[0]?.id ?? "");
    })();
    return () => {
      alive = false;
    };
  }, [base]);

  if (!salonId || !canManage) {
    return (
      <div className="mini-fade">
        <div className="dash-toolbar">
          <SectionTitle title="رزرو صوتی" hint="نیاز به دسترسی مدیریت سالن دارد." />
          <div className="mini-actions" style={{ marginInlineStart: "auto" }}>
            <SalonSwitcher />
          </div>
        </div>
        <EmptyState text="سالنی برای رزرو صوتی انتخاب نشده است." hint="از بالای صفحه یک سالن انتخاب کنید." />
      </div>
    );
  }

  return (
    <div className="mini-fade">
      <div className="dash-toolbar">
        <SectionTitle
          title="رزرو صوتی"
          hint={salon?.name ? `برای ${salon.name} — یک جمله بگویید، نوبت ثبت شود` : "یک جمله بگویید، نوبت ثبت شود"}
        />
        <div className="mini-actions" style={{ marginInlineStart: "auto" }}>
          <SalonSwitcher />
        </div>
      </div>

      {branches.length > 1 ? (
        <div className="mini-card dash-pane" style={{ marginTop: 12 }}>
          <SectionTitle title="شعبه" hint="نوبت‌ها در این شعبه ثبت می‌شوند" />
          <div className="dash-tags" style={{ marginTop: 10 }}>
            {branches.map((b) => (
              <Chip key={b.id} on={b.id === branchId} onClick={() => setBranchId(b.id)}>
                {b.name}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      {/* همان کامپوننت رزرو صوتی پنل؛ داخل کارت مینی‌اپ نشسته تا ارتفاع و حاشیه‌ها به پوسته بخورد */}
      <div className="mini-card dash-pane" style={{ marginTop: 12, padding: "14px 12px" }}>
        <AdminVoiceBooking
          salonId={salonId}
          timezone={salon?.timezone ?? "Asia/Tehran"}
          branches={branches}
          autoBranchId={branchId || undefined}
        />
      </div>

      <div className="dash-section-note" style={{ marginTop: 14 }}>
        اگر مرورگر به دلیل نشانی ناامن (http) میکروفون را قفل کند، همان نتیجه با «فایل صوتی» یا
        نوشتن یک جمله از همین مسیر سرور گرفته می‌شود. ساعتِ گفته‌شده با وقت‌های واقعاً آزاد سالن
        تطبیق داده می‌شود.
      </div>

      <SectionTitle title="بخش‌های مرتبط" />
      <div className="dash-tiles" style={{ marginTop: 10 }}>
        <button type="button" className="dash-tile" onClick={() => navigate("/dash/appointments")}>
          <span className="dash-tile-icon">
            <Icon name="calendar" size={18} />
          </span>
          <span className="dash-tile-title">نوبت‌ها</span>
          <span className="dash-tile-sub">نوبت‌های ثبت‌شدهٔ صوتی و دستی</span>
        </button>
        <button type="button" className="dash-tile" onClick={() => navigate("/dash/services")}>
          <span className="dash-tile-icon">
            <Icon name="scissors" size={18} />
          </span>
          <span className="dash-tile-title">خدمات و پکیج</span>
          <span className="dash-tile-sub">ربات نام خدمت را از همین لیست می‌خواند</span>
        </button>
        <button type="button" className="dash-tile" onClick={() => navigate("/dash/staff")}>
          <span className="dash-tile-icon">
            <Icon name="users" size={18} />
          </span>
          <span className="dash-tile-title">کارکنان</span>
          <span className="dash-tile-sub">ساعت کاری هر نفر روی وقت‌های آزاد اثر دارد</span>
        </button>
      </div>
    </div>
  );
}
