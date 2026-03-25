import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("authorization") || "";

    // Verify the caller is an admin master
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return json({ error: "Não autorizado" }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: adminCheck } = await adminClient
      .from("admin_master")
      .select("id")
      .eq("email", user.email)
      .maybeSingle();

    if (!adminCheck) {
      return json({ error: "Acesso negado: apenas administradores master" }, 403);
    }

    const body = await req.json();
    const { action, tenant_id, email, senha_hash, nome } = body;

    if (action === "repair_access") {
      if (!tenant_id || !email || !senha_hash) {
        return json({ error: "tenant_id, email e senha_hash são obrigatórios" }, 400);
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Check if user exists
      const { data: existing } = await adminClient
        .from("usuarios")
        .select("id")
        .eq("tenant_id", tenant_id)
        .ilike("email", normalizedEmail)
        .limit(1);

      const existingUser = Array.isArray(existing) ? existing[0] : null;

      if (existingUser?.id) {
        const { error: updateError } = await adminClient
          .from("usuarios")
          .update({ senha: senha_hash, primeiro_login: true, ativo: true })
          .eq("id", existingUser.id);

        if (updateError) {
          return json({ error: "Erro ao atualizar: " + updateError.message }, 500);
        }

        return json({ action: "updated", user_id: existingUser.id });
      } else {
        const { data: newUser, error: insertError } = await adminClient
          .from("usuarios")
          .insert({
            tenant_id,
            nome_completo: nome || "Admin",
            apelido: "Admin",
            email: normalizedEmail,
            senha: senha_hash,
            primeiro_login: true,
            ativo: true,
          })
          .select("id")
          .single();

        if (insertError) {
          return json({ error: "Erro ao criar: " + insertError.message }, 500);
        }

        return json({ action: "created", user_id: newUser?.id });
      }
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (err) {
    console.error("admin-store error:", err);
    return json({ error: err.message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
