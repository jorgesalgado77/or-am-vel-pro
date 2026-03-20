import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ScheduleStage {
  stage: string;
  delayMs: number;
}

const STAGES: ScheduleStage[] = [
  { stage: "1h", delayMs: 60 * 60 * 1000 },
  { stage: "24h", delayMs: 24 * 60 * 60 * 1000 },
  { stage: "3d", delayMs: 3 * 24 * 60 * 60 * 1000 },
];

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

    // 1) Process due follow-ups: generate messages and mark sent
    const { data: dueSchedules } = await supabase
      .from("followup_schedules")
      .select("*, followup_config!inner(enabled, max_daily_total, daily_count)")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .limit(20);

    let sentCount = 0;

    for (const schedule of dueSchedules || []) {
      const cfg = (schedule as any).followup_config;
      if (!cfg?.enabled) continue;
      if ((cfg.daily_count || 0) >= (cfg.max_daily_total || 50)) continue;

      // Get client info
      const { data: client } = await supabase
        .from("clients")
        .select("nome, status, telefone1, updated_at")
        .eq("id", schedule.client_id)
        .maybeSingle();

      if (!client) continue;

      // Check if client responded since schedule was created
      const clientUpdated = new Date(client.updated_at).getTime();
      const scheduleCreated = new Date(schedule.created_at).getTime();
      if (clientUpdated > scheduleCreated) {
        // Client responded — cancel remaining follow-ups
        await supabase
          .from("followup_schedules")
          .update({ status: "cancelled" })
          .eq("client_id", schedule.client_id)
          .in("status", ["pending", "paused"]);
        continue;
      }

      // Get VendaZap addon for prompt
      const { data: addon } = await supabase
        .from("vendazap_addon")
        .select("prompt_sistema, openai_model")
        .eq("tenant_id", schedule.tenant_id)
        .eq("ativo", true)
        .maybeSingle();

      const stagePrompts: Record<string, string> = {
        "1h": `Gere uma mensagem de follow-up rápida para ${client.nome} que não respondeu há pouco tempo. Tom leve e consultivo. Mensagem curta para WhatsApp.`,
        "24h": `Gere uma mensagem de follow-up para ${client.nome} que não responde há 1 dia. Reforce o valor da proposta. Tom amigável e profissional. Mensagem curta para WhatsApp.`,
        "3d": `Gere uma última mensagem de follow-up para ${client.nome} que não responde há 3 dias. Crie senso de urgência sutil e ofereça ajuda. Tom consultivo. Mensagem curta para WhatsApp.`,
      };

      const userPrompt = stagePrompts[schedule.stage] || stagePrompts["24h"];
      const systemPrompt = addon?.prompt_sistema ||
        "Você é um assistente de vendas especializado em móveis planejados. Gere mensagens persuasivas para WhatsApp em português brasileiro. Não use emojis excessivos.";

      try {
        const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: addon?.openai_model || "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            max_tokens: 250,
            temperature: 0.7,
          }),
        });

        if (!openaiRes.ok) continue;

        const aiData = await openaiRes.json();
        const message = aiData.choices?.[0]?.message?.content || "";
        if (!message) continue;

        // Update schedule with message and mark sent
        await supabase
          .from("followup_schedules")
          .update({
            status: "sent",
            generated_message: message,
            sent_at: new Date().toISOString(),
          })
          .eq("id", schedule.id);

        // Increment daily counter
        await supabase
          .from("followup_config")
          .update({ daily_count: (cfg.daily_count || 0) + 1 })
          .eq("tenant_id", schedule.tenant_id);

        // Create a vendazap_trigger for notification
        await supabase.from("vendazap_triggers").insert({
          tenant_id: schedule.tenant_id,
          client_id: schedule.client_id,
          trigger_type: "no_response",
          generated_message: `[Follow-up ${schedule.stage}] ${message}`,
          status: "pending",
        });

        sentCount++;
      } catch (err) {
        console.error(`Error processing follow-up ${schedule.id}:`, err);
      }
    }

    // 2) Create new schedules for clients without active follow-ups
    const { data: configs } = await supabase
      .from("followup_config")
      .select("*")
      .eq("enabled", true);

    let createdCount = 0;

    for (const cfg of configs || []) {
      // Get clients that haven't been updated recently and have no active follow-ups
      const { data: clients } = await supabase
        .from("clients")
        .select("id, nome, updated_at")
        .eq("tenant_id", cfg.tenant_id)
        .neq("status", "fechado")
        .neq("status", "perdido");

      if (!clients) continue;

      for (const client of clients) {
        const hoursSinceUpdate = (Date.now() - new Date(client.updated_at).getTime()) / (1000 * 60 * 60);
        if (hoursSinceUpdate < 1) continue; // Too recent

        // Check existing follow-ups for this client
        const { data: existing } = await supabase
          .from("followup_schedules")
          .select("id, stage")
          .eq("client_id", client.id)
          .in("status", ["pending", "paused", "sent"])
          .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

        const existingStages = new Set((existing || []).map((e: any) => e.stage));
        const totalExisting = (existing || []).length;

        if (totalExisting >= (cfg.max_followups_per_client || 3)) continue;

        const activeStages = STAGES.filter((s) => {
          const key = `stage_${s.stage}` as keyof typeof cfg;
          return cfg[key] !== false;
        });

        for (const stageDef of activeStages) {
          if (existingStages.has(stageDef.stage)) continue;

          // Check if enough time has passed for this stage
          const hoursSinceUpdateMs = Date.now() - new Date(client.updated_at).getTime();
          if (hoursSinceUpdateMs < stageDef.delayMs * 0.8) continue; // Not yet time

          const scheduledAt = new Date(
            new Date(client.updated_at).getTime() + stageDef.delayMs
          ).toISOString();

          await supabase.from("followup_schedules").insert({
            tenant_id: cfg.tenant_id,
            client_id: client.id,
            stage: stageDef.stage,
            status: "pending",
            scheduled_at: scheduledAt,
          });

          createdCount++;
          break; // Only create next stage, not all at once
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: "Follow-ups processed",
        sent: sentCount,
        created: createdCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("followup-scheduler error:", e);
    return new Response(
      JSON.stringify({ error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
