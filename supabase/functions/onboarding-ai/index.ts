import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface OnboardingContext {
  tenant: Record<string, unknown> | null;
  apiKeys: string[];
  whatsappConnected: boolean;
  companySettings: Record<string, unknown> | null;
  onboardingPrefs: Record<string, unknown> | null;
  completedSteps: string[];
}

async function getOnboardingContext(
  supabase: ReturnType<typeof createClient>,
  tenantId: string
): Promise<OnboardingContext> {
  const [tenantRes, apiKeysRes, whatsappRes, companyRes, prefsRes] =
    await Promise.all([
      supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle(),
      supabase
        .from("api_keys")
        .select("provider, is_active")
        .eq("tenant_id", tenantId)
        .eq("is_active", true),
      supabase
        .from("whatsapp_instances")
        .select("status")
        .eq("tenant_id", tenantId)
        .eq("status", "connected"),
      supabase
        .from("company_settings")
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      supabase
        .from("onboarding_ai_context")
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
    ]);

  const activeApis = (apiKeysRes.data || []).map(
    (k: { provider: string }) => k.provider
  );
  const whatsappConnected = (whatsappRes.data || []).length > 0;

  const completedSteps: string[] = [];
  if (companyRes.data?.company_name) completedSteps.push("company_info");
  if (activeApis.includes("openai")) completedSteps.push("openai_api");
  if (activeApis.includes("evolution")) completedSteps.push("evolution_api");
  if (activeApis.includes("resend")) completedSteps.push("resend_api");
  if (whatsappConnected) completedSteps.push("whatsapp_connected");

  return {
    tenant: tenantRes.data,
    apiKeys: activeApis,
    whatsappConnected,
    companySettings: companyRes.data,
    onboardingPrefs: prefsRes.data,
    completedSteps,
  };
}

