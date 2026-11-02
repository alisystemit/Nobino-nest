import { useEffect, useState } from "react";
import { Icon } from "./ui";
import { useMini } from "../lib/store";
import { faDigits } from "../lib/format";
import {
  installDismissedRecently,
  markInstallDismissed,
  miniInstallSteps,
  onMiniInstallSheetRequested,
  rememberMiniLaunchPath,
  useMiniInstall,
} from "../lib/install";

export default function MiniInstallSheet() {
  const { platform, config, configReady, toast } = useMini();
  const { support, device, installed, secureContext, lastOutcome, install } = useMiniInstall();
  const [open, setOpen] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  const isWebVisitor = platform === "web";
  const brand = config.brand.title || "نوبینو";

  useEffect(() => {
    if (!isWebVisitor || !configReady || installed) return;
    if (installDismissedRecently()) return;
    const timer = window.setTimeout(() => setOpen(true), 1200);
    return () => window.clearTimeout(timer);
  }, [isWebVisitor, configReady, installed]);

  useEffect(() => onMiniInstallSheetRequested(() => setOpen(true)), []);

  if (!isWebVisitor || !configReady || installed || !open) return null;

  const close = () => setOpen(false);
  const dismiss = () => {
    markInstallDismissed();
    close();
  };

  async function handleInstall() {
    if (support !== "installable") {
      setShowSteps(true);
      return;
    }
    const outcome = await install();
    if (outcome === "accepted") {
      rememberMiniLaunchPath();
      setShowSteps(false);
      close();
      toast(`${brand} نصب شد`, "ok");
      return;
    }
    if (outcome === "dismissed") setShowSteps(true);
  }

  return (
    <>
      <div className="mini-sheet-backdrop" onClick={dismiss} />
      <div className="mini-sheet mini-fade" role="dialog" aria-modal="true" aria-label={`نصب ${brand}`}>
        <div className="mini-sheet-grabber" />

        <button
          type="button"
          onClick={close}
          aria-label="بستن"
          style={{
            position: "absolute",
            top: 12,
            insetInlineStart: 12,
            width: 30,
            height: 30,
            borderRadius: 10,
            border: "1px solid var(--m-line)",
            background: "var(--m-card)",
            color: "var(--m-muted)",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
          }}
        >
          <Icon name="close" size={15} />
        </button>

        <div style={{ display: "grid", placeItems: "center", margin: "6px 0 12px" }}>
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 22,
              overflow: "hidden",
              background: "var(--m-card)",
              border: "1px solid var(--m-line)",
              boxShadow: "0 14px 26px -16px rgba(0, 0, 0, 0.45)",
              display: "grid",
              placeItems: "center",
              color: "rgb(var(--m-rgb))",
              fontSize: 30,
              fontWeight: 900,
            }}
          >
            <img
              src="/icons/icon-192.png"
              alt=""
              width={76}
              height={76}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={(e) => {
                /* آیکون نبود، حرف اول برند جایش می‌نشیند تا شیت بی‌تصویر نماند */
                const box = e.currentTarget.parentElement;
                e.currentTarget.remove();
                if (box) box.textContent = brand.slice(0, 1);
              }}
            />
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 17, fontWeight: 900, lineHeight: 1.7 }}>{`${brand} را روی گوشی نصب کن`}</div>
          <div className="mini-option-sub" style={{ lineHeight: 1.9 }}>
            مثل یک اپ، سریع و مستقیم وارد نوبت‌ها و مشتری‌هایت شو.
          </div>
        </div>

        {showSteps && (
          <div className="mini-note" style={{ margin: "12px 0 4px" }}>
            {!secureContext && (
              <div style={{ fontWeight: 800, color: "#92610a", marginBottom: 6 }}>
                برای نصب خودکار، آدرس را با https باز کنید — روی HTTP خالص مرورگر اجازهٔ نصب نمی‌دهد.
              </div>
            )}
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
              {miniInstallSteps(device, brand).map((step, i) => (
                <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span
                    style={{
                      flex: "0 0 20px",
                      width: 20,
                      height: 20,
                      borderRadius: 999,
                      background: "rgb(var(--m-rgb))",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 900,
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    {faDigits(i + 1)}
                  </span>
                  <span style={{ flex: 1 }}>{step}</span>
                </li>
              ))}
            </ol>
            {lastOutcome === "dismissed" && (
              <div style={{ marginTop: 8 }}>{`درخواست نصب بسته شد؛ هر وقت خواستید دوباره «نصب ${brand}» را بزنید.`}</div>
            )}
            <button type="button" className="mini-btn ghost tiny" style={{ marginTop: 10 }} onClick={() => setShowSteps(false)}>
              مخفی کردن راهنما
            </button>
          </div>
        )}

        <div style={{ height: 14 }} />
        <button type="button" className="mini-btn" onClick={() => void handleInstall()}>
          {`نصب ${brand}`}
        </button>
        <div style={{ height: 8 }} />
        <button type="button" className="mini-btn ghost" onClick={dismiss}>
          فعلاً نه
        </button>
      </div>
    </>
  );
}
