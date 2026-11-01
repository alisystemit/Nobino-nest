/** حساب من — معادل src/app/dashboard/account/page.tsx */
import { UserRound } from "lucide-react";
import { useAuth } from "@/auth";
import DashboardShell from "@/components/DashboardShell";
import AccountPanel from "@/components/AccountPanel";
import { PanelCard } from "@/components/ui/Stats";

export default function DashboardAccount() {
  const { me } = useAuth();
  if (!me) return null;

  return (
    <DashboardShell role={me.role} title="حساب من">
      <div className="mx-auto max-w-5xl">
        <PanelCard
          title="پروفایل و تنظیمات حساب"
          subtitle="نوبت‌ها، تاریخچه مراجعات، علاقه‌مندی‌ها، نظرات و امنیت حساب شما در یک‌جا."
          icon={<UserRound className="h-5 w-5" />}
          bodyClassName="p-4 sm:p-5"
        >
          <AccountPanel
            initialMe={{
              id: me.id,
              phone: me.phone,
              name: me.name,
              email: me.email,
              avatarUrl: me.avatarUrl ?? null,
              role: me.role,
            }}
          />
        </PanelCard>
      </div>
    </DashboardShell>
  );
}
