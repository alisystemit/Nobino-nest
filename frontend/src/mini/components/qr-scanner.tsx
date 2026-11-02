/**
 * اسکنر کیو‌آر داخل وب‌اپ — «افزودن سالن» را خودکار می‌کند: دکمهٔ باز کردن
 * دوربین، همین شیت تمام‌صفحه را با `getUserMedia` باز می‌کند و هر فریم را با
 * پردازش تصویر می‌خواند:
 *   ۱) `jsqr` (کتابخانهٔ سبک، محلی و بدون هیچ درخواست شبکه) هر فریم را decode
 *      می‌کند؛ اگر کیو‌آر پیدا شد، متن آن (معمولاً لینک سالن) به `onResult`
 *      داده می‌شود تا در کادر لینک بنشیند و افزودن اجرا شود.
 *   ۲) اگر مرورگر `BarcodeDetector` بومی داشته باشد (کروم اندروید)، پس از چند
 *      فریم بی‌نتیجه از همان دیکودر سخت‌افزاری هم کمک می‌گیریم.
 * بستن شیت (دکمه، Esc، یا بک‌دراپ) دسترسی دوربین را آزاد می‌کند.
 * حلقهٔ خواندن با setTimeout خود-برنامه‌ریز کار می‌کند، نه requestAnimationFrame،
 * تا اگر صفحه در پس‌زمینه رفت اسکن قطع نشود.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Icon } from "./ui";

/** حداکثر طول ضلع فریمِ ارسالی به jsqr؛ بزرگ‌تر از این برای کیو‌آرِ سالن لازم نیست */
const MAX_EDGE = 640;
/** فاصلهٔ بین فریم‌های خوانده‌شده (میلی‌ثانیه) */
const FRAME_GAP = 70;

type BarcodeDetectorLike = {
  detect: (source: unknown) => Promise<{ rawValue?: string; format?: string }[]>;
};

