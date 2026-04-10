import { A4_HEIGHT, genId, pageId, type CanvasElement, type PageData } from "./types";

export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const HEADER_ZONE_EXTRA = 90;
const FOOTER_ZONE_EXTRA = 70;
const FLOW_PADDING = 16;

const round = (value: number) => Math.round(value * 10) / 10;

export const stripSplitMetadata = <T extends CanvasElement>(el: T): T => {
  const { splitFrom, splitContinuationId, ...rest } = el as T & {
    splitFrom?: string;
    splitContinuationId?: string;
  };
  return rest as T;
};

const fingerprintElement = (el: CanvasElement) => {
  const clean = stripSplitMetadata(el);
  return JSON.stringify({
    type: clean.type,
    x: round(clean.x),
    y: round(clean.y),
    width: round(clean.width),
    height: round(clean.height),
    rotation: round(clean.rotation),
    fill: clean.fill,
    stroke: clean.stroke,
    strokeWidth: clean.strokeWidth,
    borderRadius: clean.borderRadius,
    text: clean.text,
    fontFamily: clean.fontFamily,
    fontSize: clean.fontSize,
    fontWeight: clean.fontWeight,
    fontStyle: clean.fontStyle,
    textDecoration: clean.textDecoration,
    textAlign: clean.textAlign,
    color: clean.color,
    imageUrl: clean.imageUrl,
    tableData: clean.tableData,
    tableCols: clean.tableCols,
    tableRows: clean.tableRows,
    opacity: clean.opacity,
    locked: clean.locked,
  });
};

export const buildRepeatedElementFingerprints = (pages: PageData[]) => {
  const pagesByFingerprint = new Map<string, Set<string>>();

  pages.forEach((page) => {
    const seenOnPage = new Set<string>();
    page.elements.forEach((el) => {
      const fingerprint = fingerprintElement(el);
      if (seenOnPage.has(fingerprint)) return;
      seenOnPage.add(fingerprint);
      if (!pagesByFingerprint.has(fingerprint)) {
        pagesByFingerprint.set(fingerprint, new Set());
      }
      pagesByFingerprint.get(fingerprint)?.add(page.id);
    });
  });

  return new Set(
    [...pagesByFingerprint.entries()]
      .filter(([, pageIds]) => pageIds.size > 1)
      .map(([fingerprint]) => fingerprint),
  );
};

export const isLikelyPageChrome = (
  el: CanvasElement,
  repeatedFingerprints: Set<string>,
  margins: PageMargins,
  pageHeight = A4_HEIGHT,
) => {
  if (repeatedFingerprints.has(fingerprintElement(el))) return true;

  const topZone = el.y <= margins.top + HEADER_ZONE_EXTRA;
  const bottomZone = el.y + el.height >= pageHeight - margins.bottom - FOOTER_ZONE_EXTRA;
  const isDecorative = el.type === "image" || el.type === "line" || el.type === "circle" || el.type === "rect";
  const isCompactText = el.type === "text" && el.height <= 56 && el.width <= 420;

  return (topZone || bottomZone) && (isDecorative || isCompactText || !!el.locked);
};

export const getPageFlowBounds = (
  page: PageData,
  repeatedFingerprints: Set<string>,
  margins: PageMargins,
  pageHeight = A4_HEIGHT,
) => {
  const chrome = page.elements.filter((el) => isLikelyPageChrome(el, repeatedFingerprints, margins, pageHeight));
  const headerChrome = chrome.filter((el) => el.y < pageHeight / 2);
  const footerChrome = chrome.filter((el) => el.y >= pageHeight / 2);

  const headerBottom = headerChrome.length > 0
    ? Math.max(...headerChrome.map((el) => el.y + el.height))
    : margins.top;

  const footerTop = footerChrome.length > 0
    ? Math.min(...footerChrome.map((el) => el.y))
    : pageHeight - margins.bottom;

  const startY = Math.max(margins.top, headerBottom + FLOW_PADDING);
  const endY = Math.min(pageHeight - margins.bottom, footerTop - FLOW_PADDING);

  return {
    startY,
    endY: Math.max(startY + 40, endY),
  };
};

export const createContinuationPageFromTemplate = (
  templatePage: PageData,
  repeatedFingerprints: Set<string>,
  margins: PageMargins,
) => ({
  id: pageId(),
  backgroundImage: templatePage.backgroundImage,
  backgroundOpacity: templatePage.backgroundOpacity,
  elements: templatePage.elements
    .filter((el) => isLikelyPageChrome(el, repeatedFingerprints, margins))
    .filter((el) => !el.text?.includes("{{nome_cliente}}"))
    .map((el) => ({ ...stripSplitMetadata(el), id: genId() })),
});
