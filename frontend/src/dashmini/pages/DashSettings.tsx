/**
 * تنظیمات سالن — نسخهٔ مینی‌استایل از /dashboard/settings (کامپوننت SalonSettings).
 *
 * endpoint ها همان‌هایی هستند که نسخهٔ وب مصرف می‌کند:
 *  • GET/PATCH  /api/dashboard/salons/:id            قوانین رزرو، بیعانه، منطقهٔ زمانی و دامنه
 *  • GET/PUT    /api/dashboard/salons/:id/hours       برنامهٔ کاری هفتگی
 *  • POST       /api/dashboard/salons/:id/domain      ساخت توکن تأیید و دستورالعمل TXT
 *  • POST       /api/dashboard/salons/:id/domain/verify  بررسی رکورد TXT
 *
 * اطلاعات هویتی، تصاویر و موقعیت در /dash/salon ویرایش می‌شوند؛ این صفحه فقط
 * «چطور رزرو می‌شود» را نگه می‌دارد تا دو نسخه روی هم نویسی نکنند.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Chip, EmptyState, Field, Icon, Row, SectionTitle, SkeletonList, Tabs } from "@/mini/components/ui";
import { faDigits, toman, WEEKDAYS_FA } from "@/mini/lib/format";
import { dapi } from "../lib/api";
import { SalonSwitcher } from "../lib/parts";
import { useDash } from "../lib/store";

type Pane = "hours" | "rules" | "deposit" | "domain";

type HourRow = { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean };

type RuleForm = {
  minNoticeMinutes: string;
  maxAdvanceDays: string;
  cancelDeadlineHours: string;
  bufferMinutes: string;
  timezone: string;
  depositEnabled: boolean;
  depositMode: string;
  depositValue: string;
};

const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "21:00";

const DOMAIN_STATUS: Record<string, { label: string; on: boolean }> = {
  NONE: { label: "دامنه اختصاصی فعال نشده", on: false },
  PENDING: { label: "در انتظار تأیید رکورد DNS", on: false },
  VERIFIED: { label: "دامنه تأیید شده و فعال است", on: true },
};

/** برنامهٔ هفتگی پیش‌فرض — فقط پیش‌نمایش است و تا ذخیره نشده در دیتابیس نمی‌رود */
function templateHours(): HourRow[] {
  return WEEKDAYS_FA.map((_, dayOfWeek) => ({
    dayOfWeek,
    openTime: DEFAULT_OPEN,
    closeTime: DEFAULT_CLOSE,
    isClosed: dayOfWeek === 6,
  }));
}