function makeDetector(): BarcodeDetectorLike | null {
  const Ctor = (window as unknown as { BarcodeDetector?: new (o?: { formats?: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

function errorText(err: unknown): string {
  const name = (err as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "دسترسی به دوربین داده نشد. از تنظیمات مرورگر دوربین را اجازه بدهید و دوباره بزنید.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "دوربینی برای این صفحه پیدا نشد؛ لینک سالن را دستی وارد کنید.";
  }
  if (name === "NotReadableError") {
    return "دوربین توسط برنامهٔ دیگری اشغال شده است؛ آن را ببندید و دوباره تلاش کنید.";
  }
  if (name === "SecurityError") {
    return "دوربین فقط روی نشانی امن (https) کار می‌کند.";
  }
  return "باز کردن دوربین ممکن نشد؛ لینک سالن را دستی وارد کنید.";
}

/** آیا این مرورگر اصلاً می‌تواند دوربین باز کند (برای مخفی کردن دکمه) */
export function cameraScanSupported(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext;
}

export default function QrScanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  /** برای اینکه یک کد دو بار پشت سر هم report نشود */
  const lastSeenRef = useRef("");
  /** فقط وقتی کاربر شیت را بسته (یا کد پیدا شده) true می‌شود؛ cleanup ری‌اکت به آن کار ندارد */
  const closedRef = useRef(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState("");
  const [found, setFound] = useState(false);
  const [multiCam, setMultiCam] = useState(false);

  /** آزاد کردن جریان دوربین (با StrictMode و remount دوبار اجرا می‌شود؛ بی‌ضرر) */
  const releaseCamera = useCallback(() => {
    for (const t of streamRef.current?.getTracks() ?? []) t.stop();
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      try {
        video.pause();
      } catch {
        /* بی‌خیال */
      }
      video.srcObject = null;
    }
  }, []);

  const close = useCallback(() => {
    closedRef.current = true;
    releaseCamera();
    onClose();
  }, [onClose, releaseCamera]);

  /* ── باز کردن دوربین ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!cameraScanSupported()) {
      setError(window.isSecureContext ? "مرورگر شما دسترسی به دوربین را پشتیبانی نمی‌کند؛ لینک را دستی وارد کنید." : "برای استفاده از دوربین، صفحه باید روی https باز شود.");
      setStarting(false);
      return;
    }
    let cancelled = false;
    const controls = navigator.mediaDevices as MediaDevices & {
      enumerateDevices?: () => Promise<{ kind: string }[]>;
    };
    void (async () => {
      setError("");
      setStarting(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled || closedRef.current) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            /* بعضی مرورگرها play را reject می‌کنند؛ فریم‌ها بازم می‌آیند */
          }
        }
        detectorRef.current = makeDetector();
        try {
          const cams = (await controls.enumerateDevices?.()) ?? [];
          setMultiCam(cams.filter((d) => d.kind === "videoinput").length > 1);
        } catch {
          setMultiCam(false);
        }
        setStarting(false);
      } catch (err) {
        if (!cancelled) {
          setError(errorText(err));
          setStarting(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      releaseCamera();
    };
  }, [facing, releaseCamera]);

  /* ── Esc برای بستن (دسکتاپ) ──────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  /* ── حلقهٔ خواندن فریم‌ها ─────────────────────────────────────────── */
  useEffect(() => {
    if (starting || error) return;
    closedRef.current = false;
    let timer = 0;
    let busy = false;
    let misses = 0;

    const report = (text: string) => {
      const value = text.trim();
      if (!value || value === lastSeenRef.current || closedRef.current) return;
      lastSeenRef.current = value;
      closedRef.current = true;
      setFound(true);
      try {
        navigator.vibrate?.(60);
      } catch {
        /* ویبره اختیاری است */
      }
      window.setTimeout(() => {
        releaseCamera();
        onResult(value);
      }, 320);
    };

    const frameFromVideo = (): ImageData | null => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) return null;
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
      const w = Math.max(8, Math.round(video.videoWidth * scale));
      const h = Math.max(8, Math.round(video.videoHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, w, h);
      try {
        return ctx.getImageData(0, 0, w, h);
      } catch {
        return null;
      }
    };

    const tick = () => {
      timer = 0;
      if (busy || closedRef.current) return;
      busy = true;
      try {
        const image = frameFromVideo();
        if (image) {
          const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
          if (code?.data) {
            report(code.data);
            return;
          }
          misses += 1;
          const detector = detectorRef.current ?? (misses === 12 ? (detectorRef.current = makeDetector()) : null);
          if (detector && misses % 6 === 0 && !closedRef.current) {
            const video = videoRef.current;
            if (video) {
              detector
                .detect(video)
                .then((codes) => {
                  const value = codes?.find((c) => c.rawValue)?.rawValue;
                  if (value) report(value);
                })
                .catch(() => {
                  detectorRef.current = null;
                });
            }
          }
        }
      } finally {
        busy = false;
        if (!closedRef.current) timer = window.setTimeout(tick, FRAME_GAP);
      }
    };

    timer = window.setTimeout(tick, FRAME_GAP);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [starting, error, onResult, releaseCamera]);

  return (
    <div className="mini-qr" role="dialog" aria-modal="true" aria-label="اسکن کیو‌آر سالن">
      <video ref={videoRef} className="mini-qr-video" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="mini-qr-canvas" aria-hidden="true" />

      <div className="mini-qr-shade" />

      <div className={`mini-qr-frame${found ? " is-found" : ""}`} aria-hidden="true">
        <i className="c1" />
        <i className="c2" />
        <i className="c3" />
        <i className="c4" />
        {!found && !error ? <span className="mini-qr-line" /> : null}
      </div>

      <div className="mini-qr-top">
        <button type="button" className="mini-qr-btn" onClick={close} aria-label="بستن دوربین">
          <Icon name="close" size={18} />
        </button>
        <div className="mini-qr-title">اسکن کیو‌آر سالن</div>
        {multiCam ? (
          <button
            type="button"
            className="mini-qr-btn"
            onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
            aria-label="تغییر دوربین"
          >
            <Icon name="camera" size={18} />
          </button>
        ) : (
          <span className="mini-qr-btn is-ghost" aria-hidden="true" />
        )}
      </div>

      <div className="mini-qr-bottom">
        {error ? (
          <>
            <p className="mini-qr-msg is-error">{error}</p>
            <button type="button" className="mini-btn tiny" onClick={onClose}>
              بستن
            </button>
          </>
        ) : (
          <p className="mini-qr-msg">
            {found ? "پیدا شد!" : starting ? "در حال باز کردن دوربین…" : "کیو‌آر روی کارت سالن را وسط کادر نگه دارید."}
          </p>
        )}
      </div>
    </div>
  );
}
