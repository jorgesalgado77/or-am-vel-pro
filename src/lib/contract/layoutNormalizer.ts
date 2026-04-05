import type { TextLine } from "./types";

/**
 * Normalize layout to prevent overlapping text and fix spacing issues.
 * Works on grouped TextLine arrays, adjusting topPercent to ensure
 * no two lines overlap vertically.
 */
export const normalizeLayout = (lines: TextLine[]): TextLine[] => {
  if (lines.length <= 1) return lines;

  // Sort by topPercent ascending
  const sorted = [...lines].sort((a, b) => a.topPercent - b.topPercent);

  const normalized: TextLine[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = normalized[normalized.length - 1];
    const current = { ...sorted[i] };

    // Minimum gap between lines (in percent of page height)
    const minGap = (prev.fontSize / 297) * 100 * 1.3; // 130% of font height in % of A4

    if (current.topPercent - prev.topPercent < minGap) {
      // Push this line down to avoid overlap
      current.topPercent = prev.topPercent + minGap;

      // Update all items in this line
      current.items = current.items.map((item) => ({
        ...item,
        topPercent: current.topPercent,
      }));
    }

    normalized.push(current);
  }

  return normalized;
};

/**
 * Detect and fix common spacing issues:
 * - Excessive gaps between lines (compress if gap > 3x line height)
 * - Normalize font sizes that are unreasonably large or small
 */
export const normalizeSpacing = (lines: TextLine[]): TextLine[] => {
  if (lines.length <= 1) return lines;

  const sorted = [...lines].sort((a, b) => a.topPercent - b.topPercent);

  // Calculate median line gap
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(sorted[i].topPercent - sorted[i - 1].topPercent);
  }
  gaps.sort((a, b) => a - b);
  const medianGap = gaps[Math.floor(gaps.length / 2)] || 2;
  const maxAllowedGap = medianGap * 3;

  let adjustment = 0;
  const result: TextLine[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].topPercent - sorted[i - 1].topPercent;
    const current = { ...sorted[i] };

    if (gap > maxAllowedGap) {
      // Compress excessive gap
      adjustment += gap - maxAllowedGap;
    }

    if (adjustment > 0) {
      current.topPercent -= adjustment;
      current.items = current.items.map((item) => ({
        ...item,
        topPercent: current.topPercent,
      }));
    }

    result.push(current);
  }

  return result;
};

/**
 * Full normalization pipeline: spacing → overlap prevention
 */
export const normalizePageLayout = (lines: TextLine[]): TextLine[] => {
  const spaced = normalizeSpacing(lines);
  return normalizeLayout(spaced);
};
