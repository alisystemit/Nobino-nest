/**
 * صفحه مدیریت کمپین‌های پیامکی
 * هر سالن کمپین‌های مخصوص خودش را دارد
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useSearchParams } from "@/router-shim";
import { useI18n } from "@/lib/i18n";
import DashboardShell from "@/components/DashboardShell";
import { useAuth } from "@/auth";
import Pagination from "@/components/ui/Pagination";
import { toPersianDigits } from "@/lib/utils";

/** اندازهٔ صفحهٔ کمپین‌ها — هم‌راستا با پیش‌فرض سرور */
const CAMPAIGNS_LIMIT = 25;

type Campaign = {
  id: string;
  name: string;
  message: string;
  channel: "SMS" | "EMAIL";
  segment: "ALL" | "RETURNING";
  status: "DRAFT" | "SCHEDULED" | "SENT";
  sentCount: number;
  createdAt: string;
  scheduledAt?: string | null;
  sentAt?: string | null;
};

type Template = {
  icon: string;
  name: string;
  text: string;
};

const CAMPAIGN_TEMPLATES: Template[] = [
  { icon: "🎊", name: "تبریک عید", text: "مشتری عزیز، عید شما مبارک! تیم «{salon}» بهترین آرzuها را برای شما و خانواده محترمتان دارد. منتظر دیدار شما هستیم 🌸" },
  { icon: "🏷️", name: "تخفیف ویژه", text: "خبر خوب! «{salon}» به مناسبت این هفته برای تمام خدمات ۲۰٪ تخفیف در نظر گرفته است. تا پایان هفته فرصت را از دست ندهید 🌟" },
  { icon: "🚚", name: "جابه‌جایی سالن", text: "مشتری عزیز، «{salon}» به آدرس جدید منتقل شده است. برای اطلاع از آدرس و مسیر، با ما تماس بگیرید یا به صفحه سالن سر بزنید 📍" },
  { icon: "🕐", name: "تغییر ساعات کاری", text: "مشتری عزیز، ساعات کاری «{salon}» تغییر کرده است. برای مشاهده ساعات جدید و رزرو آنلاین به صفحه سالن مراجعه کنید ⏰" },
  { icon: "🎂", name: "تبریک تولد", text: "تولدتان مبارک! «{salon}» به مناسبت روز تولد شما یک هدیه ویژه در نظر گرفته است؛ برای دریافت، هنگام مراجعه این پیامک را نشان دهید 🎁" },
  { icon: "💇‍♀️", name: "معرفی خدمت جدید", text: "خدمت جدید به «{salon}» اضافه شد! برای مشاهده جزئیات، قیمت‌ها و رزرو آنلاین به صفحه سالن سر بزنید ✨" },
  { icon: "🌙", name: "تعطیلات و بازگشایی", text: "مشتری عزیز، «{salon}» در ایام تعطیلات فعال نیست. از بازگشایی مجدد و رزرو وقت خود از طریق پیامک بعدی مطلع خواهید شد 🌙" },
  { icon: "💳", name: "یادآوری تسویه", text: "مشتری عزیز، لطفاً نسبت به تسویه حساب «{salon}» اقدام فرمایید. برای پرداخت آنلاین به پیامک فاکتور مراجعه کنید 💳" },
];

