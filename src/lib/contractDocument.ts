const CONTRACT_DOCUMENT_STYLES = `
  :root {
    color-scheme: light;
  }

  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    background: hsl(210 20% 98%);
    color: hsl(222 47% 11%);
    font-family: 'Segoe UI', Arial, sans-serif;
  }

  body.contract-document-root {
    min-height: 100vh;
    padding: 16px;
  }

  .contract-page {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto 16px;
    padding: 15mm;
    background: hsl(0 0% 100%);
    color: hsl(222 47% 11%);
    position: relative;
    overflow: hidden;
    box-shadow: 0 10px 30px hsl(222 47% 11% / 0.08);
    break-after: page;
    page-break-after: always;
  }

  .contract-page:last-child {
    margin-bottom: 0;
    break-after: auto;
    page-break-after: auto;
  }

  .contract-page__content {
    width: 100%;
    min-height: calc(297mm - 30mm);
  }

  img,
  svg,
  canvas {
    max-width: 100%;
  }

  table {
    border-collapse: collapse;
  }

  @page {
    size: A4;
    margin: 15mm;
  }

  @media print {
    html,
    body {
      background: hsl(0 0% 100%);
    }

    body.contract-document-root {
      padding: 0;
    }

    .contract-page {
      width: auto;
      min-height: calc(297mm - 30mm);
      margin: 0;
      padding: 0;
      box-shadow: none;
      overflow: visible;
    }

    .contract-page__content {
      min-height: auto;
    }
  }
`;

const PAGE_MARKER_REGEX = /contract-page|data-contract-page|page-break-(after|before)|break-(after|before)|@page/iu;
const HTML_DOCUMENT_REGEX = /<html[\s>]/iu;
const BODY_TAG_REGEX = /<body[^>]*>([\s\S]*)<\/body>/iu;
const HEAD_TAG_REGEX = /<head[^>]*>([\s\S]*?)<\/head>/iu;
const STYLE_TAG_REGEX = /<style[\s\S]*?<\/style>/giu;
const HR_PAGE_BREAK_REGEX = /<hr\b[^>]*>/giu;

const ensurePageStructure = (html: string) => {
  const trimmed = html.trim();
  if (!trimmed) return '<section class="contract-page" data-contract-page="true"><div class="contract-page__content"></div></section>';
  if (PAGE_MARKER_REGEX.test(trimmed)) return trimmed;

  const pages = trimmed
    .split(HR_PAGE_BREAK_REGEX)
    .map((page) => page.trim())
    .filter(Boolean);

  return pages
    .map(
      (page) => `<section class="contract-page" data-contract-page="true"><div class="contract-page__content">${page}</div></section>`,
    )
    .join('');
};

const extractDocumentParts = (html: string) => {
  if (!HTML_DOCUMENT_REGEX.test(html)) {
    return { styles: '', bodyContent: html.trim() };
  }

  const headMatch = html.match(HEAD_TAG_REGEX);
  const bodyMatch = html.match(BODY_TAG_REGEX);
  const styles = headMatch?.[1]?.match(STYLE_TAG_REGEX)?.join('') ?? '';
  const bodyContent = bodyMatch?.[1]?.trim() ?? html.trim();

  return { styles, bodyContent };
};

export const buildContractDocumentHtml = (html: string, title: string) => {
  const { styles, bodyContent } = extractDocumentParts(html);
  const content = ensurePageStructure(bodyContent);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>${CONTRACT_DOCUMENT_STYLES}</style>
  ${styles}
</head>
<body class="contract-document-root">
  ${content}
</body>
</html>`;
};

export const openContractPrintWindow = (html: string, title: string) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return null;

  printWindow.document.write(buildContractDocumentHtml(html, title));
  printWindow.document.close();
  printWindow.onload = () => {
    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 300);
  };

  return printWindow;
};
