"use client";

import { useState } from "react";

/** دستیار هوشمند نوبت‌دهی (پاسخ‌گویی درباره خدمات/قیمت/قوانین) */
export default function AssistantChat({ salonId }: { salonId: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([
    { role: "ai", text: "سلام! می‌توانم درباره خدمات، قیمت‌ها و قوانین رزرو کمک کنم. سؤال بپرسید." },
  ]);

  async function send() {
    const q = input.trim();
    if (!q) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salonId, question: q }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "ai", text: data.reply ?? "متوجه نشدم." }]);
    } catch {
      setMessages((m) => [...m, { role: "ai", text: "خطا در ارتباط." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* دکمه شناور */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 left-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-pink-600 text-2xl text-white shadow-xl transition hover:bg-pink-700"
        aria-label="دستیار هوشمند"
      >
        {open ? "✕" : "🤖"}
      </button>

      {open && (
        <div className="fixed bottom-24 left-5 z-50 flex h-[420px] w-[320px] flex-col rounded-3xl border border-neutral-200 bg-white shadow-2xl">
          <div className="rounded-t-3xl bg-gradient-to-l from-pink-600 to-purple-600 px-4 py-3 text-white">
            <div className="font-bold">دستیار هوشمند</div>
            <div className="text-xs text-white/80">پاسخ‌گویی درباره خدمات و قوانین</div>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {messages.map((m, i) => (
              <div key={i} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "mr-auto bg-pink-600 text-white" : "bg-neutral-100 text-neutral-800"}`}>
                {m.text}
              </div>
            ))}
            {loading && <div className="bg-neutral-100 rounded-2xl px-3 py-2 text-sm text-neutral-400">در حال فکر کردن...</div>}
          </div>
          <div className="flex gap-2 border-t border-neutral-200 p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="سؤال خود را بنویسید..."
              className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-pink-500"
            />
            <button onClick={send} disabled={loading || !input.trim()} className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-bold text-white hover:bg-neutral-800 disabled:opacity-50">
              ارسال
            </button>
          </div>
        </div>
      )}
    </>
  );
}
