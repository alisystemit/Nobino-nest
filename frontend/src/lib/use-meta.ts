import { useEffect } from "react";

/** تنظیم عنوان سند + توضیح meta — معادل metadata در Server Componentها (برای SPA) */
export function useMeta(title?: string, description?: string) {
  useEffect(() => {
    if (title) document.title = title;
    if (description) {
      let el = document.querySelector('meta[name="description"]');
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", "description");
        document.head.appendChild(el);
      }
      el.setAttribute("content", description);
    }
  }, [title, description]);
}
