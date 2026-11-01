"use client";

import { useRouter } from "@/router-shim";

/** دکمه خروج از حساب: نشست سرور را حذف و کوکی را پاک می‌کند. */
export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } finally {
          router.push("/");
          router.refresh();
        }
      }}
      className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-neutral-500 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
    >
      خروج
    </button>
  );
}
