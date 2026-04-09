import { useCallback, useRef } from "react";

/**
 * Splits HTML content at a specific pixel height boundary.
 * Uses an off-screen measurement div to find the split point.
 * Returns [fittingHtml, overflowHtml] — overflowHtml is empty if everything fits.
 */
export function useTextSplitter() {
  const measureRef = useRef<HTMLDivElement | null>(null);

  const getMeasureDiv = useCallback(() => {
    if (!measureRef.current) {
      const div = document.createElement("div");
      div.style.cssText = "position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none;";
      document.body.appendChild(div);
      measureRef.current = div;
    }
    return measureRef.current;
  }, []);

  /**
   * Split HTML content so the first part fits within `maxHeight` pixels.
   * @param html - Full HTML content of the text element
   * @param width - Element width in px
   * @param style - CSS properties to replicate (font, size, etc.)
   * @param maxHeight - Maximum height in px for the first part
   * @returns [fittingHtml, remainderHtml]
   */
  const splitHtmlAtHeight = useCallback(
    (
      html: string,
      width: number,
      style: {
        fontFamily: string;
        fontSize: number;
        fontWeight: string;
        fontStyle: string;
        textAlign: string;
        lineHeight?: number;
      },
      maxHeight: number
    ): [string, string] => {
      if (!html || maxHeight <= 0) return ["", html];

      const measure = getMeasureDiv();
      measure.style.width = `${width}px`;
      measure.style.fontFamily = style.fontFamily;
      measure.style.fontSize = `${style.fontSize}px`;
      measure.style.fontWeight = style.fontWeight;
      measure.style.fontStyle = style.fontStyle;
      measure.style.textAlign = style.textAlign;
      measure.style.lineHeight = `${style.lineHeight ?? 1.4}`;
      measure.style.whiteSpace = "pre-wrap";
      measure.style.wordWrap = "break-word";
      measure.style.boxSizing = "border-box";
      measure.style.overflow = "visible";

      // First check: does all content fit?
      measure.innerHTML = html;
      if (measure.scrollHeight <= maxHeight) {
        return [html, ""];
      }

      // Parse HTML into top-level nodes (lines / block elements)
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;

      // Collect top-level block nodes. We treat <br> as a separator and inline
      // spans as grouped lines.
      const topNodes: Node[] = [];
      for (let i = 0; i < wrapper.childNodes.length; i++) {
        topNodes.push(wrapper.childNodes[i]);
      }

      if (topNodes.length === 0) return [html, ""];

      // Binary-search: find how many top-level nodes fit within maxHeight
      let lo = 0;
      let hi = topNodes.length;
      // Quick check: if even one node doesn't fit, we still keep at least one
      while (lo < hi) {
        const mid = Math.floor((lo + hi + 1) / 2);
        // Build HTML from first `mid` nodes
        const testDiv = document.createElement("div");
        for (let i = 0; i < mid; i++) {
          testDiv.appendChild(topNodes[i].cloneNode(true));
        }
        measure.innerHTML = testDiv.innerHTML;
        if (measure.scrollHeight <= maxHeight) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }

      // lo = number of nodes that fit (could be 0)
      const splitAt = Math.max(lo, 1); // always keep at least 1 node on current page

      const fittingDiv = document.createElement("div");
      const remainderDiv = document.createElement("div");

      for (let i = 0; i < topNodes.length; i++) {
        if (i < splitAt) {
          fittingDiv.appendChild(topNodes[i].cloneNode(true));
        } else {
          remainderDiv.appendChild(topNodes[i].cloneNode(true));
        }
      }

      return [fittingDiv.innerHTML, remainderDiv.innerHTML];
    },
    [getMeasureDiv]
  );

  return { splitHtmlAtHeight };
}
