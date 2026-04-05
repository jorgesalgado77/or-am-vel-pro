import type { SemanticBlockType, TextLine } from "./types";

// ── Semantic detection patterns ──

const SEMANTIC_RULES: Array<{ test: (text: string, fontSize: number, topPercent: number, totalLines: number, lineIdx: number) => boolean; type: SemanticBlockType }> = [
  {
    type: "header",
    test: (_text, fontSize, topPercent, _total, _idx) =>
      topPercent < 12 && fontSize >= 14,
  },
  {
    type: "empresa",
    test: (text) =>
      /\b(cnpj|razão\s*social|empresa|contratad[ao])\b/i.test(text),
  },
  {
    type: "cliente",
    test: (text) =>
      /\b(cpf|contratante|cliente|comprador)\b/i.test(text),
  },
  {
    type: "clausula",
    test: (text) =>
      /\b(cl[áa]usula|artigo|par[áa]grafo)\s*\d/i.test(text),
  },
  {
    type: "valor",
    test: (text) =>
      /R\$\s*[\d.,]+/.test(text) || /\b(valor|total|pagamento|parcela)\b/i.test(text),
  },
  {
    type: "assinatura",
    test: (text, _fs, topPercent) =>
      topPercent > 80 && (/_{3,}/.test(text) || /\b(assinatura|testemunha|contratante|contratad[ao])\b/i.test(text)),
  },
  {
    type: "rodape",
    test: (_text, fontSize, topPercent) =>
      topPercent > 90 && fontSize <= 10,
  },
];

/**
 * Detect the semantic type of a text line based on content, position, and font size.
 */
export const detectSemanticType = (
  text: string,
  fontSize: number,
  topPercent: number,
  totalLines: number,
  lineIdx: number,
): SemanticBlockType => {
  for (const rule of SEMANTIC_RULES) {
    if (rule.test(text, fontSize, topPercent, totalLines, lineIdx)) {
      return rule.type;
    }
  }
  return "texto";
};

/**
 * Annotate an array of lines with semantic types.
 */
export const annotateLines = (
  lines: TextLine[],
): Array<{ line: TextLine; semantic: SemanticBlockType }> => {
  return lines.map((line, idx) => {
    const text = line.items.map((i) => i.text).join(" ");
    const semantic = detectSemanticType(
      text,
      line.fontSize,
      line.topPercent,
      lines.length,
      idx,
    );
    return { line, semantic };
  });
};
