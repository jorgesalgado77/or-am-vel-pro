/**
 * PDF Generator — Server-side budget PDF generation via jsPDF.
 * Generates professional PDFs, uploads to Supabase Storage, returns signed URL.
 * Actions: generate, generate-budget, status
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ── Helpers ──
function fmtCurrency(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function fmtPercent(v: number): string {
  return `${v.toFixed(2)}%`;
}

function fmtDate(d?: string): string {
  const date = d ? new Date(d) : new Date();
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const FORMA_LABELS: Record<string, string> = {
  "A vista": "À Vista", Pix: "Pix", Credito: "Cartão de Crédito",
  Boleto: "Boleto", "Credito / Boleto": "Crédito + Boleto", "Entrada e Entrega": "Entrada e Entrega",
};

// ── Server-side PDF Generation ──
interface BudgetPayload {
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
  date?: string;
}

function generateBudgetPdf(p: BudgetPayload): Uint8Array {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const mx = 15; // margin x
  const cw = pw - mx * 2; // content width
  let y = 20;

  const company = p.companyName || "INOVAMAD";
  const subtitle = p.companySubtitle || "Móveis Planejados";

  // ── Header ──
  doc.setFillColor(8, 145, 178); // cyan-600
  doc.rect(0, 0, pw, 38, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(company, mx, 18);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(subtitle, mx, 26);
  doc.setFontSize(9);
  doc.text(`Gerado em: ${fmtDate(p.date)}`, pw - mx, 18, { align: "right" });
  doc.text("ORÇAMENTO PROFISSIONAL", pw - mx, 26, { align: "right" });

  y = 48;

  // ── Section helper ──
  function sectionTitle(title: string) {
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(mx, y, cw, 8, "F");
    doc.setTextColor(8, 145, 178);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(title, mx + 3, y + 5.5);
    y += 12;
  }

  function fieldRow(label: string, value: string, indent = 0) {
    doc.setTextColor(100, 116, 139); // slate-500
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(label, mx + 3 + indent, y);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.setFont("helvetica", "bold");
    doc.text(value, pw - mx - 3, y, { align: "right" });
    y += 6;
  }

  function checkPage(need = 20) {
    if (y + need > ph - 20) {
      doc.addPage();
      y = 20;
    }
  }

  // ── Client Section ──
  sectionTitle("DADOS DO CLIENTE");
  fieldRow("Nome", p.clientName);
  if (p.clientCpf) fieldRow("CPF", p.clientCpf);
  if (p.clientPhone) fieldRow("Telefone", p.clientPhone);
  if (p.clientEmail) fieldRow("E-mail", p.clientEmail);
  if (p.vendedor) fieldRow("Projetista", p.vendedor);
  y += 4;

  // ── Environments (if any) ──
  if (p.ambientes && p.ambientes.length > 0) {
    checkPage(30);
    sectionTitle("AMBIENTES / ITENS");

    // Table header
    doc.setFillColor(8, 145, 178);
    doc.rect(mx, y, cw, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Ambiente", mx + 3, y + 5);
    doc.text("Peças", mx + cw * 0.55, y + 5);
    doc.text("Valor", pw - mx - 3, y + 5, { align: "right" });
    y += 10;

    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    for (let i = 0; i < p.ambientes.length; i++) {
      checkPage(8);
      const amb = p.ambientes[i];
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(mx, y - 4, cw, 7, "F");
      }
      doc.setTextColor(30, 41, 59);
      doc.text(amb.environmentName, mx + 3, y);
      doc.text(String(amb.pieceCount), mx + cw * 0.55, y);
      doc.text(fmtCurrency(amb.totalValue), pw - mx - 3, y, { align: "right" });
      y += 7;
    }
    y += 4;
  }

  // ── Financial Summary ──
  checkPage(60);
  sectionTitle("RESUMO FINANCEIRO");

  const descontoTotal = p.valorTela - p.valorComDesconto;

  fieldRow("Valor de Tela", fmtCurrency(p.valorTela));

  if (descontoTotal > 0) {
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Descontos: ${p.desconto1}% + ${p.desconto2}% + ${p.desconto3}% (cascata)`, mx + 3, y);
    doc.text(`- ${fmtCurrency(descontoTotal)}`, pw - mx - 3, y, { align: "right" });
    y += 6;
  }

  fieldRow("Valor com Desconto", fmtCurrency(p.valorComDesconto));
  fieldRow("Forma de Pagamento", FORMA_LABELS[p.formaPagamento] || p.formaPagamento);

  if (p.valorEntrada > 0) {
    fieldRow("Entrada", fmtCurrency(p.valorEntrada));
    fieldRow("Saldo", fmtCurrency(p.saldo));
  }

  if (p.taxaCredito > 0) {
    fieldRow("Taxa de Crédito", fmtPercent(p.taxaCredito * 100));
  }

  if (p.plusPercentual > 0) {
    fieldRow("Plus", fmtPercent(p.plusPercentual));
  }

  y += 3;

  // ── Highlight box ──
  doc.setFillColor(240, 253, 250); // teal-50
  doc.setDrawColor(8, 145, 178);
  doc.setLineWidth(0.5);
  const boxH = (["Credito", "Boleto", "Credito / Boleto"].includes(p.formaPagamento)) ? 22 : 14;
  doc.roundedRect(mx, y, cw, boxH, 2, 2, "FD");

  doc.setTextColor(8, 145, 178);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("VALOR FINAL", mx + 5, y + 9);
  doc.text(fmtCurrency(p.valorFinal), pw - mx - 5, y + 9, { align: "right" });

  if (["Credito", "Boleto", "Credito / Boleto"].includes(p.formaPagamento)) {
    doc.setFontSize(11);
    doc.text(`${p.parcelas}x de ${fmtCurrency(p.valorParcela)}`, pw - mx - 5, y + 18, { align: "right" });
  }

  y += boxH + 10;

  // ── Footer ──
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const footerY = ph - 12;
  doc.line(mx, footerY - 4, pw - mx, footerY - 4);
  doc.text(
    `${company} — Documento gerado automaticamente. Este orçamento tem validade de 15 dias.`,
    pw / 2, footerY, { align: "center" }
  );

  return doc.output("arraybuffer") as unknown as Uint8Array;
}

// ── External Provider Helpers (kept for backward compat) ──
async function resolveProvider(tenantId: string | null, preferProvider?: string) {
  if (!tenantId) return null;
  const sb = getSupabaseAdmin();
  const providers = preferProvider ? [preferProvider] : ["pdfmonkey", "pdfgenerator"];
  for (const provider of providers) {
    const { data } = await sb.rpc("get_document_provider", { p_tenant_id: tenantId, p_provider: provider });
    if (data && data.length > 0 && data[0].api_key) {
      return { apiKey: data[0].api_key, apiUrl: data[0].api_url || "", templateId: data[0].template_id || "", config: data[0].config || {}, provider };
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ") || authHeader.replace("Bearer ", "").length < 20) {
      return respond({ error: "Não autorizado" }, 401);
    }

    const body = await req.json();
    const { action, tenant_id } = body;

    // ── Generate Budget PDF (server-side) ──
    if (action === "generate-budget") {
      const payload = body.payload as BudgetPayload;
      if (!payload?.clientName || !payload?.valorTela) {
        return respond({ error: "Dados do orçamento incompletos (clientName, valorTela obrigatórios)" }, 400);
      }

      console.log(`[generate-pdf] Generating budget PDF for tenant ${tenant_id}, client: ${payload.clientName}`);

      // Generate PDF bytes
      const pdfBytes = generateBudgetPdf(payload);

      // Upload to Supabase Storage
      const sb = getSupabaseAdmin();
      const ts = Date.now();
      const safeName = (payload.clientName || "cliente").replace(/[^a-zA-Z0-9]/g, "_").substring(0, 30);
      const filePath = `${tenant_id || "global"}/orcamentos/${safeName}_${ts}.pdf`;

      const { error: uploadError } = await sb.storage
        .from("budget-pdfs")
        .upload(filePath, pdfBytes, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        // Try creating the bucket if it doesn't exist
        await sb.storage.createBucket("budget-pdfs", { public: false });
        const { error: retryError } = await sb.storage
          .from("budget-pdfs")
          .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: true });

        if (retryError) {
          console.error("Retry upload error:", retryError);
          return respond({ error: "Erro ao salvar PDF no Storage" }, 500);
        }
      }

      // Get signed URL (valid for 1 hour)
      const { data: urlData, error: urlError } = await sb.storage
        .from("budget-pdfs")
        .createSignedUrl(filePath, 3600);

      if (urlError || !urlData?.signedUrl) {
        console.error("Signed URL error:", urlError);
        return respond({ error: "PDF gerado mas erro ao criar link de download" }, 500);
      }

      return respond({
        success: true,
        download_url: urlData.signedUrl,
        file_path: filePath,
        provider: "server",
      });
    }

    // ── Legacy: External Provider Generate ──
    if (action === "generate") {
      const providerConfig = await resolveProvider(tenant_id, body.provider);
      if (!providerConfig) {
        // Fallback to internal server-side generation
        return respond({
          success: true,
          provider: "internal",
          message: "Nenhum provedor externo configurado. Use action=generate-budget para geração server-side.",
        });
      }

      // External provider logic (PDFMonkey/PDFGenerator) kept for backwards compat
      const apiUrl = providerConfig.apiUrl || "https://api.pdfmonkey.io/api/v1";
      const templateId = (body.data?.template_id as string) || providerConfig.templateId;
      if (!templateId) return respond({ error: "template_id não configurado" }, 400);

      const res = await fetch(`${apiUrl}/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${providerConfig.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ document: { document_template_id: templateId, payload: body.data?.payload || body.data, status: "pending" } }),
      });
      if (!res.ok) return respond({ error: `Provider [${res.status}]: ${await res.text()}` }, 502);
      const data = await res.json();
      return respond({ success: true, document_id: data.document?.id, status: data.document?.status, download_url: data.document?.download_url, provider: providerConfig.provider });
    }

    // ── Check Status ──
    if (action === "status") {
      const { document_id } = body;
      if (!document_id) return respond({ error: "document_id obrigatório" }, 400);
      const providerConfig = await resolveProvider(tenant_id, "pdfmonkey");
      if (!providerConfig) return respond({ error: "PDFMonkey não configurado" }, 400);
      const apiUrl = providerConfig.apiUrl || "https://api.pdfmonkey.io/api/v1";
      const res = await fetch(`${apiUrl}/documents/${document_id}`, { headers: { Authorization: `Bearer ${providerConfig.apiKey}` } });
      if (!res.ok) return respond({ error: `[${res.status}]` }, 502);
      const data = await res.json();
      return respond({ success: true, status: data.document?.status, download_url: data.document?.download_url });
    }

    return respond({ error: "Ação inválida. Use: generate-budget, generate, status" }, 400);
  } catch (e) {
    console.error("generate-pdf error:", e);
    return respond({ error: "Erro interno" }, 500);
  }
});
