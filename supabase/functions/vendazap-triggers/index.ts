import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get all active vendazap addons
    const { data: addons } = await supabase
      .from("vendazap_addon")
      .select("*")
      .eq("ativo", true);

    if (!addons || addons.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active addons", triggers_created: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalTriggersCreated = 0;

    for (const addon of addons) {
      const tenantId = addon.tenant_id;

      // Get company settings for budget validity
      const { data: settings } = await supabase
        .from("company_settings")
        .select("budget_validity_days")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      const budgetValidityDays = settings?.budget_validity_days || 30;

      // Get all active clients for this tenant
      const { data: clients } = await supabase
        .from("clients")
        .select("id, nome, status, updated_at, telefone1")
        .eq("tenant_id", tenantId)
        .neq("status", "fechado")
        .neq("status", "perdido");

      if (!clients || clients.length === 0) continue;

      for (const client of clients) {
        const daysSinceUpdate = Math.floor(
          (Date.now() - new Date(client.updated_at).getTime()) / (1000 * 60 * 60 * 24)
        );

        // Check for existing pending triggers to avoid duplicates
        const { data: existingTriggers } = await supabase
          .from("vendazap_triggers")
          .select("id, trigger_type")
          .eq("client_id", client.id)
          .eq("status", "pending");

        const existingTypes = new Set(
          (existingTriggers || []).map((t: any) => t.trigger_type)
        );

        const triggersToCreate: string[] = [];

        // NO_RESPONSE: client hasn't responded in 5+ days
        if (daysSinceUpdate >= 5 && !existingTypes.has("no_response")) {
          triggersToCreate.push("no_response");
        }

        // EXPIRING_BUDGET: get latest simulation and check if close to expiry
        if (!existingTypes.has("expiring_budget")) {
          const { data: latestSim } = await supabase
            .from("simulations")
            .select("created_at")
            .eq("client_id", client.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestSim) {
            const simDate = new Date(latestSim.created_at);
            const expiryDate = new Date(simDate.getTime() + budgetValidityDays * 24 * 60 * 60 * 1000);
            const daysUntilExpiry = Math.floor(
              (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            );

            if (daysUntilExpiry >= 0 && daysUntilExpiry <= 3) {
              triggersToCreate.push("expiring_budget");
            }
          }
        }

        // VIEWED_NO_REPLY: check deal room views without response
        if (!existingTypes.has("viewed_no_reply")) {
          const { data: views } = await supabase
            .from("dealroom_views")
            .select("created_at")
            .eq("client_id", client.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (views && daysSinceUpdate >= 2) {
            const viewDate = new Date(views.created_at);
            const updateDate = new Date(client.updated_at);
            if (viewDate > updateDate) {
              triggersToCreate.push("viewed_no_reply");
            }
          }
        }

        // Generate messages for each trigger
        for (const triggerType of triggersToCreate) {
          let userPrompt = "";
          switch (triggerType) {
            case "no_response":
              userPrompt = `Gere uma mensagem de reativação para o cliente ${client.nome} que não responde há ${daysSinceUpdate} dias. Tom amigável e profissional. Mensagem curta para WhatsApp.`;
              break;
            case "expiring_budget":
              userPrompt = `Gere uma mensagem urgente para o cliente ${client.nome} avisando que o orçamento está prestes a expirar. Crie senso de urgência de forma profissional. Mensagem curta para WhatsApp.`;
              break;
            case "viewed_no_reply":
              userPrompt = `Gere uma mensagem para o cliente ${client.nome} que visualizou a proposta mas não respondeu. Seja sutil e consultivo. Mensagem curta para WhatsApp.`;
              break;
          }

          const systemPrompt =
            addon.prompt_sistema ||
            "Você é um assistente de vendas especializado em móveis planejados. Gere mensagens persuasivas para WhatsApp em português brasileiro.";

          try {
            const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${openaiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: addon.openai_model || "gpt-4o-mini",
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: userPrompt },
                ],
                max_tokens: 300,
                temperature: 0.7,
              }),
            });

            if (!openaiRes.ok) continue;

            const openaiData = await openaiRes.json();
            const generatedMessage = openaiData.choices?.[0]?.message?.content || "";

            if (!generatedMessage) continue;

            await supabase.from("vendazap_triggers").insert({
              tenant_id: tenantId,
              client_id: client.id,
              trigger_type: triggerType,
              generated_message: generatedMessage,
              status: "pending",
            });

            totalTriggersCreated++;
          } catch (err) {
            console.error(`Error generating trigger for ${client.id}:`, err);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ message: "Triggers processed", triggers_created: totalTriggersCreated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("vendazap-triggers error:", e);
    return new Response(
      JSON.stringify({ error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
