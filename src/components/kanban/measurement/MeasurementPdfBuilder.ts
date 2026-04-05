/**
 * MeasurementPdfBuilder — Extracted PDF generation logic from MeasurementRequestModal.
 * Generates a professional A4 PDF for measurement requests.
 */

import { formatCurrency } from "@/lib/financing";

interface EnvironmentData {
  id: string;
  name: string;
  value: number;
  fileUrl?: string;
  fileName?: string;
}

interface AttachmentGalleryEntry {
  envId: string;
  envName: string;
  attachment: {
    id: string;
    kind: "image" | "pdf";
    mimeType: string;
    name: string;
    previewUrl: string;
    thumbnailUrl: string;
    sourceUrl?: string;
    file?: File;
  };
}

interface StoreData {
  name: string;
  cnpj: string;
  logo_url: string;
  codigo_loja: string;
  gerente_nome: string;
}

interface AddressFormState {
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
}

interface EditableFields {
  telefone: string;
  email: string;
  cpf: string;
}

export interface MeasurementPdfParams {
  client: { nome: string; vendedor?: string };
  tracking: { numero_contrato?: string; projetista?: string };
  storeData: StoreData;
  addressForm: AddressFormState;
  editableFields: EditableFields;
  environments: EnvironmentData[];
  attachmentGalleryEntries: AttachmentGalleryEntry[];
  observacoes: string;
  totalValorAvista: number;
}

const FONT = "helvetica";
const PRIMARY: [number, number, number] = [8, 145, 178];
const PRIMARY_LIGHT: [number, number, number] = [230, 247, 250];
const DARK: [number, number, number] = [30, 41, 59];
const GRAY: [number, number, number] = [100, 116, 139];
const WHITE: [number, number, number] = [255, 255, 255];
const BORDER: [number, number, number] = [203, 213, 225];
const BG_ALT: [number, number, number] = [248, 250, 252];
const ADDRESS_BORDER: [number, number, number] = [37, 99, 235];
const ADDRESS_BG: [number, number, number] = [239, 246, 255];
const ADDRESS_TITLE: [number, number, number] = [30, 64, 175];

function sourceToDataUrl(source: string | File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao processar arquivo"));

    if (source instanceof File) {
      reader.readAsDataURL(source);
      return;
    }

    fetch(source)
      .then((response) => response.blob())
      .then((blob) => reader.readAsDataURL(blob))
      .catch(reject);
  });
}

function getImageFormat(src: string, fallbackName?: string): "PNG" | "JPEG" {
  const ref = `${src} ${fallbackName || ""}`.toLowerCase();
  return ref.includes("png") || ref.includes("image/png") ? "PNG" : "JPEG";
}

async function loadImageAsset(src: string | File, fallbackName?: string) {
  const normalizedSrc = await sourceToDataUrl(src);
  const img = new window.Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject();
    img.src = normalizedSrc;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Falha ao processar imagem");
  ctx.drawImage(img, 0, 0);

  const format = getImageFormat(typeof src === "string" ? src : src.type, fallbackName);
  const mimeType = format === "PNG" ? "image/png" : "image/jpeg";
  const dataUrl = canvas.toDataURL(mimeType, 0.92);

  return { dataUrl, format, width: canvas.width, height: canvas.height };
}

