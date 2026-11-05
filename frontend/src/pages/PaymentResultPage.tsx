/** صفحهٔ نتیجهٔ پرداخت — معادل src/app/payment/result/page.tsx (پارامترها از query) */
import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "@/router-shim";
import { toPersianDigits } from "@/lib/utils";

export default function PaymentResultPage() {
  const sp = useSearchParams();
  const ref = sp.get("ref") ?? "";
  const reason = sp.get("reason") ?? "پرداخت انجام نشد";
  const orderId = sp.get("order") ?? "";

  // نتیجهٔ واقعی از سرور خوانده می‌شود؛ query کلاینت قابل جعل است.
  // (برای سفارش‌ها `order` همیشه در redirect هست؛ مسیرهای بدون سفارش مثل
  // فاکتور بی‌نام همان رفتار قبلی را با پارامتر status نگه می‌دارند.)
  const [serverStatus, setServerStatus] = useState<"loading" | "paid" | "notpaid">(orderId ? "loading" : "notpaid");
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    fetch(`/api/orders/${encodeURIComponent(orderId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setServerStatus(d.success && d.order?.status === "PAID" ? "paid" : "notpaid");
      })
      .catch(() => {
        if (!cancelled) setServerStatus("notpaid");
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const querySaysSuccess = sp.get("status") === "success";
  const success = orderId ? serverStatus === "paid" : querySaysSuccess;
  const verifying = orderId && serverStatus === "loading";

  // بعد از خرید موفق، اگر سالن نداشته باشد مستقیم به راه‌اندازی هدایت می‌شود
  const [redirectSetup, setRedirectSetup] = useState(false);
  useEffect(() => {
    if (!success) return;
    let cancelled = false;
    fetch("/api/salons")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success && (!d.salons || d.salons.length === 0)) setRedirectSetup(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [success]);

  if (redirectSetup) return <Navigate to="/dashboard/setup" replace />;

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-8 text-center shadow-xl">
        {verifying ? (
          <>
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-neutral-100 text-4xl">⏳</div>
            <h1 className="mt-6 text-2xl font-extrabold text-neutral-700">در حال بررسی وضعیت پرداخت...</h1>
            <p className="mt-3 text-neutral-600">نتیجهٔ سفارش از سرور بررسی می‌شود.</p>
          </>
        ) : (
          <>
            <div
              className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full text-4xl ${
                success ? "bg-emerald-100" : "bg-red-100"
              }`}
            >
              {success ? "✅" : "❌"}
            </div>
            <h1 className={`mt-6 text-2xl font-extrabold ${success ? "text-emerald-700" : "text-red-600"}`}>
              {success ? "پرداخت موفق" : "پرداخت ناموفق"}
            </h1>
            <p className="mt-3 text-neutral-600">
              {success
                ? "پرداخت شما با موفقیت انجام شد و به‌صورت خودکار ثبت گردید. از شما سپاسگزاریم."
                : orderId && !querySaysSuccess
                  ? "وضعیت این سفارش در سیستم تأیید نشده است. در صورت کسر وجه، تا ۷۲ ساعت آینده به حساب شما بازمی‌گردد."
                  : reason}
            </p>
            {success && ref && (
              <div className="mt-5 rounded-xl bg-neutral-50 p-4 text-sm">
                <span className="text-neutral-500">کد پیگیری: </span>
                <span className="font-bold text-neutral-800" dir="ltr">
                  {toPersianDigits(ref)}
                </span>
              </div>
            )}
            <Link
              href="/"
              className="mt-8 inline-block w-full rounded-xl bg-neutral-900 py-3.5 font-bold text-white transition hover:bg-neutral-800"
            >
              بازگشت به خانه
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
