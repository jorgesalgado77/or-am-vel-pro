/**
 * PDF Generation Service — calls the generate-pdf Edge Function (server-side)
 * and handles download / mobile share.
 */
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

export interface BudgetPdfPayload {
  clientName: string;
  clientCpf?: string;
  clientEmail?: string;
  clientPhone?: string;
  vendedor?: string;
  companyName?: string;
  companySubtitle?: string;
  companyLogoUrl?: string;
  valorTela: number;
  desconto1: number;
  desconto2: number;
  desconto3: number;
  valorComDesconto: number;
  formaPagamento: string;
  parcelas: number;
  valorEntrada: number;
  plusPercentual: number;
  taxaCredito: number;
  saldo: number;
  valorFinal: number;
  valorParcela: number;
  ambientes?: Array<{ environmentName: string; pieceCount: number; totalValue: number }>;
  catalogProducts?: Array<{ name: string; internal_code: string; quantity: number; sale_price: number }>;
  date?: string;
}

export interface PdfResult {
  success: boolean;
  download_url?: string;
  error?: string;
  provider?: string;
}

/**
 * Generate a professional budget PDF server-side via Edge Function.
 */
export async function generateBudgetPdfServerSide(
  tenantId: string,
  payload: BudgetPdfPayload
): Promise<PdfResult> {
  const { data, error } = await supabase.functions.invoke("generate-pdf", {
    body: {
      action: "generate-budget",
      tenant_id: tenantId,
      payload,
    },
  });

  if (error) {
    return { success: false, error: error.message || "Erro ao gerar PDF" };
  }

  return data as PdfResult;
}

/**
 * Open or share a PDF URL. On mobile with Web Share API,
 * offers to share directly (e.g., to WhatsApp).
 */
export async function openOrSharePdf(url: string, fileName = "orcamento.pdf") {
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

  if (isMobile && navigator.share) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], fileName, { type: "application/pdf" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "Orçamento",
          text: "Segue o orçamento em PDF",
          files: [file],
        });
        return;
      }
    } catch {
      try {
        await navigator.share({ title: "Orçamento", url });
        return;
      } catch {
        // user cancelled
      }
    }
  }

  window.open(url, "_blank", "noopener");
}

/**
 * Full flow: generate server-side → open/share.
 */
export async function generateAndOpenBudgetPdf(
  tenantId: string,
  payload: BudgetPdfPayload
): Promise<boolean> {
  const result = await generateBudgetPdfServerSide(tenantId, payload);

  if (!result.success || !result.download_url) {
    toast.error(result.error || "Erro ao gerar PDF");
    return false;
  }

  toast.success("PDF gerado com sucesso!");
  await openOrSharePdf(result.download_url);
  return true;
}