function buildSystemPrompt(ctx: OnboardingContext): string {
  const storeName = (ctx.tenant as any)?.nome_loja || "sua loja";
  const plan = (ctx.tenant as any)?.plano || "trial";
  const prefs = ctx.onboardingPrefs as any;

  let storeContext = "";
  if (prefs) {
    storeContext = `
PERFIL DA LOJA:
- Tipo: ${prefs.store_type || "não definido"}
- Ticket médio: ${prefs.average_ticket || "não definido"}
- Região: ${prefs.region || "não definida"}
- Público-alvo: ${prefs.target_audience || "não definido"}
`;
  }

  return `Você é a assistente de onboarding do OrçaMóvel PRO, especialista em móveis planejados.
Seu nome é "Mia" e você fala de forma simpática, direta e sem termos técnicos.

LOJA: "${storeName}" | PLANO: ${plan}
${storeContext}
PROGRESSO ATUAL:
- APIs configuradas: ${ctx.apiKeys.length > 0 ? ctx.apiKeys.join(", ") : "nenhuma"}
- WhatsApp: ${ctx.whatsappConnected ? "✅ conectado" : "❌ não conectado"}
- Etapas concluídas: ${ctx.completedSteps.length > 0 ? ctx.completedSteps.join(", ") : "nenhuma"}

REGRAS:
1. Guie o usuário passo a passo pela configuração da loja
2. Quando o usuário enviar uma API key, identifique o provedor e responda com JSON de ação:
   {"action":"save_api_key","provider":"openai","key":"sk-..."}
3. Se o usuário perguntar sobre WhatsApp/Evolution, explique como conectar via QR Code
4. Se todas as etapas estiverem completas, parabenize e sugira criar o primeiro orçamento
5. Fale como especialista em móveis planejados - use termos do setor
6. Nunca invente dados da loja - use apenas o contexto fornecido
7. Quando perguntar sobre o tipo de loja, ofereça opções: Alto Padrão, Popular, Corporativo, Misto
8. Seja BREVE - respostas de no máximo 3 parágrafos

FLUXO IDEAL:
1. Saudação → perguntar tipo de loja e ticket médio
2. Configurar OpenAI API (IA de vendas)
3. Configurar Evolution API (WhatsApp)
4. Testar conexões
5. Criar primeiro projeto/orçamento
6. Onboarding completo 🎉`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify JWT
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!
    ).auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, tenant_id, messages, preferences } = body;

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ error: "tenant_id obrigatório" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Action: save preferences
    if (action === "save_preferences") {
      const { error } = await supabase.from("onboarding_ai_context").upsert(
        {
          tenant_id,
          ...preferences,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id" }
      );

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: validate_api_key
    if (action === "validate_api_key") {
      const { provider, api_key, api_url } = body;
      let valid = false;
      let errorMsg = "";

      try {
        if (provider === "openai") {
          const res = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${api_key}` },
          });
          valid = res.ok;
          if (!valid) errorMsg = "Chave OpenAI inválida ou sem créditos";
        } else if (provider === "evolution") {
          if (!api_url) {
            errorMsg = "URL da Evolution API é obrigatória";
          } else {
            const res = await fetch(`${api_url}/instance/fetchInstances`, {
              headers: { apikey: api_key },
            });
            valid = res.ok;
            if (!valid) errorMsg = "Chave ou URL da Evolution inválida";
          }
        } else if (provider === "resend") {
          const res = await fetch("https://api.resend.com/domains", {
            headers: { Authorization: `Bearer ${api_key}` },
          });
          valid = res.ok;
          if (!valid) errorMsg = "Chave Resend inválida";
        } else {
          // For other providers just validate format
          valid = api_key.length > 10;
          if (!valid) errorMsg = "Chave muito curta";
        }
      } catch (e) {
        errorMsg = `Erro de conexão: ${(e as Error).message}`;
      }

      if (valid) {
        // Auto-save valid key
        const existing = await supabase
          .from("api_keys")
          .select("id")
          .eq("tenant_id", tenant_id)
          .eq("provider", provider)
          .maybeSingle();

        if (existing.data) {
          await supabase
            .from("api_keys")
            .update({
              api_key,
              api_url: api_url || null,
              is_active: true,
            })
            .eq("id", existing.data.id);
        } else {
          await supabase.from("api_keys").insert({
            tenant_id,
            provider,
            api_key,
            api_url: api_url || null,
            is_active: true,
          });
        }
      }

      return new Response(
        JSON.stringify({ valid, error: errorMsg || undefined }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Action: chat (default)
    const ctx = await getOnboardingContext(supabase, tenant_id);

    // Get tenant's OpenAI key
    const { data: openaiKey } = await supabase
      .from("api_keys")
      .select("api_key")
      .eq("tenant_id", tenant_id)
      .eq("provider", "openai")
      .eq("is_active", true)
      .maybeSingle();

    // Fallback: check global OpenAI key
    const aiKey =
      openaiKey?.api_key || Deno.env.get("OPENAI_API_KEY");

    if (!aiKey) {
      // Return a helpful canned response without AI
      const cannedResponse = getCannedResponse(ctx, messages);
      return new Response(
        JSON.stringify({ reply: cannedResponse, context: ctx }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const systemPrompt = buildSystemPrompt(ctx);

    const chatMessages = [
      { role: "system", content: systemPrompt },
      ...(messages || []).slice(-20), // limit context window
    ];

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: chatMessages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("OpenAI error:", errText);
      const cannedResponse = getCannedResponse(ctx, messages);
      return new Response(
        JSON.stringify({ reply: cannedResponse, context: ctx }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const aiData = await aiRes.json();
    const reply =
      aiData.choices?.[0]?.message?.content || "Desculpe, não entendi. Pode repetir?";

    // Save conversation
    const lastUserMsg = (messages || []).filter(
      (m: { role: string }) => m.role === "user"
    );
    const lastMsg = lastUserMsg[lastUserMsg.length - 1]?.content || "";

    await supabase.from("onboarding_ai_conversations").insert({
      tenant_id,
      user_id: user.id,
      user_message: lastMsg,
      ai_response: reply,
    });

    return new Response(JSON.stringify({ reply, context: ctx }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("onboarding-ai error:", err);
    return new Response(
      JSON.stringify({
        error: (err as Error).message || "Erro interno",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function getCannedResponse(
  ctx: OnboardingContext,
  messages?: { role: string; content: string }[]
): string {
  const lastMsg =
    (messages || [])
      .filter((m) => m.role === "user")
      .pop()?.content?.toLowerCase() || "";

  if (ctx.completedSteps.length === 0) {
    return `Olá! 👋 Sou a Mia, sua assistente de configuração do OrçaMóvel PRO!

Vou te ajudar a deixar tudo pronto. Para começar, me conta:
- Que tipo de loja você tem? (Alto Padrão, Popular, Corporativo ou Misto)
- Qual seu ticket médio por projeto?

💡 **Dica:** Para eu te ajudar com a IA de vendas, você vai precisar de uma chave da OpenAI. Se ainda não tem, acesse platform.openai.com e crie uma conta.`;
  }

  if (!ctx.apiKeys.includes("openai")) {
    return `Agora precisamos configurar a IA de vendas! 🤖

Cole aqui sua **API Key da OpenAI** (começa com "sk-..."). 
Eu vou validar automaticamente e configurar tudo pra você.

Se não tem uma chave ainda, acesse: https://platform.openai.com/api-keys`;
  }

  if (!ctx.whatsappConnected) {
    return `IA de vendas configurada! ✅ Agora vamos conectar o WhatsApp.

Vá em **Configurações > WhatsApp** e crie uma instância. Depois escaneie o QR Code com seu celular.

Se precisar de ajuda com a Evolution API, me mande sua chave que eu configuro automaticamente.`;
  }

  return `Parabéns! 🎉 Seu sistema está quase 100% configurado!

✅ IA de vendas ativa
✅ WhatsApp conectado
${ctx.apiKeys.includes("resend") ? "✅ Email configurado" : "⏳ Email (opcional)"}

Que tal criar seu primeiro orçamento? Vá em **Simulador** e teste!`;
}
