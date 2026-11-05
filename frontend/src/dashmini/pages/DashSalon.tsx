/**
 * سالن من — نسخهٔ مینی‌استایل از /dashboard/salon و بخش «اطلاعات عمومی» تنظیمات وب.
 *
 * endpoint ها دقیقاً همان‌هایی هستند که نسخهٔ کلاسیک مصرف می‌کند:
 *  • PATCH    /api/dashboard/salons/:id                 اطلاعات هویتی، ارتباطی و موقعیت
 *  • GET      /api/dashboard/salons/:id/images          لوگو، بنر و گالری (صفحه‌بندی‌شده)
 *  • POST     /api/dashboard/salons/:id/images          بارگذاری (multipart: file + kind + title)
 *  • DELETE   /api/dashboard/salons/:id/images?itemId=  حذف یک نمونه‌کار
 *
 * دادهٔ اولیه از بارگذاری /api/pages/dashboard-salon می‌آید؛ همان منبعی که پوستهٔ وب
 * می‌خواند، پس دو نسخه همیشه یک سالن را یکسان نشان می‌دهند.
 * ساعات کاری، قوانین رزرو و دامنه در /dash/settings مانده‌اند تا این صفحه فقط
 * «ظاهر و هویت سالن» را نگه دارد.
 */
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Area, Button, Field, Icon, SectionTitle, SkeletonList, Tabs } from "@/mini/components/ui";
import { faDigits } from "@/mini/lib/format";
import { displayUrl } from "@/lib/site";
import { getUploadLimits, mbToBytes, sizeHintFa, uploadLimitsSync } from "@/lib/upload-limits";
import { dapi, qs } from "../lib/api";
import { PlanMeters, SalonSwitcher, StatGrid } from "../lib/parts";
import { useDash } from "../lib/store";

type Pane = "info" | "images" | "map";

type GalleryItem = { id: string; imageUrl: string; title?: string | null };

type Form = {
  name: string;
  phone: string;
  city: string;
  address: string;
  description: string;
  email: string;
  whatsapp: string;
  instagram: string;
  website: string;
  coverColor: string;
  latitude: string;
  longitude: string;
  mapUrl: string;
  baladUrl: string;
  neshanUrl: string;
};

const PLAN_LABEL: Record<string, string> = {
  FREE: "پلن رایگان",
  BASIC: "پلن پایه",
  PRO: "پلن حرفه‌ای",
  ENTERPRISE: "پلن سازمانی",
};

/** پیش‌نمایش‌های آمادهٔ رنگ کاور — همان مقادیری که در صفحهٔ عمومی استفاده می‌شود */
const COVER_SWATCHES = ["#1c2434", "#7c3aed", "#db2777", "#0f766e", "#b45309", "#1d4ed8"];

function faDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(d);
}

function emptyForm(): Form {
  return {
    name: "",
    phone: "",
    city: "",
    address: "",
    description: "",
    email: "",
    whatsapp: "",
    instagram: "",
    website: "",
    coverColor: "#1c2434",
    latitude: "",
    longitude: "",
    mapUrl: "",
    baladUrl: "",
    neshanUrl: "",
  };
}

function formFromSalon(s: any): Form {
  return {
    name: s?.name ?? "",
    phone: s?.phone ?? "",
    city: s?.city ?? "",
    address: s?.address ?? "",
    description: s?.description ?? "",
    email: s?.email ?? "",
    whatsapp: s?.whatsapp ?? "",
    instagram: s?.instagram ?? "",
    website: s?.website ?? "",
    coverColor: s?.coverColor ?? "#1c2434",
    latitude: s?.latitude === null || s?.latitude === undefined ? "" : String(s.latitude),
    longitude: s?.longitude === null || s?.longitude === undefined ? "" : String(s.longitude),
    mapUrl: s?.mapUrl ?? "",
    baladUrl: s?.baladUrl ?? "",
    neshanUrl: s?.neshanUrl ?? "",
  };
}

