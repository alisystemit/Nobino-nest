/** ورود سوپرادمین — معادل src/app/admin/login/page.tsx */
import { Navigate } from "@/next";
import AdminLoginForm from "@/components/AdminLoginForm";
import { useAuth } from "@/auth";
import { useMeta } from "@/lib/use-meta";

export default function AdminLoginPage() {
  const { me, loading } = useAuth();
  useMeta("ورود سوپرادمین");

  if (loading) {
    return <main className="flex min-h-[60vh] items-center justify-center text-neutral-500">در حال بارگذاری…</main>;
  }
  if (me?.role === "ADMIN") return <Navigate to="/admin" replace />;
  // کاربر غیرادمین که لاگین کرده به ورود عادی می‌رود تا رمز ادمین حدس زده نشود
  if (me) return <Navigate to="/dashboard" replace />;
  return <AdminLoginForm />;
}
