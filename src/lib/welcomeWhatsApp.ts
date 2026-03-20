import { supabase } from "@/lib/supabaseClient";

/**
 * Sends a WhatsApp welcome message to a new user using the admin master's
 * WhatsApp configuration and the active "boas_vindas" template.
 * 
 * This runs client-side after account creation — best-effort, non-blocking.
 */
export async function sendWelcomeWhatsApp(params: {
  nome: string;
  codigoLoja: string;
  email: string;
  senha: string;
  telefone: string; // digits only
}): Promise<void> {
  try {
    // 1. Get admin WhatsApp settings
    const { data: settings } = await supabase
      .from("admin_whatsapp_settings" as any)
      .select("*")
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();

    if (!settings) {
      console.log("[sendWelcomeWhatsApp] WhatsApp integration not active");
      return;
    }

    // 2. Get the active welcome template
    const { data: template } = await supabase
      .from("admin_message_templates" as any)
      .select("conteudo")
      .eq("tipo", "boas_vindas")
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();

    if (!template) {
      console.log("[sendWelcomeWhatsApp] No active welcome template found");
      return;
    }

    // 3. Replace variables
    const message = (template as any).conteudo
      .replace(/\{nome\}/g, params.nome)
      .replace(/\{codigo_loja\}/g, params.codigoLoja)
      .replace(/\{email\}/g, params.email)
      .replace(/\{senha\}/g, params.senha);

    // 4. Send via configured provider
    const s = settings as any;
    const phoneNumber = "55" + params.telefone.replace(/\D/g, "");

    if (s.provider === "evolution" && s.evolution_api_url && s.evolution_api_key && s.evolution_instance_name) {
      const url = `${s.evolution_api_url.replace(/\/$/, "")}/message/sendText/${s.evolution_instance_name}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          apikey: s.evolution_api_key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ number: phoneNumber, text: message }),
      });

      if (res.ok) {
        console.log("[sendWelcomeWhatsApp] Welcome message sent via Evolution API");
      } else {
        console.warn("[sendWelcomeWhatsApp] Evolution API error:", res.status);
      }
    } else {
      console.log("[sendWelcomeWhatsApp] Provider not fully configured, skipping");
    }
  } catch (err) {
    // Non-blocking — don't break the signup flow
    console.error("[sendWelcomeWhatsApp] Error:", err);
  }
}
