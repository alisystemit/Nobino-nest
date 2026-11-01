/**
 * آیکون «آینه» (برند نوبینو) — جایگزین اموجی 🪞 که در برخی سیستم‌ها رندر نمی‌شود.
 * رنگ از currentColor ارث‌بری می‌شود.
 */
export default function SalonIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 1.8a7.2 7.2 0 0 1 7.2 7.2c0 3.7-2.8 6.7-6.4 7.06V18h3.2v2H8v-2h3.2v-1.94A7.22 7.22 0 0 1 4.8 9 7.2 7.2 0 0 1 12 1.8Zm0 2.4A4.8 4.8 0 0 0 7.2 9 4.8 4.8 0 0 0 12 13.8 4.8 4.8 0 0 0 16.8 9 4.8 4.8 0 0 0 12 4.2Zm0 2A2.8 2.8 0 0 1 14.8 9 2.8 2.8 0 0 1 12 11.8 2.8 2.8 0 0 1 9.2 9 2.8 2.8 0 0 1 12 6.2Z" />
    </svg>
  );
}
