/**
 * اطلاعیه‌های داخل‌برنامه‌ای — `GET /api/notifications` (فقط channel=IN_APP) و
 * «خواندن همه» با `PATCH /api/notifications`. متن هر اعلان در `payload.message`
 * است (ستون message در مدل Notification وجود ندارد).
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import LoginSheet from "../components/login-sheet";
import { Button, EmptyState, Icon, SectionTitle, SkeletonList, type IconName } from "../components/ui";
import { faDigits, fromNow } from "../lib/format";
import { mapi, useMini } from "../lib/store";
import { NOTIFICATION_TITLE, type MiniNotification } from "../lib/types";

const PAGE_SIZE = 20;

const ICON_BY_TYPE: Record<string, IconName> = {
  APPOINTMENT_CONFIRM: "calendar",
  APPOINTMENT_CHANGED: "clock",
  APPOINTMENT_CANCELLED: "close",
  CANCEL: "close",
  APPOINTMENT_STATUS: "check",
  REMINDER: "bell",
  SUBSCRIPTION: "wallet",
  OTP: "user",
};

export default function MiniNotifications() {
  const navigate = useNavigate();
  const { me, authReady, toast } = useMini();
  const [items, setItems] = useState<MiniNotification[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [marking, setMarking] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const load = useCallback(
    async (targetPage: number, replace: boolean) => {
      if (replace) setLoading(true);
      else setLoadingMore(true);
      const res = await mapi<{
        success: boolean;
        notifications?: MiniNotification[];
        unread?: number;
        totalPages?: number;
      }>(`/api/notifications?limit=${PAGE_SIZE}&page=${targetPage}`);
      const rows = Array.isArray(res.data?.notifications) ? res.data.notifications : [];
      setItems((prev) => (replace ? rows : [...prev, ...rows]));
      setUnread(res.data?.unread ?? 0);
      setTotalPages(res.data?.totalPages ?? 1);
      setPage(targetPage);
      if (replace) setLoading(false);
      else setLoadingMore(false);
    },
    []
  );

  useEffect(() => {
    if (!authReady) return;
    if (!me) {
      setItems([]);
      setLoading(false);
      return;
    }
    void load(1, true);
  }, [authReady, me, load]);

  async function markAll() {
    setMarking(true);
    const res = await mapi<{ success: boolean; error?: string }>("/api/notifications", { method: "PATCH", body: "{}" });
    setMarking(false);
    if (!res.ok) {
      toast(res.data?.error || "خوانده نشد", "error");
      return;
    }
    setItems((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    setUnread(0);
    toast("همه اطلاعیه‌ها خوانده شد", "ok");
  }

  if (authReady && !me) {
    return (
      <div className="mini-fade">
        <EmptyState text="برای دیدن اطلاعیه‌ها وارد شوید." hint="اعلان‌های نوبت (تأیید، یادآوری، تغییر وقت) این‌جا می‌آیند." />
        <Button onClick={() => setLoginOpen(true)}>ورود</Button>
        <LoginSheet open={loginOpen} onClose={() => setLoginOpen(false)} />
      </div>
    );
  }

  return (
    <div className="mini-fade">
      <SectionTitle
        title="اطلاعیه‌ها"
        hint={loading ? "" : unread ? `${faDigits(unread)} ناخوانده` : "همه خوانده شده"}
        action={
          unread > 0 ? (
            <button type="button" className="mini-more" disabled={marking} onClick={() => void markAll()}>
              {marking ? "در حال…" : "خواندن همه"}
            </button>
          ) : null
        }
      />

      {loading ? (
        <SkeletonList count={3} />
      ) : items.length === 0 ? (
        <EmptyState text="هنوز اطلاعیه‌ای برای شما ننوشته‌ایم." hint="بعد از ثبت یا تغییر نوبت، پیام‌ها همین‌جا می‌آید." />
      ) : (
        <div className="mini-list">
          {items.map((n) => {
            const message = n.payload?.message || "—";
            return (
              <div key={n.id} className={`mini-card mini-notif${n.readAt ? "" : " is-unread"}`}>
                <span className="mini-notif-mark">
                  <Icon name={ICON_BY_TYPE[n.type] ?? "bell"} size={17} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 900 }}>{NOTIFICATION_TITLE[n.type] ?? n.type}</div>
                  <div className="mini-option-sub" style={{ marginTop: 3, lineHeight: 1.9 }}>
                    {message}
                  </div>
                  <div className="mini-notif-time">{fromNow(n.createdAt)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {page < totalPages ? (
        <div style={{ marginTop: 12 }}>
          <button type="button" className="mini-btn soft" disabled={loadingMore} onClick={() => void load(page + 1, false)}>
            {loadingMore ? "در حال بارگذاری…" : "اطلاعیه‌های قدیمی‌تر"}
          </button>
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <Button variant="ghost" onClick={() => navigate("/mini/appointments")}>
          <Icon name="calendar" size={17} />
          نوبت‌های من
        </Button>
      </div>
    </div>
  );
}
