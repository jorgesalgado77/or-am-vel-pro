/**
 * PDF Generation Service — calls the generate-pdf Edge Function
 * and handles download / mobile share.
 */
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

export interface GenerateBudgetPdfParams {
  tenant_id: string;
  budget_id?: string;
  provider?: "pdfmonkey" | "pdfgenerator" | "internal";
  template_id?: string;
  payload: Record<string, unknown>;
}

export interface PdfResult {
  success: boolean;
  download_url?: string;
  document_id?: string;
  provider?: string;
  error?: string;
}

/**
 * Generate a PDF via the Edge Function and return the result.
 */
export async function generateBudgetPdf(params: GenerateBudgetPdfParams): Promise<PdfResult> {
  const { data, error } = await supabase.functions.invoke("generate-pdf", {
    body: {
      action: "generate",
      tenant_id: params.tenant_id,
      provider: params.provider,
      data: {
        template_id: params.template_id,
        budget_id: params.budget_id,
        payload: params.payload,
      },
    },
  });

  if (error) {
    return { success: false, error: error.message || "Erro ao gerar PDF" };
  }

  return data as PdfResult;
}

/**
 * Poll PDFMonkey status until done or timeout.
 */
export async function pollPdfStatus(
  tenantId: string,
  documentId: string,
  maxAttempts = 15,
  intervalMs = 2000
): Promise<PdfResult> {
  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await supabase.functions.invoke("generate-pdf", {
      body: { action: "status", tenant_id: tenantId, document_id: documentId },
    });

    if (data?.success && data.download_url && data.status === "success") {
      return data as PdfResult;
    }

    if (data?.status === "failure") {
      return { success: false, error: "Falha na geração do PDF" };
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return { success: false, error: "Tempo esgotado aguardando o PDF" };
}

/**
 * Open or share a PDF URL. On mobile devices with Web Share API,
 * offers to share directly (e.g., to WhatsApp).
 */
export async function openOrSharePdf(url: string, fileName = "orcamento.pdf") {
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

  if (isMobile && navigator.share) {
    try {
      // Try to fetch and share as a file for WhatsApp compatibility
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
      // fallback to URL share
      try {
        await navigator.share({ title: "Orçamento", url });
        return;
      } catch {
        // user cancelled or not supported
      }
    }
  }

  // Desktop or fallback: open in new tab
  window.open(url, "_blank", "noopener");
}

/**
 * Full flow: generate → poll (if needed) → open/share.
 * Returns true if successful.
 */
export async function generateAndOpenPdf(params: GenerateBudgetPdfParams): Promise<boolean> {
  const result = await generateBudgetPdf(params);

  if (!result.success) {
    toast.error(result.error || "Erro ao gerar PDF");
    return false;
  }

  // If provider is internal, no external PDF — handled client-side
  if (result.provider === "internal") {
    toast.info("Use a geração local de PDF para este provedor.");
    return false;
  }

  let downloadUrl = result.download_url;

  // If we got a document_id but no download URL yet (async generation), poll
  if (!downloadUrl && result.document_id) {
    toast.info("Gerando PDF, aguarde...");
    const pollResult = await pollPdfStatus(params.tenant_id, result.document_id);
    if (!pollResult.success || !pollResult.download_url) {
      toast.error(pollResult.error || "Falha ao gerar PDF");
      return false;
    }
    downloadUrl = pollResult.download_url;
  }

  if (downloadUrl) {
    toast.success("PDF gerado com sucesso!");
    await openOrSharePdf(downloadUrl);
    return true;
  }

  toast.error("URL do PDF não disponível");
  return false;
}
