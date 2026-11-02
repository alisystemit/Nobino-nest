/**
 * اطلاعیه‌های داخل‌برنامه‌ای — همان دادهٔ /api/notifications که مینی‌اپ و زنگولهٔ
 * پنل وب نشان می‌دهند، با پوستهٔ داشبورد و دکمهٔ «خوانده شد همه».
 */
import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Icon, SectionTitle, SkeletonList } from "@/mini/components/ui";
import { NOTIFICATION_TITLE, type MiniNotification } from "@/mini/lib/types";
import { faDigits, fromNow } from "@/mini/lib/format";
import { dapi } from "../lib/api";
import { useDash } from "../lib/store";

export default function DashNotifications() {
  const { me, toast } = useDash();
  const [items, setItems] = useState<MiniNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await dapi<{ success: boolean; notifications?: MiniNotification[]; total?: number; unread?: number }>("/api/notifications?limit=50");
    setItems(res.ok ? res.data?.notifications ?? [] : []);
    setTotal(Number(res.data?.total ?? 0));
    setUnread(Number(res.data?.unread ?? 0));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (me) void load();
    else setLoading(false);
  }, [me, load]);

  async function markAll() {
    const res = await dapi<{ success: boolean; error?: string }>("/api/notifications", { method: "PATCH", body: JSON.stringify({}) });
    if (!res.ok) {
      toast(res.data?.error || "علامت‌گذاری ممکن نشد", "error");
      return;
    }
    toast("همه اطلاعیه‌ها خوانده شد", "ok");
    await load();
  }

  if (!me) {
    return (
      <div className="mini-fade">
        <EmptyState text="برای دیدن اطلاعیه‌ها وارد شوید." />
      </div>
    );
  }

  return (
    <div className="mini-fade">
      <div className="dash-toolbar">
        <SectionTitle title="اطلاعیه‌ها" hint={unread ? `${faDigits(unread)} ناخوانده از ${faDigits(total)}` : `${faDigits(total)} مورد`} />
        <div style={{ marginInlineStart: "auto" }}>
          <Button variant="ghost" onClick={() => void load()}>
            <Icon name="refresh" size={17} />
            نوسازی
          </Button>
        </div>
      </div>

      {loading ? (
        <SkeletonList count={4} />
      ) : items.length === 0 ? (
        <EmptyState text="اطلاعیه‌ای ندارید." hint="پیام‌های ثبت و تغییر نوبت اینجا می‌آید." />
      ) : (
        <>
          <div className="mini-list">
            {items.map((n) => (
              <div key={n.id} className={`mini-item${n.readAt ? "" : " is-on"}`}>
                <span className="mini-item-main">
                  <span className="mini-item-title">{NOTIFICATION_TITLE[n.type] ?? n.type}</span>
                  <span className="mini-item-sub">{n.payload?.message ?? "—"}</span>
                  <span className="mini-item-sub">{fromNow(n.createdAt)}</span>
                </span>
                {n.readAt ? (
                  <Icon name="check" size={16} />
                ) : (
                  <span className="mini-badge is-requested">ناخوانده</span>
                )}
              </div>
            ))}
          </div>
          {unread > 0 ? (
            <div style={{ marginTop: 12 }}>
              <Button onClick={markAll}>علامت‌گذاری همه به‌عنوان خوانده‌شده</Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
