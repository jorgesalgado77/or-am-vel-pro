import { useCallback, useRef } from "react";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const plainTextToHtml = (value: string) => escapeHtml(value).replace(/\n/g, "<br>");

const htmlToPlainText = (html: string) => {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  wrapper.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  wrapper
    .querySelectorAll("p,div,section,article,header,footer,li,tr,table,h1,h2,h3,h4,h5,h6,blockquote")
    .forEach((el) => {
      if (!el.textContent?.endsWith("\n")) {
        el.appendChild(document.createTextNode("\n"));
      }
    });

  return (wrapper.textContent ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

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

  const applyMeasureStyle = useCallback(
    (
      measure: HTMLDivElement,
      width: number,
      style: {
        fontFamily: string;
        fontSize: number;
        fontWeight: string;
        fontStyle: string;
        textAlign: string;
        lineHeight?: number;
      },
    ) => {
      measure.style.width = `${Math.max(1, width)}px`;
      measure.style.fontFamily = style.fontFamily;
      measure.style.fontSize = `${style.fontSize}px`;
      measure.style.fontWeight = style.fontWeight;
      measure.style.fontStyle = style.fontStyle;
      measure.style.textAlign = style.textAlign;
      measure.style.lineHeight = `${style.lineHeight ?? 1.4}`;
      measure.style.whiteSpace = "pre-wrap";
      measure.style.wordBreak = "break-word";
      measure.style.overflowWrap = "anywhere";
      measure.style.boxSizing = "border-box";
      measure.style.overflow = "visible";
      measure.style.padding = "0";
      measure.style.margin = "0";
    },
    [],
  );

  const measureHtmlHeight = useCallback(
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
    ) => {
      if (!html) return 0;
      const measure = getMeasureDiv();
      applyMeasureStyle(measure, width, style);
      measure.innerHTML = html;
      return Math.ceil(measure.scrollHeight);
    },
    [applyMeasureStyle, getMeasureDiv],
  );

  /**
   * Split HTML content so the first part fits within `maxHeight` pixels.
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
      maxHeight: number,
    ): [string, string] => {
      if (!html || maxHeight <= 0) return ["", html];

      const measure = getMeasureDiv();
      applyMeasureStyle(measure, width, style);

      if (measureHtmlHeight(html, width, style) <= maxHeight) {
        return [html, ""];
      }

      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;
      const topNodes = Array.from(wrapper.childNodes);

      if (topNodes.length > 1) {
        let lo = 0;
        let hi = topNodes.length;

        while (lo < hi) {
          const mid = Math.floor((lo + hi + 1) / 2);
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

        const splitAt = Math.max(lo, 1);
        const fittingDiv = document.createElement("div");
        const remainderDiv = document.createElement("div");

        for (let i = 0; i < topNodes.length; i++) {
          if (i < splitAt) {
            fittingDiv.appendChild(topNodes[i].cloneNode(true));
          } else {
            remainderDiv.appendChild(topNodes[i].cloneNode(true));
          }
        }

        const fitHtml = fittingDiv.innerHTML;
        const remHtml = remainderDiv.innerHTML;
        if (fitHtml && remHtml && measureHtmlHeight(fitHtml, width, style) <= maxHeight) {
          return [fitHtml, remHtml];
        }
      }

      const plainText = htmlToPlainText(html);
      if (!plainText) return [html, ""];

      const splitTokens = (tokens: string[]) => {
        let lo = 0;
        let hi = tokens.length;

        while (lo < hi) {
          const mid = Math.floor((lo + hi + 1) / 2);
          const candidate = tokens.slice(0, mid).join("");
          measure.innerHTML = plainTextToHtml(candidate);
          if (measure.scrollHeight <= maxHeight) {
            lo = mid;
          } else {
            hi = mid - 1;
          }
        }

        return Math.max(lo, 1);
      };

      const wordTokens = plainText.split(/(\s+)/).filter(Boolean);
      let splitAt = splitTokens(wordTokens);
      let fittingText = wordTokens.slice(0, splitAt).join("").trimEnd();
      let remainderText = wordTokens.slice(splitAt).join("").trimStart();

      if (!remainderText || measureHtmlHeight(plainTextToHtml(fittingText), width, style) > maxHeight) {
        const charTokens = Array.from(plainText);
        splitAt = splitTokens(charTokens);
        fittingText = charTokens.slice(0, splitAt).join("").trimEnd();
        remainderText = charTokens.slice(splitAt).join("").trimStart();
      }

      if (!fittingText) {
        fittingText = plainText.slice(0, 1);
        remainderText = plainText.slice(1).trimStart();
      }

      return [plainTextToHtml(fittingText), plainTextToHtml(remainderText)];
    },
    [applyMeasureStyle, getMeasureDiv, measureHtmlHeight],
  );

  return { splitHtmlAtHeight, measureHtmlHeight };
}