const toMinutes = (t: string): number => {
  const [h, m] = String(t || "").split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

function rulesFrom(s: any): RuleForm {
  return {
    minNoticeMinutes: String(s?.minNoticeMinutes ?? 60),
    maxAdvanceDays: String(s?.maxAdvanceDays ?? 30),
    cancelDeadlineHours: String(s?.cancelDeadlineHours ?? 24),
    bufferMinutes: String(s?.bufferMinutes ?? 10),
    timezone: s?.timezone ?? "Asia/Tehran",
    depositEnabled: Boolean(s?.depositEnabled),
    depositMode: s?.depositMode ?? "FIXED",
    depositValue: String(s?.depositValue ?? 0),
  };
}

const int = (raw: string, fallback = 0): number => {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? n : fallback;
};

export default function DashSettings() {
  const navigate = useNavigate();
  const { salon, salonId, payload, reloadPayload, toast } = useDash();

  const [pane, setPane] = useState<Pane>("hours");

  /* ساعات کاری */
  const [hours, setHours] = useState<HourRow[]>([]);
  const [hoursLoading, setHoursLoading] = useState(true);
  const [hoursSaved, setHoursSaved] = useState(true);
  const [savingHours, setSavingHours] = useState(false);

  /* قوانین رزرو و بیعانه */
  const [rules, setRules] = useState<RuleForm>(() => rulesFrom(salon));
  const [savingRules, setSavingRules] = useState(false);

  /* دامنه (نسخهٔ تازهٔ سالن، چون domainStatus بعد از هر اقدام عوض می‌شود) */
  const [fresh, setFresh] = useState<any>(null);
  const [domain, setDomain] = useState<string>(salon?.customDomain ?? "");
  const [instructions, setInstructions] = useState<{ type: string; host: string; value: string } | null>(null);
  const [domainBusy, setDomainBusy] = useState(false);

  const [err, setErr] = useState("");

  const src = fresh ?? salon;
  const domainStatus = String(src?.domainStatus ?? "NONE");
  const savedDomain = String(src?.customDomain ?? "");

  const setRule = <K extends keyof RuleForm>(key: K, value: RuleForm[K]) => setRules((r) => ({ ...r, [key]: value }));

  const setHour = (day: number, patch: Partial<HourRow>) =>
    setHours((hs) => hs.map((h) => (h.dayOfWeek === day ? { ...h, ...patch } : h)));

  /* سالن عوض شد → همه‌چیز از نو */
  useEffect(() => {
    if (!salonId) return;
    setRules(rulesFrom(salon));
    setDomain(salon?.customDomain ?? "");
    setInstructions(null);
    setErr("");
    setFresh(null);
    setHoursLoading(true);
    setHoursSaved(true);
    (async () => {
      const res = await dapi<{ success: boolean; hours?: HourRow[] }>(`/api/dashboard/salons/${salonId}/hours`);
      if (res.ok && Array.isArray(res.data.hours) && res.data.hours.length) {
        setHours(res.data.hours.map((h) => ({ dayOfWeek: h.dayOfWeek, openTime: h.openTime, closeTime: h.closeTime, isClosed: !!h.isClosed })));
        setHoursSaved(true);
      } else {
        setHours(templateHours());
        setHoursSaved(false);
      }
      setHoursLoading(false);
    })();
    (async () => {
      const res = await dapi<{ success: boolean; salon?: any }>(`/api/dashboard/salons/${salonId}`);
      if (res.ok && res.data.salon) {
        setFresh(res.data.salon);
        setRules(rulesFrom(res.data.salon));
        setDomain(res.data.salon.customDomain ?? "");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId, salon?.id]);

  const rulesDirty = useMemo(() => {
    const base = rulesFrom(src);
    return (Object.keys(base) as (keyof RuleForm)[]).some((k) => String(base[k]) !== String(rules[k]));
  }, [src, rules]);

  const openDays = hours.filter((h) => !h.isClosed).length;
  const domainAllowed = useMemo(
    () => (payload?.snap?.bools ?? []).some((b) => b.key === "customDomain" && b.on),
    [payload]
  );

  /* بیعانهٔ نمونه روی ارزان‌ترین خدمت فعال، تا مقدار معنایش را نشان دهد */
  const depositSample = useMemo(() => {
    const prices = ((src?.services ?? []) as any[]).filter((s) => s.isActive !== false).map((s) => Number(s.price) || 0);
    const price = prices.length ? Math.min(...prices) : 0;
    if (!price) return "";
    const value = int(rules.depositValue);
    if (rules.depositMode === "PERCENT") {
      const pct = Math.min(100, Math.max(0, value));
      return `${toman(Math.round((price * pct) / 100))} از خدمت ${toman(price)}`;
    }
    return `${toman(value)} از خدمت ${toman(price)}`;
  }, [src, rules]);

  async function saveHours() {
    if (!salonId) return;
    const bad = hours.filter((h) => !h.isClosed && toMinutes(h.closeTime) <= toMinutes(h.openTime));
    if (bad.length) {
      setErr(`ساعت بسته‌شدن باید بعد از ساعت باز شدن باشد (${bad.map((b) => WEEKDAYS_FA[b.dayOfWeek]).join("، ")}).`);
      return;
    }
    setErr("");
    setSavingHours(true);
    const res = await dapi<{ success: boolean; error?: string; hours?: HourRow[] }>(`/api/dashboard/salons/${salonId}/hours`, {
      method: "PUT",
      body: JSON.stringify({
        days: hours.map((h) => ({ dayOfWeek: h.dayOfWeek, openTime: h.openTime, closeTime: h.closeTime, isClosed: h.isClosed })),
      }),
    });
    setSavingHours(false);
    if (!res.ok) {
      setErr(res.data?.error || "ذخیرهٔ ساعات کاری ممکن نشد.");
      toast("ذخیره نشد", "error");
      return;
    }
    if (Array.isArray(res.data.hours)) setHours(res.data.hours);
    setHoursSaved(true);
    toast("ساعات کاری ذخیره شد", "ok");
    reloadPayload();
  }

  async function saveRules() {
    if (!salonId) return;
    const minNotice = int(rules.minNoticeMinutes, 0);
    const maxAdvance = int(rules.maxAdvanceDays, 1);
    const cancelDeadline = int(rules.cancelDeadlineHours, 0);
    const buffer = int(rules.bufferMinutes, 0);
    const depositValue = int(rules.depositValue, 0);
    if (maxAdvance < 1) {
      setErr("حداکثر بازهٔ رزرو آینده باید حداقل ۱ روز باشد.");
      setPane("rules");
      return;
    }
    if (rules.timezone.trim() && rules.timezone !== rules.timezone.trim()) setRule("timezone", rules.timezone.trim());
    if (rules.depositEnabled && rules.depositMode === "PERCENT" && depositValue > 100) {
      setErr("بیعانه در حالت درصدی نمی‌تواند بیشتر از 100 درصد باشد.");
      setPane("deposit");
      return;
    }
    setErr("");
    setSavingRules(true);
    const res = await dapi<{ success: boolean; error?: string }>(`/api/dashboard/salons/${salonId}`, {
      method: "PATCH",
      body: JSON.stringify({
        minNoticeMinutes: Math.min(1440, Math.max(0, minNotice)),
        maxAdvanceDays: Math.min(365, Math.max(1, maxAdvance)),
        cancelDeadlineHours: Math.min(720, Math.max(0, cancelDeadline)),
        bufferMinutes: Math.min(240, Math.max(0, buffer)),
        timezone: rules.timezone.trim() || "Asia/Tehran",
        depositEnabled: rules.depositEnabled,
        depositMode: rules.depositMode === "PERCENT" ? "PERCENT" : "FIXED",
        depositValue: Math.max(0, depositValue),
      }),
    });
    setSavingRules(false);
    if (!res.ok) {
      setErr(res.data?.error || "ذخیرهٔ تنظیمات ممکن نشد.");
      toast("ذخیره نشد", "error");
      return;
    }
    toast("تنظیمات ذخیره شد", "ok");
    reloadPayload();
    const again = await dapi<{ success: boolean; salon?: any }>(`/api/dashboard/salons/${salonId}`);
    if (again.ok && again.data.salon) setFresh(again.data.salon);
  }

  async function requestDomain() {
    if (!salonId) return;
    const host = domain.trim().toLowerCase();
    if (host.length < 3) {
      setErr("نشانی دامنه را کامل وارد کنید (مثلاً mysalon.ir).");
      return;
    }
    setErr("");
    setDomainBusy(true);
    const res = await dapi<{
      success: boolean;
      error?: string;
      instructions?: { type: string; host: string; value: string };
      salon?: any;
    }>(`/api/dashboard/salons/${salonId}/domain`, { method: "POST", body: JSON.stringify({ customDomain: host }) });
    setDomainBusy(false);
    if (!res.ok) {
      setErr(res.data?.error || "ثبت دامنه ممکن نشد.");
      toast("ثبت دامنه ناموفق بود", "error");
      return;
    }
    setInstructions(res.data.instructions ?? null);
    if (res.data.salon) setFresh(res.data.salon);
    toast("دامنه ثبت شد؛ رکورد DNS را اضافه کنید", "ok");
    reloadPayload();
  }

  async function verifyDomain() {
    if (!salonId) return;
    setErr("");
    setDomainBusy(true);
    const res = await dapi<{ success: boolean; error?: string; salon?: any }>(`/api/dashboard/salons/${salonId}/domain/verify`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    setDomainBusy(false);
    if (!res.ok) {
      setErr(res.data?.error || "رکورد TXT پیدا نشد؛ چند دقیقه بعد دوباره بررسی کنید.");
      toast("تأیید نشد", "error");
      return;
    }
    if (res.data.salon) setFresh(res.data.salon);
    toast("دامنه تأیید شد", "ok");
    reloadPayload();
  }

  async function clearDomain() {
    if (!salonId) return;
    setErr("");
    setDomainBusy(true);
    const res = await dapi<{ success: boolean; error?: string }>(`/api/dashboard/salons/${salonId}`, {
      method: "PATCH",
      body: JSON.stringify({ customDomain: null }),
    });
    setDomainBusy(false);
    if (!res.ok) {
      setErr(res.data?.error || "حذف دامنه ممکن نشد.");
      return;
    }
    setDomain("");
    setInstructions(null);
    toast("دامنه حذف شد", "ok");
    const again = await dapi<{ success: boolean; salon?: any }>(`/api/dashboard/salons/${salonId}`);
    if (again.ok && again.data.salon) setFresh(again.data.salon);
    reloadPayload();
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast("کپی شد", "ok");
    } catch {
      toast("کپی نشد؛ دستی انتخاب کنید", "error");
    }
  }

  if (!salonId) {
    return (
      <div className="mini-fade">
        <div className="dash-toolbar">
          <SectionTitle title="تنظیمات سالن" hint="ابتدا یک سالن انتخاب کنید." />
          <div className="mini-actions" style={{ marginInlineStart: "auto" }}>
            <SalonSwitcher />
          </div>
        </div>
        <EmptyState text="سالنی برای این کاربر ثبت نشده است." hint="از «سالن من» می‌توانید سالن بسازید." />
      </div>
    );
  }

  return (
    <div className="mini-fade">
      <div className="dash-toolbar">
        <SectionTitle title="تنظیمات سالن" hint={src?.name ? `برای ${src.name}` : undefined} />
        <div className="mini-actions" style={{ marginInlineStart: "auto" }}>
          <SalonSwitcher />
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <Tabs<Pane>
          value={pane}
          onChange={(id) => {
            setErr("");
            setPane(id);
          }}
          items={[
            { id: "hours", label: "ساعات کاری", icon: "clock" },
            { id: "rules", label: "قوانین رزرو", icon: "calendar" },
            { id: "deposit", label: "بیعانه", icon: "wallet" },
            { id: "domain", label: "دامنه", icon: "link" },
          ]}
        />
      </div>

      {err ? (
        <div className="mini-note dash-note-bad" style={{ marginTop: 12 }}>
          {err}
        </div>
      ) : null}

      {/* ── ساعات کاری ─────────────────────────────────────────────── */}
      {pane === "hours" ? (
        <div className="mini-card" style={{ marginTop: 12 }}>
          <div className="mini-option-sub" style={{ lineHeight: 1.9 }}>
            ساعت‌های آزاد مینی‌اپ و صفحهٔ عمومی از همین برنامه محاسبه می‌شوند. روز تعطیل را با چیپ «تعطیل» مشخص کنید.
          </div>
          {hoursLoading ? (
            <SkeletonList count={4} />
          ) : (
            <>
              {!hoursSaved ? <div className="mini-note" style={{ marginTop: 10 }}>این برنامهٔ پیش‌فرض است؛ تا ذخیره نشود روی سالن اعمال نمی‌شود.</div> : null}
              <div className="dash-days" style={{ marginTop: 12 }}>
                {hours.map((h) => (
                  <div key={h.dayOfWeek} className="dash-day">
                    <span className="dash-day-name">{WEEKDAYS_FA[h.dayOfWeek] ?? `روز ${faDigits(h.dayOfWeek + 1)}`}</span>
                    <span className="dash-day-times">
                      <Field
                        label=""
                        name={`hOpen-${h.dayOfWeek}`}
                        type="time"
                        className="is-ltr"
                        value={h.openTime}
                        disabled={h.isClosed}
                        onChange={(e) => {
                          setHoursSaved(false);
                          setHour(h.dayOfWeek, { openTime: e.target.value });
                        }}
                      />
                      <Field
                        label=""
                        name={`hClose-${h.dayOfWeek}`}
                        type="time"
                        className="is-ltr"
                        value={h.closeTime}
                        disabled={h.isClosed}
                        onChange={(e) => {
                          setHoursSaved(false);
                          setHour(h.dayOfWeek, { closeTime: e.target.value });
                        }}
                      />
                    </span>
                    <Chip on={h.isClosed} onClick={() => { setHoursSaved(false); setHour(h.dayOfWeek, { isClosed: !h.isClosed }); }}>
                      تعطیل
                    </Chip>
                  </div>
                ))}
              </div>
              <div className="mini-note" style={{ marginTop: 12 }}>
                {faDigits(openDays)} روز کاری در هفته
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* ── قوانین رزرو ────────────────────────────────────────────── */}
      {pane === "rules" ? (
        <div className="mini-card" style={{ marginTop: 12 }}>
          <div className="mini-option-sub" style={{ lineHeight: 1.9 }}>
            این چهار عدد فاصلهٔ نوبت‌ها و پنجرهٔ رزرو را تعیین می‌کنند؛ استراحت بین نوبت هر خدمت می‌تواند جداگانه هم تنظیم شود.
          </div>
          <div className="dash-two" style={{ marginTop: 12 }}>
            <Field
              label="حداقل فاصله تا رزرو (دقیقه)"
              name="stNotice"
              type="number"
              min={0}
              max={1440}
              step={5}
              inputMode="numeric"
              className="is-ltr"
              value={rules.minNoticeMinutes}
              onChange={(e) => setRule("minNoticeMinutes", e.target.value)}
            />
            <Field
              label="حداکثر بازهٔ آینده (روز)"
              name="stAdvance"
              type="number"
              min={1}
              max={365}
              step={1}
              inputMode="numeric"
              className="is-ltr"
              value={rules.maxAdvanceDays}
              onChange={(e) => setRule("maxAdvanceDays", e.target.value)}
            />
          </div>
          <div className="dash-two" style={{ marginTop: 10 }}>
            <Field
              label="مهلت لغو (ساعت قبل از نوبت)"
              name="stCancel"
              type="number"
              min={0}
              max={720}
              step={1}
              inputMode="numeric"
              className="is-ltr"
              value={rules.cancelDeadlineHours}
              onChange={(e) => setRule("cancelDeadlineHours", e.target.value)}
            />
            <Field
              label="بافر بین نوبت‌ها (دقیقه)"
              name="stBuffer"
              type="number"
              min={0}
              max={240}
              step={5}
              inputMode="numeric"
              className="is-ltr"
              value={rules.bufferMinutes}
              onChange={(e) => setRule("bufferMinutes", e.target.value)}
            />
          </div>
          <div style={{ marginTop: 10 }}>
            <Field
              label="منطقهٔ زمانی"
              name="stTz"
              className="is-ltr"
              value={rules.timezone}
              onChange={(e) => setRule("timezone", e.target.value)}
              hint="پیش‌فرض Asia/Tehran؛ ساعت‌های کاری و نوبت‌ها با همین منطقه نمایش داده می‌شوند."
            />
          </div>
        </div>
      ) : null}

      {/* ── بیعانه ─────────────────────────────────────────────────── */}
      {pane === "deposit" ? (
        <div className="mini-card" style={{ marginTop: 12 }}>
          <div className="dash-inline-actions" style={{ justifyContent: "space-between" }}>
            <SectionTitle title="بیعانهٔ نوبت" hint="پیش‌پرداخت پس از رزرو آنلاین" />
            <Chip on={rules.depositEnabled} onClick={() => setRule("depositEnabled", !rules.depositEnabled)}>
              {rules.depositEnabled ? "فعال" : "غیرفعال"}
            </Chip>
          </div>
          <div className="mini-option-sub" style={{ marginTop: 8, lineHeight: 1.9 }}>
            مشتری بعد از ثبت نوبت بیعانه را می‌پردازد و وضعیت پرداخت روی همان نوبت ثبت می‌شود. تا این گزینه روشن نشود، رزرو بدون پرداخت انجام می‌شود.
          </div>
          {rules.depositEnabled ? (
            <>
              <div className="dash-subhead">
                <SectionTitle title="نوع بیعانه" />
              </div>
              <div className="mini-chips">
                <Chip on={rules.depositMode === "FIXED"} onClick={() => setRule("depositMode", "FIXED")}>
                  مبلغ ثابت (تومان)
                </Chip>
                <Chip on={rules.depositMode === "PERCENT"} onClick={() => setRule("depositMode", "PERCENT")}>
                  درصدی از قیمت خدمت
                </Chip>
              </div>
              <div style={{ marginTop: 12, maxWidth: 260 }}>
                <Field
                  label={rules.depositMode === "PERCENT" ? "درصد بیعانه" : "مبلغ بیعانه (تومان)"}
                  name="stDeposit"
                  type="number"
                  min={0}
                  max={rules.depositMode === "PERCENT" ? 100 : 100000000}
                  step={rules.depositMode === "PERCENT" ? 1 : 10000}
                  inputMode="numeric"
                  className="is-ltr"
                  value={rules.depositValue}
                  onChange={(e) => setRule("depositValue", e.target.value)}
                />
              </div>
              {depositSample ? (
                <div className="mini-note" style={{ marginTop: 12 }}>
                  مثال: {depositSample}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {/* ── دامنهٔ اختصاصی ─────────────────────────────────────────── */}
      {pane === "domain" ? (
        <div className="mini-card" style={{ marginTop: 12 }}>
          <div className="dash-inline-actions" style={{ justifyContent: "space-between" }}>
            <SectionTitle title="دامنهٔ اختصاصی" hint={savedDomain || "بدون دامنه"} />
            <span className={`dash-tag${DOMAIN_STATUS[domainStatus]?.on ? "" : " is-off"}`}>
              {DOMAIN_STATUS[domainStatus]?.label ?? domainStatus}
            </span>
          </div>
          <div className="mini-option-sub" style={{ marginTop: 8, lineHeight: 1.9 }}>
            با ثبت دامنه، یک توکن تأیید ساخته می‌شود؛ آن را به‌عنوان رکورد TXT در DNS دامنه قرار دهید و سپس «بررسی تأیید» را بزنید. پس از تأیید، صفحهٔ عمومی سالن روی نشانی خودتان باز می‌شود.
          </div>

          {domainAllowed ? null : (
            <div className="mini-note" style={{ marginTop: 10 }}>
              دامنهٔ اختصاصی در پلن فعلی فعال نیست. برای روشن‌شدنش از بخش «پکیج‌ها» اشتراک را ارتقا دهید.
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <Field
              label="نشانی دامنه"
              name="stDomain"
              className="is-ltr"
              dir="ltr"
              placeholder="mysalon.ir"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
          </div>

          <div className="dash-inline-actions" style={{ marginTop: 12 }}>
            <Button variant="primary" loading={domainBusy} disabled={domainBusy || !domainAllowed} onClick={() => void requestDomain()}>
              <Icon name="bolt" size={17} />
              ثبت دامنه و ساخت کد تأیید
            </Button>
            <Button variant="soft" disabled={domainBusy || !savedDomain} onClick={() => void verifyDomain()}>
              <Icon name="check" size={17} />
              بررسی تأیید
            </Button>
            {savedDomain ? (
              <Button variant="ghost" disabled={domainBusy} onClick={() => void clearDomain()}>
                <Icon name="close" size={17} />
                حذف دامنه
              </Button>
            ) : null}
          </div>

          {instructions ? (
            <div className="mini-card" style={{ marginTop: 12 }}>
              <SectionTitle title="رکورد DNS که باید بسازید" />
              <div style={{ marginTop: 8 }}>
                <Row label="نوع" value={<span dir="ltr">{instructions.type}</span>} />
                <Row label="نام/میزبان" value={<span dir="ltr">{instructions.host}</span>} />
                <Row label="مقدار" value={<span dir="ltr" style={{ wordBreak: "break-all" }}>{instructions.value}</span>} />
              </div>
              <div className="mini-actions" style={{ marginTop: 10 }}>
                <button type="button" className="mini-btn soft tiny" onClick={() => void copyText(instructions.value)}>
                  <Icon name="edit" size={15} />
                  کپی مقدار
                </button>
              </div>
            </div>
          ) : null}

          {savedDomain ? (
            <div className="mini-note" style={{ marginTop: 12 }}>
              دامنهٔ فعلی: <span dir="ltr">{savedDomain}</span>
              {payload?.publicUrl ? (
                <>
                  {" · "}
                  <button type="button" className="mini-btn ghost tiny" style={{ verticalAlign: "middle" }} onClick={() => void copyText(payload?.publicUrl ?? "")}>
                    کپی نشانی عمومی
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ذخیرهٔ ساعات و ذخیرهٔ قوانین/بیعانه، هرکدام در پن خودشان */}
      {pane === "hours" ? (
        <div className="dash-sticky">
          <Button
            variant="primary"
            loading={savingHours}
            disabled={savingHours || hoursLoading}
            onClick={() => void saveHours()}
            className="dash-grow"
          >
            <Icon name="check" size={17} />
            {savingHours ? "در حال ذخیره…" : hoursSaved ? "ساعات کاری ذخیره شده است" : "ذخیرهٔ ساعات کاری"}
          </Button>
        </div>
      ) : null}

      {pane === "rules" || pane === "deposit" ? (
        <div className="dash-sticky">
          <Button variant="primary" loading={savingRules} disabled={savingRules || !rulesDirty} onClick={() => void saveRules()} className="dash-grow">
            <Icon name="check" size={17} />
            {savingRules ? "در حال ذخیره…" : rulesDirty ? "ذخیرهٔ تنظیمات" : "تغییری ثبت نشده"}
          </Button>
          {rulesDirty ? (
            <Button variant="ghost" disabled={savingRules} onClick={() => setRules(rulesFrom(src))}>
              بازگردانی
            </Button>
          ) : null}
        </div>
      ) : null}

      <SectionTitle title="بخش‌های مرتبط" hint="همین سالن در داشبورد مینی" />
      <div className="dash-tiles" style={{ marginTop: 10 }}>
        <button type="button" className="dash-tile" onClick={() => navigate("/dash/salon")}>
          <span className="dash-tile-icon">
            <Icon name="store" size={18} />
          </span>
          <span className="dash-tile-title">سالن من</span>
          <span className="dash-tile-sub">مشخصات، تصاویر و موقعیت</span>
        </button>
        <button type="button" className="dash-tile" onClick={() => navigate("/dash/services")}>
          <span className="dash-tile-icon">
            <Icon name="scissors" size={18} />
          </span>
          <span className="dash-tile-title">خدمات و پکیج‌ها</span>
          <span className="dash-tile-sub">مدت، قیمت و استراحت بین نوبت</span>
        </button>
        <button type="button" className="dash-tile" onClick={() => navigate("/dash/staff")}>
          <span className="dash-tile-icon">
            <Icon name="users" size={18} />
          </span>
          <span className="dash-tile-title">کارکنان و شیفت</span>
          <span className="dash-tile-sub">برنامهٔ هفتگی هر آرایشگر</span>
        </button>
        <button type="button" className="dash-tile" onClick={() => navigate("/dash/booking")}>
          <span className="dash-tile-icon">
            <Icon name="calendar" size={18} />
          </span>
          <span className="dash-tile-title">رزرو دستی</span>
          <span className="dash-tile-sub">ساعت‌های آزاد با همین قوانین</span>
        </button>
      </div>

      <div className="dash-section-note" style={{ marginTop: 14 }}>
        تغییرات این صفحه روی رزروهای آینده اعمال می‌شود و نوبت‌های ثبت‌شده را جابه‌جا نمی‌کند. راهنمای کامل:{" "}
        <a href="/help#owner" style={{ fontWeight: 800 }}>
          راهنمای تنظیمات سالن
        </a>
      </div>
    </div>
  );
}
