/**
 * PDF Generator Gateway — Generate proposal PDFs via external services
 * 
 * Supports: PDFMonkey, PDF Generator API, and internal (jsPDF fallback)
 * Uses tenant-specific config from document_providers table.
 * Actions: generate, status, listTemplates
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

interface ProviderConfig {
  apiKey: string;
  apiUrl: string;
  templateId: string;
  config: Record<string, unknown>;
  provider: string;
}

async function resolveProvider(tenantId: string | null, preferProvider?: string): Promise<ProviderConfig | null> {
  if (!tenantId) return null;

  const sb = getSupabaseAdmin();

  // Try preferred provider first, then any active
  const providers = preferProvider ? [preferProvider] : ["pdfmonkey", "pdfgenerator", "internal"];

  for (const provider of providers) {
    const { data } = await sb.rpc("get_document_provider", { p_tenant_id: tenantId, p_provider: provider });
    if (data && data.length > 0 && (data[0].api_key || provider === "internal")) {
      return {
        apiKey: data[0].api_key || "",
        apiUrl: data[0].api_url || "",
        templateId: data[0].template_id || "",
        config: data[0].config || {},
        provider,
      };
    }
  }

  // Fallback to api_keys table
  const { data } = await sb.rpc("get_api_config", { p_tenant_id: tenantId, p_provider: "pdf" });
  if (data && data.length > 0 && data[0].api_key) {
    return {
      apiKey: data[0].api_key,
      apiUrl: data[0].api_url || "",
      templateId: "",
      config: {},
      provider: "pdfmonkey",
    };
  }

  return null;
}

// ── PDFMonkey ──
async function generateViaPDFMonkey(config: ProviderConfig, templateData: Record<string, unknown>) {
  const apiUrl = config.apiUrl || "https://api.pdfmonkey.io/api/v1";
  const templateId = (templateData.template_id as string) || config.templateId;

  if (!templateId) {
    return { success: false, error: "template_id não configurado para PDFMonkey" };
  }

  const res = await fetch(`${apiUrl}/documents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      document: {
        document_template_id: templateId,
        payload: templateData.payload || templateData,
        status: "pending",
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return { success: false, error: `PDFMonkey [${res.status}]: ${errText}` };
  }

  const data = await res.json();
  return {
    success: true,
    document_id: data.document?.id,
    status: data.document?.status,
    download_url: data.document?.download_url,
    preview_url: data.document?.preview_url,
  };
}

// ── PDF Generator API ──
async function generateViaPDFGenerator(config: ProviderConfig, templateData: Record<string, unknown>) {
  const apiUrl = config.apiUrl || "https://us1.pdfgeneratorapi.com/api/v4";
  const templateId = (templateData.template_id as string) || config.templateId;

  if (!templateId) {
    return { success: false, error: "template_id não configurado para PDF Generator" };
  }

  const res = await fetch(`${apiUrl}/documents/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      template: { id: Number(templateId), data: templateData.payload || templateData },
      format: "pdf",
      output: "url",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return { success: false, error: `PDFGenerator [${res.status}]: ${errText}` };
  }

  const data = await res.json();
  return {
    success: true,
    download_url: data.response,
    meta: data.meta,
  };
}

// ── Check PDFMonkey Document Status ──
async function checkPDFMonkeyStatus(config: ProviderConfig, documentId: string) {
  const apiUrl = config.apiUrl || "https://api.pdfmonkey.io/api/v1";

  const res = await fetch(`${apiUrl}/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });

  if (!res.ok) {
    return { success: false, error: `[${res.status}]` };
  }

  const data = await res.json();
  return {
    success: true,
    status: data.document?.status,
    download_url: data.document?.download_url,
    preview_url: data.document?.preview_url,
  };
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
    const { action, tenant_id, provider: preferProvider } = body;

    // ── Generate PDF ──
    if (action === "generate") {
      const providerConfig = await resolveProvider(tenant_id, preferProvider);
      if (!providerConfig) {
        return respond({ error: "Provedor de PDF não configurado. Adicione em Configurações > APIs." }, 400);
      }

      let result;
      switch (providerConfig.provider) {
        case "pdfmonkey":
          result = await generateViaPDFMonkey(providerConfig, body.data || {});
          break;
        case "pdfgenerator":
          result = await generateViaPDFGenerator(providerConfig, body.data || {});
          break;
        case "internal":
          // Internal provider: return data for client-side jsPDF generation
          return respond({
            success: true,
            provider: "internal",
            message: "Use jsPDF no frontend para gerar o PDF com os dados fornecidos",
            data: body.data,
          });
        default:
          return respond({ error: `Provedor desconhecido: ${providerConfig.provider}` }, 400);
      }

      return respond({ ...result, provider: providerConfig.provider }, result.success ? 200 : 502);
    }

    // ── Check Status (PDFMonkey) ──
    if (action === "status") {
      const { document_id } = body;
      if (!document_id) return respond({ error: "document_id obrigatório" }, 400);

      const providerConfig = await resolveProvider(tenant_id, "pdfmonkey");
      if (!providerConfig) {
        return respond({ error: "PDFMonkey não configurado" }, 400);
      }

      const result = await checkPDFMonkeyStatus(providerConfig, document_id);
      return respond(result, result.success ? 200 : 502);
    }

    return respond({ error: "Ação inválida. Use: generate, status" }, 400);
  } catch (e) {
    console.error("generate-pdf error:", e);
    return respond({ error: "Erro interno" }, 500);
  }
});
