/** Shared utilities for contract import */

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const normalizeSuggestedName = (fileName: string) =>
  fileName.replace(/\.[^.]+$/u, "");

export const preserveDocumentStructure = (html: string) => {
  const trimmed = html.trim();
  if (!trimmed) return trimmed;
  if (/contract-page|data-contract-page/iu.test(trimmed)) return trimmed;
  const bodyMatch = trimmed.match(/<body[^>]*>([\s\S]*)<\/body>/iu);
  const content = bodyMatch?.[1]?.trim() ?? trimmed;
  if (/<html[\s>]/iu.test(trimmed)) return trimmed;
  const pages = content
    .split(/<hr\b[^>]*>/giu)
    .map((page) => page.trim())
    .filter(Boolean);
  return pages
    .map(
      (page) =>
        `<section class="contract-page" data-contract-page="true"><div class="contract-page__content">${page}</div></section>`,
    )
    .join("");
};

export const sanitizeImportedHtml = (html: string) => {
  if (!html.trim() || typeof DOMParser === "undefined")
    return preserveDocumentStructure(html);

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  doc.querySelectorAll("script, meta, link, title").forEach((n) => n.remove());
  doc.querySelectorAll("*").forEach((el) => {
    [...el.attributes].forEach((attr) => {
      if (attr.name.toLowerCase().startsWith("on")) el.removeAttribute(attr.name);
    });
  });

  const styleTags = Array.from(doc.querySelectorAll("style"))
    .map((style) => style.outerHTML)
    .join("\n");
  const bodyContent = (doc.body?.innerHTML || html).trim();
  const preserved = preserveDocumentStructure(bodyContent);

  return styleTags ? `${styleTags}\n${preserved}` : preserved;
};

export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};
