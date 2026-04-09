import { useCallback } from "react";

export function usePasteHelpers() {
  const sanitizeClipboard = useCallback((htmlData: string, textData: string) => {
    const raw = (textData || (() => {
      if (!htmlData) return "";
      const t = document.createElement("div");
      t.innerHTML = htmlData;
      t.querySelectorAll("script,style,meta,link").forEach(n => n.remove());
      return t.innerText || t.textContent || "";
    })()).replace(/\r\n/g, "\n");
    if (!raw) return "";
    return raw
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .split("\n")
      .map((line) => `<span style="color:#000000 !important;background:transparent !important;opacity:1 !important;-webkit-text-fill-color:#000000 !important;filter:none !important;mix-blend-mode:normal !important;">${line || "&nbsp;"}</span>`)
      .join("<br>");
  }, []);

  const forcePastedTextVisible = useCallback((html: string, color = "#000000") => {
    const visibleColor = color;
    return html
      .replace(/color\s*:[^;\"]+;?/gi, "")
      .replace(/background(?:-color)?\s*:[^;\"]+;?/gi, "")
      .replace(/-webkit-text-fill-color\s*:[^;\"]+;?/gi, "")
      .replace(/opacity\s*:[^;\"]+;?/gi, "")
      .replace(/mix-blend-mode\s*:[^;\"]+;?/gi, "")
      .replace(/<span\b([^>]*)>/gi, `<span$1 style="color:${visibleColor} !important;background:transparent !important;opacity:1 !important;-webkit-text-fill-color:${visibleColor} !important;mix-blend-mode:normal !important;">`)
      .replace(/<font\b([^>]*)color=(['\"])[^'\"]*\2([^>]*)>/gi, `<font$1$3>`);
  }, []);

  return { sanitizeClipboard, forcePastedTextVisible };
}