export default function DashboardCampaignsPage() {
  const { me } = useAuth();
  const sp = useSearchParams();
  const salonId = sp.get('salon');
  const { t } = useI18n();
  
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [segment, setSegment] = useState<"ALL" | "RETURNING">("ALL");
  const [channel, setChannel] = useState<"SMS" | "EMAIL">("SMS");
  const [showTemplates, setShowTemplates] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  /** سالن قبلی — برای بازگرداندن صفحه به ۱ هنگام تغییر سالن */
  const lastSalonIdRef = useRef<string | null>(null);

  if (!me) return <div>لطفاً وارد شوید</div>;

  useEffect(() => {
    // تغییر سالن: اول صفحه را به ۱ برگردان (افکت با dep جدید دوباره اجرا می‌شود)
    if (lastSalonIdRef.current !== salonId) {
      lastSalonIdRef.current = salonId;
      if (page !== 1) {
        setPage(1);
        return;
      }
    }
    fetchCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId, page]);

  async function fetchCampaigns() {
    if (!salonId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(CAMPAIGNS_LIMIT));
      const res = await fetch(`/api/dashboard/salons/${salonId}/campaigns?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setCampaigns(data.campaigns as Campaign[]);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? Math.max(1, Math.ceil((data.total ?? 0) / CAMPAIGNS_LIMIT)));
      }
    } catch (e) {
      console.error("خطا در دریافت کمپین‌ها:", e);
    } finally {
      setLoading(false);
    }
  }

  async function createCampaign() {
    if (!name || !message) {
      setMsg({ ok: false, text: "نام و پیام کمپین الزامی است" });
      return;
    }
    if (!salonId) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/salons/${salonId}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, channel, segment, message }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ ok: true, text: "کمپین ثبت شد" });
        setName("");
        setMessage("");
        // کمپین تازه در ابتدای فهرست (مرتب‌سازی بر اساس تازه‌ترین) است؛ صفحه ۱ آن را نشان می‌دهد
        if (page === 1) fetchCampaigns();
        else setPage(1);
      } else {
        setMsg({ ok: false, text: data.error || "خطا در ثبت کمپین" });
      }
    } catch (e) {
      setMsg({ ok: false, text: "خطا در اتصال به سرور" });
    } finally {
      setLoading(false);
    }
  }

  async function runCampaign(id: string) {
    if (!salonId) return;
    if (!confirm("آیا مطمئن هستید که می‌خواهید این کمپین را اجرا کنید؟")) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/salons/${salonId}/campaigns/${id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ 
          ok: true, 
          text: `کمپین در صف ارسال قرار گرفت. ${data.recipients} پیام ارسال شد.` 
        });
        fetchCampaigns();
      } else {
        setMsg({ ok: false, text: data.error || "خطا در اجرای کمپین" });
      }
    } catch (e) {
      setMsg({ ok: false, text: "خطا در اتصال به سرور" });
    } finally {
      setLoading(false);
    }
  }

  const channelLabels: Record<string, string> = {
    SMS: "پیامک",
    EMAIL: "ایمیل",
  };

  const segmentLabels: Record<string, string> = {
    ALL: "همه مشتریان",
    RETURNING: "مشتریان بازگشتی",
  };

  const statusLabels: Record<string, string> = {
    DRAFT: "پیش‌نویس",
    SCHEDULED: "برنامه‌ریزی شده",
    SENT: "ارسال‌شده",
  };

  return (
    <DashboardShell role={me.role} title="کمپین‌های پیامکی">
      <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-neutral-900 dark:text-neutral-100">کمپین‌های پیامکی</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            ساخت کمپین پیامکی برای مشتریان سالن
          </p>
          {msg && (
            <div className={`mt-3 rounded-lg px-4 py-3 ${msg.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"}`}>
              {msg.text}
            </div>
          )}
        </div>

        {/* فرم ساخت کمپین */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-lg font-extrabold text-neutral-900 dark:text-neutral-100">ساخت کمپین جدید</h2>
          
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-bold text-neutral-700 dark:text-neutral-300">
                نام کمپین
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="نام کمپین (مثلاً: تخفیف تابستانه)"
                className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 outline-none focus:border-pink-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-bold text-neutral-700 dark:text-neutral-300">
                متن پیام
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="متن پیام خود را بنویسید. از {salon} برای نام سالن استفاده کنید..."
                rows={4}
                className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 outline-none focus:border-pink-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
              <p className="mt-1 text-xs text-neutral-500">
                عبارت <b dir="ltr" className="text-pink-600">{`{salon}`}</b> هنگام ارسال با نام سالن جایگزین می‌شود
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-bold text-neutral-700 dark:text-neutral-300">
                  کانال
                </label>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as "SMS" | "EMAIL")}
                  className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 outline-none focus:border-pink-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                >
                  <option value="SMS">پیامک</option>
                  <option value="EMAIL">ایمیل</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold text-neutral-700 dark:text-neutral-300">
                  بخش هدف
                </label>
                <select
                  value={segment}
                  onChange={(e) => setSegment(e.target.value as "ALL" | "RETURNING")}
                  className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 outline-none focus:border-pink-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                >
                  <option value="ALL">همه مشتریان مراجعه‌کرده</option>
                  <option value="RETURNING">مشتریان بازگشتی (بیش از یک نوبت)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="flex items-center gap-2 text-sm font-bold text-purple-600 hover:text-purple-700 dark:text-purple-400"
              >
                <span>📣 استفاده از قالب آماده</span>
                <span className="text-lg">{showTemplates ? "▲" : "▼"}</span>
              </button>
              <button
                onClick={createCampaign}
                disabled={!name || !message || loading}
                className="rounded-xl bg-pink-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-pink-700 disabled:opacity-50"
              >
                {loading ? "در حال ثبت..." : "ثبت کمپین"}
              </button>
            </div>

            {/* قالب‌های آماده */}
            {showTemplates && (
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {CAMPAIGN_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.name}
                    onClick={() => {
                      setName(tpl.name);
                      setMessage(tpl.text);
                      setShowTemplates(false);
                      setMsg({ ok: true, text: `قالب "${tpl.name}" در فرم قرار گرفت` });
                    }}
                    className="flex items-center gap-3 rounded-xl border border-purple-200 bg-purple-50/50 px-4 py-3 text-left transition hover:bg-purple-100 dark:border-purple-900/50 dark:bg-purple-950/20"
                  >
                    <span className="text-xl">{tpl.icon}</span>
                    <div>
                      <div className="text-sm font-bold text-purple-900 dark:text-purple-200">{tpl.name}</div>
                      <div className="text-xs text-purple-600/70 dark:text-purple-300/70">{tpl.text.substring(0, 40)}...</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* لیست کمپین‌ها */}
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-neutral-900 dark:text-neutral-100">کمپین‌های ثبت شده</h2>
            <div className="text-sm text-neutral-500">
              مصرف این ماه: <span className="font-bold text-pink-600">{toPersianDigits(campaigns.filter(c => c.status === 'SENT').length)}</span> / سقف پلن
            </div>
          </div>

          {loading && campaigns.length === 0 ? (
            <div className="py-12 text-center text-neutral-500">در حال بارگذاری...</div>
          ) : campaigns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center text-neutral-400">
              کمپینی ثبت نشده است
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-extrabold text-neutral-900 dark:text-neutral-100">
                          {campaign.name}
                        </h3>
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          campaign.status === "SENT"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                            : campaign.status === "SCHEDULED"
                              ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                              : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                        }`}>
                          {statusLabels[campaign.status] || campaign.status}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                        <span className="flex items-center gap-1">
                          📩 {channelLabels[campaign.channel] || campaign.channel}
                        </span>
                        <span className="flex items-center gap-1">
                          👥 {segmentLabels[campaign.segment] || campaign.segment}
                        </span>
                        <span className="flex items-center gap-1">
                          📤 {toPersianDigits(campaign.sentCount)} پیام ارسال شد
                        </span>
                      </div>
                      {campaign.scheduledAt && (
                        <div className="mt-1 text-xs text-neutral-400">
                          📅 زمان ارسال: {toPersianDigits(new Date(campaign.scheduledAt).toLocaleDateString("fa-IR"))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => runCampaign(campaign.id)}
                      disabled={campaign.status === "SENT"}
                      className="h-10 rounded-xl bg-gradient-to-l from-pink-600 to-purple-600 px-4 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      اجرای کمپین
                    </button>
                  </div>
                  <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
                    {campaign.message.substring(0, 150)}
                    {campaign.message.length > 150 ? "..." : ""}
                  </p>
                </div>
              ))}
            </div>
          )}

          <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
        </div>

        {/* راهنمای محدودیت ماهانه */}
        <div className="mt-6 rounded-2xl bg-gradient-to-l from-purple-600 to-pink-600 p-6 text-white shadow-lg shadow-pink-500/20">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎯</span>
            <div>
              <h3 className="text-lg font-extrabold">محدودیت کمپین در ماه</h3>
              <p className="mt-1 text-sm text-white/90">
                از اول هر ماه شمسی (۱ مهر)، شمارشگر کمپین‌ها ریست می‌شود.
              </p>
            </div>
          </div>
        </div>
      </main>
    </DashboardShell>
  );
}