export async function buildMeasurementPdf(params: MeasurementPdfParams) {
  const {
    client, tracking, storeData, addressForm, editableFields,
    environments, attachmentGalleryEntries, observacoes, totalValorAvista,
  } = params;

  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const mx = 12;
  const cw = pw - mx * 2;
  const bottomMargin = 14;
  const topStart = 14;
  const gap = 4;

  let y = topStart;

  const contractNumber = String(
    tracking?.numero_contrato ||
    (client as Record<string, unknown>)?.numero_orcamento ||
    (client as Record<string, unknown>)?.numero_contrato ||
    "—",
  );

  const resetText = () => {
    doc.setFont(FONT, "normal");
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
  };

  const ensureSpace = (height: number) => {
    if (y + height > ph - bottomMargin) {
      doc.addPage();
      y = topStart;
    }
  };

  const drawCard = (title: string, height: number, bodyFill: [number, number, number] = WHITE) => {
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.45);
    doc.setFillColor(...bodyFill);
    doc.roundedRect(mx, y, cw, height, 2, 2, "FD");
    doc.setFillColor(...PRIMARY);
    doc.roundedRect(mx, y, cw, 8, 2, 2, "F");
    doc.rect(mx, y + 5, cw, 3, "F");
    doc.setFont(FONT, "bold");
    doc.setFontSize(9);
    doc.setTextColor(...WHITE);
    doc.text(title, mx + 4, y + 5.5);
  };

  const drawField = (label: string, value: string, xPos: number, yPos: number, maxWidth: number) => {
    const safeValue = value?.trim() ? value : "—";
    const lines = doc.splitTextToSize(safeValue, maxWidth);
    doc.setFont(FONT, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text(label, xPos, yPos);
    doc.setFont(FONT, "bold");
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    doc.text(lines, xPos, yPos + 4);
    return lines.length;
  };

  const drawFieldGridSection = (
    title: string,
    rows: Array<[{ label: string; value: string }, { label: string; value: string }?]>,
  ) => {
    const innerX = mx + 4;
    const columnGap = 8;
    const colW = (cw - 8 - columnGap) / 2;

    const rowHeights = rows.map(([left, right]) => {
      const leftLines = doc.splitTextToSize(left.value?.trim() ? left.value : "—", colW).length;
      const rightLines = right ? doc.splitTextToSize(right.value?.trim() ? right.value : "—", colW).length : 0;
      return 9 + Math.max(leftLines, rightLines, 1) * 4.5;
    });

    const totalHeight = 12 + rowHeights.reduce((sum, h) => sum + h, 0) + 2;
    ensureSpace(totalHeight + gap);
    drawCard(title, totalHeight);

    let cy = y + 12;
    rows.forEach(([left, right], index) => {
      drawField(left.label, left.value, innerX, cy, colW);
      if (right) {
        drawField(right.label, right.value, innerX + colW + columnGap, cy, colW);
      }
      cy += rowHeights[index];
    });

    y += totalHeight + gap;
  };

  const drawAddressSection = (address: string) => {
    const lines = doc.splitTextToSize(address?.trim() ? address : "Não informado", cw - 10);
    const totalHeight = 13 + lines.length * 5;
    ensureSpace(totalHeight + gap);

    doc.setDrawColor(...ADDRESS_BORDER);
    doc.setLineWidth(0.5);
    doc.setFillColor(...ADDRESS_BG);
    doc.roundedRect(mx, y, cw, totalHeight, 2, 2, "FD");
    doc.setFont(FONT, "bold");
    doc.setFontSize(9);
    doc.setTextColor(...ADDRESS_TITLE);
    doc.text("ENDEREÇO DE ENTREGA", mx + 4, y + 6.5);
    doc.setFont(FONT, "normal");
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    doc.text(lines, mx + 4, y + 13);

    y += totalHeight + gap;
  };

  const drawValueSection = () => {
    const totalHeight = 14;
    ensureSpace(totalHeight + gap);
    doc.setDrawColor(...PRIMARY);
    doc.setLineWidth(0.5);
    doc.setFillColor(...PRIMARY_LIGHT);
    doc.roundedRect(mx, y, cw, totalHeight, 2, 2, "FD");
    doc.setFont(FONT, "bold");
    doc.setFontSize(11);
    doc.setTextColor(...PRIMARY);
    doc.text("VALOR TOTAL À VISTA", mx + 4, y + 8.5);
    doc.text(formatCurrency(totalValorAvista), pw - mx - 4, y + 8.5, { align: "right" });
    y += totalHeight + gap;
  };

  const drawEnvironmentsSection = () => {
    if (environments.length === 0) return;
    const totalHeight = 18 + environments.length * 7;
    ensureSpace(totalHeight + gap);
    drawCard(`AMBIENTES VENDIDOS (${environments.length})`, totalHeight);

    const tableTop = y + 10;
    doc.setFillColor(...BG_ALT);
    doc.rect(mx, tableTop, cw, 7, "F");
    doc.setFont(FONT, "bold");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text("Ambiente", mx + 4, tableTop + 5);
    doc.text("Valor", pw - mx - 4, tableTop + 5, { align: "right" });

    let rowY = tableTop + 9;
    environments.forEach((env, index) => {
      if (index % 2 === 0) {
        doc.setFillColor(...BG_ALT);
        doc.rect(mx, rowY - 3.5, cw, 7, "F");
      }
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.1);
      doc.line(mx, rowY + 3.5, pw - mx, rowY + 3.5);
      doc.setFont(FONT, "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...DARK);
      doc.text(env.name, mx + 4, rowY + 1);
      doc.setFont(FONT, "bold");
      doc.text(formatCurrency(env.value), pw - mx - 4, rowY + 1, { align: "right" });
      rowY += 7;
    });

    y += totalHeight + gap;
  };

  const drawUtilitiesSection = () => {
    const utilitarios = [
      "Refrigerador", "Fogão / Cooktop", "Forno Elétrico", "Micro-ondas",
      "Lava Louças", "Lava Roupas", "Aquecedor", "Adega",
      "Climatizador", "Ar Condicionado", "TV", "Cama Box",
      "", "", "", "",
    ];

    const totalHeight = 19 + utilitarios.length * 7;
    ensureSpace(totalHeight + gap);
    drawCard("DIMENSÕES DE UTILITÁRIOS", totalHeight);

    const nameW = cw * 0.4;
    const dimW = (cw - nameW) / 3;
    const tableY = y + 10;
    const colStarts = [mx, mx + nameW, mx + nameW + dimW, mx + nameW + dimW * 2];

    doc.setFillColor(...PRIMARY);
    doc.rect(mx, tableY, cw, 7, "F");
    doc.setFont(FONT, "bold");
    doc.setFontSize(8);
    doc.setTextColor(...WHITE);
    doc.text("UTILITÁRIO", colStarts[0] + 4, tableY + 5);
    doc.text("LARGURA", colStarts[1] + 3, tableY + 5);
    doc.text("ALTURA", colStarts[2] + 3, tableY + 5);
    doc.text("PROFUNDIDADE", colStarts[3] + 3, tableY + 5);

    let rowY = tableY + 8;
    utilitarios.forEach((item, index) => {
      if (index % 2 === 0) {
        doc.setFillColor(...BG_ALT);
        doc.rect(mx, rowY - 1, cw, 7, "F");
      }
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.2);
      for (let i = 1; i < 4; i++) {
        doc.line(colStarts[i], rowY - 1, colStarts[i], rowY + 6);
      }
      doc.line(mx, rowY + 6, pw - mx, rowY + 6);
      doc.setFont(FONT, item ? "normal" : "italic");
      doc.setFontSize(8);
      doc.setTextColor(...DARK);
      doc.text(item || "________________", colStarts[0] + 4, rowY + 4);
      rowY += 7;
    });

    y += totalHeight + gap;
  };

  const drawObservationsSection = () => {
    const obsText = observacoes.trim();
    const lines = obsText ? doc.splitTextToSize(obsText, cw - 8) : [];
    const totalHeight = obsText ? 13 + lines.length * 5 : 13 + 5 * 7;
    ensureSpace(totalHeight + gap);
    drawCard("OBSERVAÇÕES GERAIS", totalHeight);

    let currentY = y + 13;
    doc.setFont(FONT, "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...DARK);

    if (obsText) {
      doc.text(lines, mx + 4, currentY);
    } else {
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.15);
      for (let i = 0; i < 5; i++) {
        doc.line(mx + 4, currentY + 2, pw - mx - 4, currentY + 2);
        currentY += 7;
      }
    }

    y += totalHeight + gap;
  };

  const drawPhotoPages = async () => {
    const allEntries = attachmentGalleryEntries;
    if (allEntries.length === 0) return;

    const slotHeight = 84;
    const imageMaxHeight = 62;
    const entryPages = allEntries.reduce<typeof allEntries[]>((pages, entry, index) => {
      if (index % 3 === 0) pages.push(allEntries.slice(index, index + 3));
      return pages;
    }, []);

    for (const pageEntries of entryPages) {
      doc.addPage();
      y = topStart;
      drawCard("IMAGENS ANEXADAS À SOLICITAÇÃO", 12, WHITE);
      y += 16;

      for (const entry of pageEntries) {
        ensureSpace(slotHeight);
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.35);
        doc.setFillColor(...WHITE);
        doc.roundedRect(mx, y, cw, slotHeight - 4, 2, 2, "FD");

        doc.setFont(FONT, "bold");
        doc.setFontSize(9);
        doc.setTextColor(...DARK);
        doc.text(entry.envName, mx + 4, y + 7);
        doc.setFont(FONT, "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...GRAY);
        const label = entry.attachment.kind === "pdf"
          ? `${entry.attachment.name || "Arquivo PDF"} [PDF]`
          : (entry.attachment.name || "Imagem enviada");
        doc.text(label, mx + 4, y + 12);

        try {
          const imageSource = entry.attachment.kind === "pdf"
            ? entry.attachment.thumbnailUrl || entry.attachment.previewUrl
            : (entry.attachment.file || entry.attachment.sourceUrl || entry.attachment.previewUrl);
          const imageAsset = await loadImageAsset(imageSource, entry.attachment.name);
          const ratio = imageAsset.width / imageAsset.height;
          let drawW = cw - 8;
          let drawH = drawW / ratio;
          if (drawH > imageMaxHeight) {
            drawH = imageMaxHeight;
            drawW = drawH * ratio;
          }
          const drawX = mx + (cw - drawW) / 2;
          const drawY = y + 16;

          doc.addImage(imageAsset.dataUrl, imageAsset.format, drawX, drawY, drawW, drawH);
          doc.setDrawColor(...BORDER);
          doc.roundedRect(drawX, drawY, drawW, drawH, 1, 1, "S");

          if (entry.attachment.kind === "pdf") {
            const badgeW = 12;
            const badgeH = 5;
            const badgeX = drawX + drawW - badgeW - 2;
            const badgeY = drawY + drawH - badgeH - 2;
            doc.setFillColor(...PRIMARY);
            doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1, 1, "F");
            doc.setFont(FONT, "bold");
            doc.setFontSize(7);
            doc.setTextColor(...WHITE);
            doc.text("PDF", badgeX + badgeW / 2, badgeY + 3.8, { align: "center" });
          }
        } catch {
          doc.setFont(FONT, "normal");
          doc.setFontSize(8);
          doc.setTextColor(...GRAY);
          doc.text("Falha ao carregar imagem.", mx + 4, y + 22);
        }

        y += slotHeight;
      }
    }
  };

  const addFooter = () => {
    const totalPages = (doc as Record<string, Record<string, () => number>>).internal.getNumberOfPages();
    for (let page = 1; page <= totalPages; page++) {
      doc.setPage(page);
      const footerY = ph - 9;
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.25);
      doc.line(mx, footerY - 3, pw - mx, footerY - 3);
      doc.setFont(FONT, "normal");
      doc.setFontSize(7);
      doc.setTextColor(...GRAY);
      doc.text(`${storeData.name || "Empresa"} — Solicitação de Medida`, mx, footerY);
      doc.text(`Página ${page} de ${totalPages}`, pw - mx, footerY, { align: "right" });
    }
  };

  resetText();

  // Header
  const headerHeight = 26;
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pw, headerHeight, "F");

  let logoRightX = mx;
  if (storeData.logo_url) {
    try {
      const logoAsset = await loadImageAsset(storeData.logo_url, "logo.png");
      const logoH = 14;
      const logoW = (logoAsset.width / logoAsset.height) * logoH;
      doc.addImage(logoAsset.dataUrl, logoAsset.format, mx, 5.5, logoW, logoH);
      logoRightX = mx + logoW + 5;
    } catch {
      logoRightX = mx;
    }
  }

  doc.setFont(FONT, "bold");
  doc.setFontSize(15);
  doc.setTextColor(...WHITE);
  doc.text("SOLICITAÇÃO DE MEDIDA", logoRightX, 11.5);
  doc.setFont(FONT, "normal");
  doc.setFontSize(8);
  doc.text(new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }), logoRightX, 18);

  doc.setFont(FONT, "bold");
  doc.setFontSize(8);
  doc.text("CONTRATO / ORÇAMENTO", pw - mx, 10, { align: "right" });
  doc.setFont(FONT, "bold");
  doc.setFontSize(11);
  doc.text(doc.splitTextToSize(contractNumber, 72), pw - mx, 17, { align: "right" });

  y = 32;

  // Sections
  drawFieldGridSection("DADOS DA LOJA", [
    [{ label: "Loja", value: storeData.name }, { label: "CNPJ", value: storeData.cnpj }],
    [{ label: "Código da Loja", value: storeData.codigo_loja }, { label: "Gerente", value: storeData.gerente_nome }],
  ]);

  const fullAddr = [
    addressForm.street, addressForm.number, addressForm.complement, addressForm.district,
    addressForm.city && addressForm.state ? `${addressForm.city} - ${addressForm.state}` : addressForm.city || addressForm.state,
    addressForm.cep,
  ].filter(Boolean).join(", ") || "Não informado";

  drawFieldGridSection("DADOS DO CLIENTE", [
    [{ label: "Nome", value: client.nome || "—" }, { label: "CPF/CNPJ", value: editableFields.cpf || "—" }],
    [{ label: "Telefone", value: editableFields.telefone || "—" }, { label: "Email", value: editableFields.email || "—" }],
    [{ label: "Vendedor", value: client.vendedor || "—" }],
  ]);

  drawAddressSection(fullAddr);
  drawValueSection();
  drawEnvironmentsSection();
  drawUtilitiesSection();
  drawObservationsSection();
  await drawPhotoPages();
  addFooter();

  return doc;
}
