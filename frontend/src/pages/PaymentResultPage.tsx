/** صفحهٔ نتیجهٔ پرداخت — معادل src/app/payment/result/page.tsx (پارامترها از query) */
import { Link, useSearchParams } from "@/router-shim";
import { toPersianDigits } from "@/lib/utils";

export default function PaymentResultPage() {
  const sp = useSearchParams();
  const success = sp.get("status") === "success";
  const ref = sp.get("ref") ?? "";
  const reason = sp.get("reason") ?? "پرداخت انجام نشد";

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-8 text-center shadow-xl">
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
      </div>
    </main>
  );
}
