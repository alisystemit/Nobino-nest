/**
 * پشتیبانی در مینی‌اپ — `POST /api/support` برای تیکت تازه و
 * `GET /api/support` برای تیکت‌های خود کاربر (پاسخ اپراتور با adminReply می‌آید).
 */
import { useCallback, useEffect, useState } from "react";
import LoginSheet from "../components/login-sheet";
import { Area, Button, Chip, EmptyState, Field, Icon, Row, SectionTitle, SkeletonList } from "../components/ui";
import { faDigits, fromNow } from "../lib/format";
import { mapi, useMini } from "../lib/store";
import { SUPPORT_CATEGORY_FA, TICKET_STATUS_FA, type SupportTicket } from "../lib/types";

const CATEGORIES = ["GENERAL", "BOOKING", "PAYMENT", "TECHNICAL", "COMPLAINT"];

export default function MiniSupport() {
  const { me, authReady, config, toast } = useMini();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);

  const [category, setCategory] = useState("GENERAL");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [newId, setNewId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await mapi<{ success: boolean; tickets?: SupportTicket[] }>("/api/support?limit=20");
    setTickets(Array.isArray(res.data?.tickets) ? res.data.tickets : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!me) {
      setLoading(false);
      return;
    }
    void load();
  }, [authReady, me, load]);

  async function submit() {
    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();
    if (cleanSubject.length < 3) {
      toast("موضوع را کامل‌تر بنویسید (حداقل ۳ حرف)", "error");
      return;
    }
    if (cleanMessage.length < 10) {
      toast("توضیح پیام باید حداقل ۱۰ حرف باشد", "error");
      return;
    }
    setBusy(true);
    const res = await mapi<{ success: boolean; error?: string; ticket?: SupportTicket }>("/api/support", {
      method: "POST",
      body: JSON.stringify({ subject: cleanSubject, category, message: cleanMessage, priority: "NORMAL" }),
    });
    setBusy(false);
    if (!res.ok) {
      toast(res.data?.error || "ارسال پیام ممکن نشد", "error");
      return;
    }
    setSubject("");
    setMessage("");
    setNewId(res.data.ticket?.id ?? "");
    toast("پیام شما برای پشتیبانی ثبت شد", "ok");
    await load();
  }

  if (authReady && !me) {
    return (
      <div className="mini-fade">
        <EmptyState text="برای ثبت تیکت وارد شوید." hint="اگر عجله دارید، با شمارهٔ پشتیبانی تماس بگیرید." />
        <Button onClick={() => setLoginOpen(true)}>ورود</Button>
        {config.brand.supportPhone ? (
          <a
            className="mini-btn ghost"
            style={{ marginTop: 10, textDecoration: "none" }}
            href={`tel:${config.brand.supportPhone}`}
            dir="ltr"
          >
            <Icon name="phone" size={17} />
            {faDigits(config.brand.supportPhone)}
          </a>
        ) : null}
        <LoginSheet open={loginOpen} onClose={() => setLoginOpen(false)} />
      </div>
    );
  }

  return (
    <div className="mini-fade">
      <SectionTitle title="پیام به پشتیبانی" hint="پاسخ را در همین صفحه می‌بینید" />
      <div className="mini-card">
        <div className="mini-chips">
          {CATEGORIES.map((c) => (
            <Chip key={c} on={category === c} onClick={() => setCategory(c)}>
              {SUPPORT_CATEGORY_FA[c] ?? c}
            </Chip>
          ))}
        </div>
        <Field label="موضوع" name="sup_subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="مثلاً نوبتم در لیست نیست" />
        <Area
          label="توضیح"
          name="sup_message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="هرچه دقیق‌تر بنویسید، زودتر جواب می‌گیرید. شمارهٔ نوبت یا سالن را هم ذکر کنید."
        />
        <Button onClick={submit} loading={busy}>
          <Icon name="send" size={17} />
          ارسال پیام
        </Button>
      </div>

      {config.brand.supportPhone ? (
        <a
          className="mini-btn soft"
          style={{ marginTop: 12, textDecoration: "none" }}
          href={`tel:${config.brand.supportPhone}`}
        >
          <Icon name="phone" size={17} />
          تماس سریع: {faDigits(config.brand.supportPhone)}
        </a>
      ) : null}

      <SectionTitle title="پیام‌های من" hint={loading ? "" : `${faDigits(tickets.length)} مورد`} />
      {loading ? (
        <SkeletonList count={2} />
      ) : tickets.length === 0 ? (
        <div className="mini-note">هنوز پیامی نفرستاده‌اید.</div>
      ) : (
        <div className="mini-list">
          {tickets.map((t) => (
            <div key={t.id} className={`mini-card${t.id === newId ? " mini-next" : ""}`} style={{ padding: 12 }}>
              <div className="mini-appt-head">
                <b style={{ fontSize: 13.5 }}>{t.subject}</b>
                <span className={`mini-pill${t.status === "CLOSED" ? " is-ok" : t.status === "IN_PROGRESS" ? " is-warn" : ""}`}>
                  {TICKET_STATUS_FA[t.status] ?? t.status}
                </span>
              </div>
              <div className="mini-option-sub" style={{ marginTop: 6, lineHeight: 1.9 }}>
                {t.message}
              </div>
              {t.adminReply ? (
                <div className="mini-card" style={{ padding: 10, marginTop: 10, background: "rgba(var(--m-rgb), 0.07)" }}>
                  <Row label="پاسخ پشتیبانی" value={fromNow(t.repliedAt ?? t.createdAt)} />
                  <p className="mini-option-sub" style={{ marginTop: 6, lineHeight: 1.9 }}>
                    {t.adminReply}
                  </p>
                </div>
              ) : null}
              <div className="mini-notif-time" style={{ marginTop: 8 }}>
                {SUPPORT_CATEGORY_FA[t.category] ?? t.category} · {fromNow(t.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
