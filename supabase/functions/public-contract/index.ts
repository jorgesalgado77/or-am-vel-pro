import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const action = url.searchParams.get("action") || (req.method === "POST" ? (await req.clone().json()).action : null);

    // TRACK: search client_tracking by numero_contrato
    if (action === "track") {
      const numero = url.searchParams.get("numero") || (req.method === "POST" ? (await req.clone().json()).numero : null);
      if (!numero || numero.trim().length < 3) return json({ error: "Informe o número do contrato" }, 400);

      const { data, error } = await supabase
        .from("client_tracking")
        .select("*")
        .eq("numero_contrato", numero.trim())
        .limit(1)
        .maybeSingle();

      if (error || !data) return json({ error: "Contrato não encontrado" }, 404);

      // Also fetch messages
      const { data: messages } = await supabase
        .from("tracking_messages")
        .select("*")
        .eq("tracking_id", data.id)
        .order("created_at", { ascending: true });

      // Mark loja messages as read for client
      await supabase
        .from("tracking_messages")
        .update({ lida: true })
        .eq("tracking_id", data.id)
        .eq("remetente_tipo", "loja")
        .eq("lida", false);

      return json({ tracking: data, messages: messages || [] });
    }

    // TRACK MESSAGE: send a message from client
    if (action === "track-message") {
      const body = await req.json();
      const { tracking_id, mensagem, remetente_nome } = body;
      if (!tracking_id || !mensagem?.trim()) return json({ error: "Dados insuficientes" }, 400);

      const { error } = await supabase.from("tracking_messages").insert({
        tracking_id,
        mensagem: mensagem.trim(),
        remetente_tipo: "cliente",
        remetente_nome: remetente_nome || "Cliente",
      });

      if (error) return json({ error: "Erro ao enviar mensagem" }, 500);
      return json({ success: true });
    }

    // GET contract by token
    if (action === "get" || (req.method === "GET" && !url.searchParams.get("numero"))) {
      const token = url.searchParams.get("token");
      if (!token || token.length < 10) return json({ error: "Token inválido" }, 400);

      const { data, error } = await supabase
        .from("client_contracts")
        .select("id, conteudo_html, created_at, status, client_id, tenant_id")
        .eq("public_token", token)
        .maybeSingle();

      if (error || !data) return json({ error: "Contrato não encontrado" }, 404);

      // Get client name
      const { data: clientData } = await supabase
        .from("clients")
        .select("nome, email, telefone1")
        .eq("id", data.client_id)
        .maybeSingle();

      // Get company info
      let companyName = "";
      if (data.tenant_id) {
        const { data: tenant } = await supabase
          .from("tenants")
          .select("nome")
          .eq("id", data.tenant_id)
          .maybeSingle();
        companyName = tenant?.nome || "";
      }

      return json({
        id: data.id,
        html: data.conteudo_html,
        status: data.status || "rascunho",
        created_at: data.created_at,
        client_name: clientData?.nome || "",
        client_email: clientData?.email || "",
        company_name: companyName,
      });
    }

    // POST sign contract
    if (action === "sign") {
      const body = await req.json();
      const { token, assinatura_base64, selfie_base64, documento_base64, assinado_via } = body;

      if (!token) return json({ error: "Token obrigatório" }, 400);

      const { data: contract, error: fetchErr } = await supabase
        .from("client_contracts")
        .select("id, tenant_id, status")
        .eq("public_token", token)
        .maybeSingle();

      if (fetchErr || !contract) return json({ error: "Contrato não encontrado" }, 404);
      if (contract.status === "assinado") return json({ error: "Contrato já assinado" }, 400);

      const contractId = contract.id;
      const tenantId = contract.tenant_id || "unknown";
      const updates: Record<string, unknown> = {
        status: "assinado",
        assinado_em: new Date().toISOString(),
        assinado_via: assinado_via || "manual",
      };

      // Upload signature image
      if (assinatura_base64) {
        const signBlob = base64ToBlob(assinatura_base64);
        const signPath = `${tenantId}/contracts/${contractId}/assinatura.png`;
        await supabase.storage.from("contract-signatures").upload(signPath, signBlob, { contentType: "image/png", upsert: true });
        const { data: signUrl } = supabase.storage.from("contract-signatures").getPublicUrl(signPath);
        updates.assinatura_url = signUrl.publicUrl;
      }

      // Upload selfie
      if (selfie_base64) {
        const selfBlob = base64ToBlob(selfie_base64);
        const selfPath = `${tenantId}/contracts/${contractId}/selfie.png`;
        await supabase.storage.from("contract-signatures").upload(selfPath, selfBlob, { contentType: "image/png", upsert: true });
        const { data: selfUrl } = supabase.storage.from("contract-signatures").getPublicUrl(selfPath);
        updates.selfie_url = selfUrl.publicUrl;
      }

      // Upload document photo
      if (documento_base64) {
        const docBlob = base64ToBlob(documento_base64);
        const docPath = `${tenantId}/contracts/${contractId}/documento.png`;
        await supabase.storage.from("contract-signatures").upload(docPath, docBlob, { contentType: "image/png", upsert: true });
        const { data: docUrl } = supabase.storage.from("contract-signatures").getPublicUrl(docPath);
        updates.documento_url = docUrl.publicUrl;
      }

      const { error: updateErr } = await supabase
        .from("client_contracts")
        .update(updates)
        .eq("id", contractId);

      if (updateErr) return json({ error: "Erro ao atualizar contrato" }, 500);

      return json({ success: true, status: "assinado" });
    }

    return json({ error: "Ação não reconhecida" }, 400);
  } catch (err) {
    return json({ error: (err as Error).message || "Erro interno" }, 500);
  }
});

function base64ToBlob(base64: string): Uint8Array {
  const clean = base64.includes(",") ? base64.split(",")[1] : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