export default function DashSalon() {
  const navigate = useNavigate();
  const { salon, salonId, payload, reloadPayload, toast, payloadLoading } = useDash();

  const [pane, setPane] = useState<Pane>("info");
  const [form, setForm] = useState<Form>(() => (salon ? formFromSalon(salon) : emptyForm()));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  /* تصویرها */
  const [logoUrl, setLogoUrl] = useState<string>(salon?.logoUrl ?? "");
  const [bannerUrl, setBannerUrl] = useState<string>(salon?.bannerUrl ?? "");
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [imgPage, setImgPage] = useState(1);
  const [imgTotal, setImgTotal] = useState(0);
  const [imgTotalPages, setImgTotalPages] = useState(1);
  const [imgTitle, setImgTitle] = useState("");
  const [uploading, setUploading] = useState<"logo" | "banner" | "gallery" | null>(null);
  const [maxMb, setMaxMb] = useState(() => uploadLimitsSync().imageMaxMb);

  const set = (key: keyof Form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  /* سالن عوض شد → فرم و گالری از نو */
  useEffect(() => {
    if (!salon) return;
    setForm(formFromSalon(salon));
    setLogoUrl(salon.logoUrl ?? "");
    setBannerUrl(salon.bannerUrl ?? "");
    setErr("");
    setImgPage(1);
  }, [salon?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void getUploadLimits().then((limits) => setMaxMb(limits.imageMaxMb));
  }, []);

  const loadImages = useCallback(
    async (page: number) => {
      if (!salonId) return;
      const res = await dapi<{
        success: boolean;
        items?: GalleryItem[];
        total?: number;
        totalPages?: number;
        logoUrl?: string | null;
        bannerUrl?: string | null;
      }>(`/api/dashboard/salons/${salonId}/images${qs({ page, limit: 12 })}`);
      if (!res.ok) return;
      const items = res.data.items ?? [];
      setGallery(items);
      setImgTotal(typeof res.data.total === "number" ? res.data.total : items.length);
      setImgTotalPages(res.data.totalPages ?? Math.max(1, Math.ceil(items.length / 12)));
      if (res.data.logoUrl !== undefined) setLogoUrl(res.data.logoUrl ?? "");
      if (res.data.bannerUrl !== undefined) setBannerUrl(res.data.bannerUrl ?? "");
    },
    [salonId]
  );

  useEffect(() => {
    void loadImages(imgPage);
  }, [loadImages, imgPage]);

  const dirty = useMemo(() => {
    if (!salon) return false;
    const base = formFromSalon(salon);
    return (Object.keys(base) as (keyof Form)[]).some((k) => (base[k] ?? "") !== (form[k] ?? ""));
  }, [salon, form]);

  async function save() {
    if (!salonId) return;
    if (!form.name.trim()) {
      setErr("نام سالن نمی‌تواند خالی باشد.");
      setPane("info");
      return;
    }
    if (form.phone.trim().length < 6) {
      setErr("شماره تلفن معتبر نیست (حداقل ۶ رقم).");
      setPane("info");
      return;
    }
    setErr("");
    setSaving(true);
    const res = await dapi<{ success: boolean; error?: string }>(`/api/dashboard/salons/${salonId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: form.name.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        address: form.address.trim(),
        description: form.description.trim(),
        email: form.email.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        instagram: form.instagram.trim() || null,
        website: form.website.trim() || null,
        coverColor: form.coverColor.trim() || "#1c2434",
        latitude: form.latitude.trim() === "" ? null : Number(form.latitude),
        longitude: form.longitude.trim() === "" ? null : Number(form.longitude),
        mapUrl: form.mapUrl.trim() || null,
        baladUrl: form.baladUrl.trim() || null,
        neshanUrl: form.neshanUrl.trim() || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setErr(res.data?.error || "ذخیرهٔ اطلاعات سالن ممکن نشد.");
      toast("ذخیره نشد", "error");
      return;
    }
    toast("اطلاعات سالن ذخیره شد", "ok");
    reloadPayload();
  }

  async function pickImage(kind: "logo" | "banner" | "gallery", file: File) {
    if (!salonId) return;
    if (file.size > mbToBytes(maxMb)) {
      setErr(`حجم تصویر باید کمتر از ${sizeHintFa(maxMb)} باشد.`);
      return;
    }
    setUploading(kind);
    setErr("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    if (kind === "gallery" && imgTitle.trim()) fd.append("title", imgTitle.trim());
    const res = await dapi<{ success: boolean; error?: string; url?: string }>(`/api/dashboard/salons/${salonId}/images`, {
      method: "POST",
      body: fd,
    });
    setUploading(null);
    if (!res.ok) {
      setErr(res.data?.error || "بارگذاری تصویر ممکن نشد.");
      toast("بارگذاری تصویر ناموفق بود", "error");
      return;
    }
    if (kind === "logo") setLogoUrl(res.data.url ?? "");
    else if (kind === "banner") setBannerUrl(res.data.url ?? "");
    else setImgTitle("");
    toast(kind === "gallery" ? "نمونه‌کار اضافه شد" : kind === "logo" ? "لوگو عوض شد" : "بنر عوض شد", "ok");
    if (kind === "gallery") void loadImages(imgPage);
    else reloadPayload();
  }

  async function removeItem(itemId: string) {
    if (!salonId) return;
    const res = await dapi<{ success: boolean; error?: string }>(
      `/api/dashboard/salons/${salonId}/images${qs({ itemId })}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      setErr(res.data?.error || "حذف تصویر ممکن نشد.");
      return;
    }
    toast("تصویر حذف شد", "ok");
    void loadImages(imgPage);
  }

  async function copyLink() {
    const url = payload?.publicUrl ?? "";
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast("نشانی صفحهٔ عمومی کپی شد", "ok");
    } catch {
      toast("کپی نشد؛ نشانی را دستی بردارید", "error");
    }
  }

  if (payloadLoading && !salon) {
    return (
      <div className="mini-fade">
        <SectionTitle title="سالن من" />
        <SkeletonList count={3} />
      </div>
    );
  }

  if (!salon || !salonId) {
    return (
      <div className="mini-fade">
        <SectionTitle title="سالن من" hint="سالنی انتخاب نشده است" />
        <div className="mini-card">
          <div className="mini-option-sub" style={{ lineHeight: 1.9 }}>
            برای ویرایش اطلاعات سالن اول یک سالن بسازید. ساخت سالن با همان ویزارد کامل نسخهٔ وب انجام می‌شود تا هیچ مرحله‌ای جا نماند.
          </div>
          <div className="mini-actions" style={{ marginTop: 12 }}>
            <Button onClick={() => navigate("/dashboard/setup?new=1")}>
              <Icon name="plus" size={17} />
              ساخت سالن جدید
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const planLabel = PLAN_LABEL[salon.plan ?? "FREE"] ?? PLAN_LABEL.FREE;
  const subEnds = faDate(salon.subscriptionEndsAt);
  const trialEnds = faDate(salon.trialEndsAt);
  const subActive = salon.subscriptionEndsAt ? new Date(salon.subscriptionEndsAt) > new Date() : false;
  const publicUrl = payload?.publicUrl ?? "";
  const hasAddress = !!(form.address.trim() || form.city.trim());
  const mapQuery = encodeURIComponent(`${form.address} ${form.city}`.trim());

  return (
    <div className="mini-fade">
      {/* هویّت سالن */}
      <div className="dash-hero">
        <div className="dash-hero-title">
          <Icon name="store" size={18} />
          <span>{salon.name}</span>
          <span className="dash-tag">{planLabel}</span>
          {salon.isApproved === false ? <span className="dash-tag is-off">در انتظار تأیید</span> : null}
          {salon.isActive === false ? <span className="dash-tag is-off">غیرفعال</span> : null}
          {subActive ? <span className="dash-tag">اشتراک فعال</span> : null}
        </div>
        <div className="dash-hero-sub">
          نشانی عمومی: <span dir="ltr">{displayUrl(publicUrl)}</span>
          <br />
          تلفن: <span dir="ltr">{faDigits(salon.phone ?? "")}</span>
          {subEnds ? <>{` · اشتراک تا ${subEnds}`}{salon.autoRenew ? " (تمدید خودکار)" : ""}</> : null}
          {!subEnds && trialEnds ? ` · دورهٔ آزمایشی تا ${trialEnds}` : ""}
        </div>
        <div className="mini-actions" style={{ marginTop: 10 }}>
          {publicUrl ? (
            <button type="button" className="mini-btn tiny" onClick={() => window.open(publicUrl, "_blank", "noopener")}>
              <Icon name="link" size={15} />
              صفحهٔ عمومی
            </button>
          ) : null}
          {publicUrl ? (
            <button type="button" className="mini-btn soft tiny" onClick={() => void copyLink()}>
              کپی نشانی
            </button>
          ) : null}
          <SalonSwitcher />
        </div>
      </div>

      <StatGrid
        loading={false}
        cells={[
          { value: faDigits(Number(salon._count?.appointments ?? 0)), label: "کل نوبت‌ها" },
          { value: faDigits((salon.services ?? []).length), label: "خدمات فعال" },
          { value: faDigits(Number(salon._count?.galleryItems ?? 0)), label: "آثار گالری" },
          { value: faDigits(Number(salon._count?.reviews ?? 0)), label: "نظرات" },
        ]}
      />

      <div style={{ marginTop: 12 }}>
        <Tabs<Pane>
          value={pane}
          onChange={setPane}
          items={[
            { id: "info", label: "مشخصات", icon: "info" },
            { id: "images", label: "تصاویر", icon: "camera" },
            { id: "map", label: "موقعیت", icon: "pin" },
          ]}
        />
      </div>

      {err ? (
        <div className="mini-note dash-note-bad" style={{ marginTop: 12 }}>
          {err}
        </div>
      ) : null}

      {pane === "info" ? (
        <div className="mini-card" style={{ marginTop: 12 }}>
          <Field label="نام سالن" name="salName" value={form.name} onChange={set("name")} placeholder="مثلاً سالن زیبایی پیوسته" />
          <div className="dash-two" style={{ marginTop: 10 }}>
            <Field label="تلفن" name="salPhone" type="tel" className="is-ltr" dir="ltr" value={form.phone} onChange={set("phone")} placeholder="021..." />
            <Field label="شهر" name="salCity" value={form.city} onChange={set("city")} placeholder="تهران" />
          </div>
          <div style={{ marginTop: 10 }}>
            <Field label="آدرس" name="salAddress" value={form.address} onChange={set("address")} placeholder="خیابان، کوچه، پلاک" />
          </div>
          <div style={{ marginTop: 10 }}>
            <Area
              label="توضیح کوتاه سالن"
              name="salDesc"
              rows={3}
              value={form.description}
              onChange={set("description")}
              placeholder="همین متن در صفحهٔ عمومی و مینی‌اپ سالن نمایش داده می‌شود."
            />
          </div>

          <div className="dash-subhead">
            <SectionTitle title="رنگ کاور" hint="در کارت سالن و هدر صفحهٔ عمومی" />
          </div>
          <div className="mini-chips" style={{ marginTop: 0 }}>
            {COVER_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                className={`mini-chip${form.coverColor.toLowerCase() === c ? " is-on" : ""}`}
                onClick={() => setForm((f) => ({ ...f, coverColor: c }))}
              >
                <span className="dash-swatch" style={{ background: c }} />
                {c}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <Field label="کد رنگ (دلخواه)" name="salColor" className="is-ltr" value={form.coverColor} onChange={set("coverColor")} placeholder="#1c2434" />
          </div>

          <div className="dash-subhead">
            <SectionTitle title="راه‌های ارتباطی" hint="در صفحهٔ عمومی سالن" />
          </div>
          <div className="dash-two">
            <Field label="ایمیل" name="salEmail" className="is-ltr" dir="ltr" value={form.email} onChange={set("email")} placeholder="info@mysalon.com" />
            <Field label="واتساپ" name="salWhatsapp" className="is-ltr" dir="ltr" value={form.whatsapp} onChange={set("whatsapp")} placeholder="+989120000000" />
            <Field label="اینستاگرام" name="salInsta" className="is-ltr" dir="ltr" value={form.instagram} onChange={set("instagram")} placeholder="instagram.com/mysalon" />
            <Field label="وب‌سایت" name="salWeb" className="is-ltr" dir="ltr" value={form.website} onChange={set("website")} placeholder="mysalon.com" />
          </div>
        </div>
      ) : null}

      {pane === "images" ? (
        <div className="mini-card" style={{ marginTop: 12 }}>
          <div className="mini-option-sub" style={{ lineHeight: 1.9 }}>
            لوگو و بنر بلافاصله ذخیره می‌شوند و در صفحهٔ عمومی سالن به کار می‌روند. سقف حجم تصویر {sizeHintFa(maxMb)} است.
          </div>
          <div className="dash-two" style={{ marginTop: 10 }}>
            <div>
              <div className="dash-frame">{logoUrl ? <img src={logoUrl} alt="لوگوی سالن" /> : <Icon name="store" size={22} />}</div>
              <label className="mini-btn soft tiny dash-upload">
                {uploading === "logo" ? "در حال بارگذاری…" : "انتخاب لوگو"}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  disabled={uploading !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void pickImage("logo", f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <div>
              <div className="dash-frame">{bannerUrl ? <img src={bannerUrl} alt="بنر سالن" /> : <Icon name="camera" size={22} />}</div>
              <label className="mini-btn soft tiny dash-upload">
                {uploading === "banner" ? "در حال بارگذاری…" : "انتخاب بنر"}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  disabled={uploading !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void pickImage("banner", f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>

          <div className="dash-subhead">
            <SectionTitle title="گالری نمونه‌کارها" hint={`${faDigits(imgTotal)} تصویر`} />
          </div>
          {gallery.length === 0 ? (
            <div className="mini-note">هنوز نمونه‌کاری بارگذاری نشده است؛ اولین تصویر را همین‌جا اضافه کنید.</div>
          ) : (
            <div className="dash-img-grid">
              {gallery.map((g) => (
                <div key={g.id} className="dash-img">
                  <img src={g.imageUrl} alt={g.title ?? "نمونه‌کار"} loading="lazy" />
                  <button type="button" className="dash-img-del" onClick={() => void removeItem(g.id)} aria-label="حذف تصویر">
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {imgTotalPages > 1 ? (
            <div className="dash-pager">
              <button type="button" className="mini-btn soft tiny" disabled={imgPage <= 1} onClick={() => setImgPage((p) => Math.max(1, p - 1))}>
                قبلی
              </button>
              <span>
                صفحه {faDigits(imgPage)} از {faDigits(imgTotalPages)}
              </span>
              <button type="button" className="mini-btn soft tiny" disabled={imgPage >= imgTotalPages} onClick={() => setImgPage((p) => Math.min(imgTotalPages, p + 1))}>
                بعدی
              </button>
            </div>
          ) : null}

          <div style={{ marginTop: 10 }}>
            <Field label="عنوان تصویر (اختیاری)" name="galTitle" value={imgTitle} onChange={(e) => setImgTitle(e.target.value)} maxLength={80} />
          </div>
          <label className="mini-btn tiny dash-upload" style={{ marginTop: 10 }}>
            {uploading === "gallery" ? "در حال بارگذاری…" : "افزودن نمونه‌کار"}
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              disabled={uploading !== null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickImage("gallery", f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      ) : null}

      {pane === "map" ? (
        <div className="mini-card" style={{ marginTop: 12 }}>
          <div className="mini-option-sub" style={{ lineHeight: 1.9 }}>
            مختصات و لینک‌های نقشه در صفحهٔ عمومی سالن نشان داده می‌شوند. اگر فقط آدرس را پر کنید، پیش‌نمایش همان آدرس ساخته می‌شود.
          </div>
          <div className="dash-two" style={{ marginTop: 10 }}>
            <Field label="عرض جغرافیایی (lat)" name="salLat" className="is-ltr" dir="ltr" value={form.latitude} onChange={set("latitude")} placeholder="35.70" />
            <Field label="طول جغرافیایی (lng)" name="salLng" className="is-ltr" dir="ltr" value={form.longitude} onChange={set("longitude")} placeholder="51.40" />
          </div>
          <div style={{ marginTop: 10 }}>
            <Field label="لینک گوگل‌مپ" name="salMap" className="is-ltr" dir="ltr" value={form.mapUrl} onChange={set("mapUrl")} placeholder="https://maps.google.com/..." />
          </div>
          <div className="dash-two" style={{ marginTop: 10 }}>
            <Field label="بلد" name="salBalad" className="is-ltr" dir="ltr" value={form.baladUrl} onChange={set("baladUrl")} placeholder="https://balad.ir/..." />
            <Field label="نشان" name="salNeshan" className="is-ltr" dir="ltr" value={form.neshanUrl} onChange={set("neshanUrl")} placeholder="https://neshan.org/..." />
          </div>
          {hasAddress ? (
            <>
              <div className="mini-actions" style={{ marginTop: 12 }}>
                <a className="mini-btn tiny" href={`https://maps.google.com/?q=${mapQuery}`} target="_blank" rel="noopener noreferrer">
                  <Icon name="pin" size={15} />
                  یافتن موقعیت
                </a>
                <button type="button" className="mini-btn soft tiny" onClick={() => navigate("/help#owner")}>
                  راهنما
                </button>
              </div>
              <iframe
                title="پیش‌نمایش موقعیت سالن"
                className="dash-map"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://maps.google.com/maps?q=${mapQuery}&z=15&output=embed`}
              />
            </>
          ) : null}
        </div>
      ) : null}

      <div className="dash-sticky">
        <div className="mini-actions">
          <Button variant="primary" loading={saving} disabled={saving || !dirty} onClick={() => void save()} className="dash-grow">
            <Icon name="check" size={17} />
            {saving ? "در حال ذخیره…" : dirty ? "ذخیرهٔ تغییرات" : "تغییری ثبت نشده"}
          </Button>
          {dirty ? (
            <Button variant="ghost" disabled={saving} onClick={() => setForm(formFromSalon(salon))}>
              بازگردانی
            </Button>
          ) : null}
        </div>
      </div>

      <SectionTitle title="بخش‌های مرتبط" hint="همین سالن در داشبورد مینی" />

      <div className="dash-tiles" style={{ marginTop: 10 }}>
          <button type="button" className="dash-tile" onClick={() => navigate("/dash/settings")}>
            <span className="dash-tile-icon">
              <Icon name="clock" size={18} />
            </span>
            <span className="dash-tile-title">ساعات کاری و قوانین رزرو</span>
            <span className="dash-tile-sub">بافر، بیعانه و دامنهٔ اختصاصی</span>
          </button>
          <button type="button" className="dash-tile" onClick={() => navigate("/dash/services")}>
            <span className="dash-tile-icon">
              <Icon name="scissors" size={18} />
            </span>
            <span className="dash-tile-title">خدمات و پکیج‌ها</span>
            <span className="dash-tile-sub">مدت و قیمت هر خدمت</span>
          </button>
          <button type="button" className="dash-tile" onClick={() => navigate("/dash/staff")}>
            <span className="dash-tile-icon">
              <Icon name="users" size={18} />
            </span>
            <span className="dash-tile-title">کارکنان و شیفت</span>
            <span className="dash-tile-sub">کمیسیون و برنامهٔ هفتگی</span>
          </button>
          <button type="button" className="dash-tile" onClick={() => navigate("/dash/management")}>
            <span className="dash-tile-icon">
              <Icon name="store" size={18} />
            </span>
            <span className="dash-tile-title">شعبه، تعطیلات و کمپین</span>
            <span className="dash-tile-sub">مدیریت سالن</span>
          </button>
      </div>

      {payload?.snap ? (
        <div style={{ marginTop: 14 }}>
          <PlanMeters snap={payload.snap} planLabel={payload.snap.planLabel} />
        </div>
      ) : null}

      <div style={{ marginTop: 12 }}>
        <Button variant="soft" onClick={() => navigate("/dash/packages")}>
          <Icon name="ticket" size={17} />
          ارتقای پلن و تمدید اشتراک
        </Button>
      </div>

      <div className="dash-section-note" style={{ marginTop: 14 }}>
        حذف کامل سالن در نسخهٔ وب و با تأیید پشتیبانی انجام می‌شود؛ این‌جا فقط اطلاعات نمایشی سالن ویرایش می‌شود و نوبت‌های ثبت‌شده دست‌نخورده می‌مانند.
      </div>
    </div>
  );
}
