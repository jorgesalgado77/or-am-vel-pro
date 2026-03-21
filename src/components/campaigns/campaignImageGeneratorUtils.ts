import type { CampaignImageDraft, SavedCampaignImage, Template } from "./campaignImageGeneratorData";

const LOCAL_GALLERY_KEY = "campaign_image_gallery_v2";

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else { cur = test; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") { ctx.roundRect(x, y, w, h, r); } else {
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  }
}

function loadImg(src: string) {
  return new Promise<HTMLImageElement>((ok, err) => { const i = new window.Image(); i.crossOrigin = "anonymous"; i.onload = () => ok(i); i.onerror = err; i.src = src; });
}

export async function renderCampaignToDataUrl(tpl: Template, d: CampaignImageDraft) {
  const c = document.createElement("canvas"); c.width = tpl.width; c.height = tpl.height;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = d.bgColor; ctx.fillRect(0, 0, c.width, c.height);

  if (d.bgImage) {
    const img = await loadImg(d.bgImage);
    const s = Math.max(c.width / img.width, c.height / img.height);
    ctx.drawImage(img, (c.width - img.width * s) / 2, (c.height - img.height * s) / 2, img.width * s, img.height * s);
    ctx.fillStyle = "rgba(0,0,0,0.42)"; ctx.fillRect(0, 0, c.width, c.height);
  } else {
    const g1 = ctx.createRadialGradient(c.width * 0.2, c.height * 0.8, 0, c.width * 0.2, c.height * 0.8, c.width * 0.5);
    g1.addColorStop(0, d.accentColor + "33"); g1.addColorStop(1, "transparent"); ctx.fillStyle = g1; ctx.fillRect(0, 0, c.width, c.height);
    const g2 = ctx.createRadialGradient(c.width * 0.8, c.height * 0.2, 0, c.width * 0.8, c.height * 0.2, c.width * 0.5);
    g2.addColorStop(0, d.accentColor + "22"); g2.addColorStop(1, "transparent"); ctx.fillStyle = g2; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = d.accentColor + "1a"; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(c.width * 0.5, c.height * 0.5, 100 + i * 60, 0, Math.PI * 2); ctx.stroke(); }
  }

  const cy = tpl.layout === "split" ? c.height * 0.7 : c.height * 0.5;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";

  if (d.badge.trim()) {
    ctx.font = `700 ${d.badgeSize}px ${d.badgeFontFamily}`;
    const bw = ctx.measureText(d.badge).width + 52, bh = d.badgeSize + 24;
    ctx.fillStyle = d.accentColor; roundRect(ctx, c.width - bw - 30, 30, bw, bh, 10); ctx.fill();
    ctx.fillStyle = d.badgeTextColor; ctx.fillText(d.badge, c.width - bw / 2 - 30, 30 + bh / 2 + 1);
  }

  ctx.fillStyle = d.accentColor; ctx.font = `600 ${Math.max(22, Math.round(c.width * 0.022))}px ${d.bodyFontFamily}`;
  ctx.fillText(d.storeName.toUpperCase(), c.width / 2, cy - 96);

  ctx.fillStyle = d.headlineColor; ctx.font = `700 ${d.headlineSize}px ${d.headlineFontFamily}`;
  const hLines = wrapText(ctx, d.headline, c.width * 0.8), hLH = d.headlineSize * 1.08;
  const hStartY = cy - ((hLines.length - 1) * hLH) / 2;
  hLines.forEach((l, i) => ctx.fillText(l, c.width / 2, hStartY + i * hLH));

  ctx.fillStyle = d.subtextColor; ctx.globalAlpha = 0.9; ctx.font = `500 ${d.subtextSize}px ${d.bodyFontFamily}`;
  const sLines = wrapText(ctx, d.subtext, c.width * 0.78);
  const sStartY = hStartY + hLines.length * hLH + d.subtextSize;
  sLines.forEach((l, i) => ctx.fillText(l, c.width / 2, sStartY + i * d.subtextSize * 1.2));
  ctx.globalAlpha = 1;

  ctx.font = `700 ${d.ctaSize}px ${d.ctaFontFamily}`;
  const ctaW = ctx.measureText(d.cta).width + 92, ctaH = d.ctaSize + 28;
  const ctaY = sStartY + sLines.length * d.subtextSize * 1.2 + 36;
  ctx.fillStyle = d.accentColor; roundRect(ctx, c.width / 2 - ctaW / 2, ctaY, ctaW, ctaH, ctaH / 2); ctx.fill();
  ctx.fillStyle = d.ctaTextColor; ctx.fillText(d.cta, c.width / 2, ctaY + ctaH / 2 + 1);

  return c.toDataURL("image/png");
}

export function downloadDataUrl(url: string, name: string) { const a = document.createElement("a"); a.download = name; a.href = url; a.click(); }

export async function dataUrlToBlob(url: string) { return (await fetch(url)).blob(); }

export function loadLocalGallery(): SavedCampaignImage[] {
  try { const r = localStorage.getItem(LOCAL_GALLERY_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}

export function saveLocalGallery(items: SavedCampaignImage[]) { localStorage.setItem(LOCAL_GALLERY_KEY, JSON.stringify(items.slice(0, 30))); }

export function mergeCampaignGallery(...groups: SavedCampaignImage[][]) {
  const m = new Map<string, SavedCampaignImage>();
  groups.flat().forEach(i => m.set(i.id, i));
  return Array.from(m.values()).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function slugify(v: string) {
  return v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "campanha";
}