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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("authorization") || "";

    // Verify the caller is an admin master
    const userClient = createClient(supabaseUrl, anonKey, {
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

    if (action === "list_store_users") {
      if (!tenant_id) return json({ error: "tenant_id é obrigatório" }, 400);

      const { data: users, error } = await adminClient
        .from("usuarios")
        .select("id, nome_completo, email, telefone, cargo_id, ativo, tipo_regime, salario_fixo, comissao_percentual, apelido, foto_url")
        .eq("tenant_id", tenant_id)
        .order("ativo", { ascending: false })
        .order("nome_completo");

      if (error) return json({ error: error.message }, 500);

      const cargoIds = [...new Set((users || []).map((user: any) => user.cargo_id).filter(Boolean))];
      let cargoMap: Record<string, string> = {};

      if (cargoIds.length > 0) {
        const { data: cargos } = await adminClient.from("cargos").select("id, nome").in("id", cargoIds as string[]);
        cargoMap = Object.fromEntries((cargos || []).map((cargo: any) => [cargo.id, cargo.nome]));
      }

      return json((users || []).map((user: any) => ({
        ...user,
        cargo_nome: user.cargo_id ? cargoMap[user.cargo_id] || null : null,
      })));
    }

    if (action === "list_store_cargos") {
      if (!tenant_id) return json({ error: "tenant_id é obrigatório" }, 400);

      const { data, error } = await adminClient
        .from("cargos")
        .select("id, nome")
        .eq("tenant_id", tenant_id)
        .order("nome");

      if (error) return json({ error: error.message }, 500);
      return json(data || []);
    }

    if (action === "toggle_store_user") {
      if (!body.user_id) return json({ error: "user_id é obrigatório" }, 400);

      const { error } = await adminClient
        .from("usuarios")
        .update({ ativo: Boolean(body.ativo) })
        .eq("id", body.user_id);

      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    if (action === "delete_store_user") {
      if (!body.user_id || !tenant_id) return json({ error: "user_id e tenant_id são obrigatórios" }, 400);

      const { error } = await adminClient
        .from("usuarios")
        .delete()
        .eq("id", body.user_id)
        .eq("tenant_id", tenant_id);

      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    if (action === "reset_store_user_password") {
      if (!body.user_id || !body.new_password) return json({ error: "user_id e new_password são obrigatórios" }, 400);
      if (String(body.new_password).trim().length < 6) return json({ error: "A senha deve ter ao menos 6 caracteres" }, 400);

      const { data: hashedPassword, error: hashError } = await adminClient.rpc("hash_password", {
        plain_text: String(body.new_password).trim(),
      });

      if (hashError) return json({ error: hashError.message }, 500);

      const { error } = await adminClient
        .from("usuarios")
        .update({ senha: hashedPassword || String(body.new_password).trim(), primeiro_login: true })
        .eq("id", body.user_id);

      if (error) return json({ error: error.message }, 500);

      try {
        await adminClient.rpc("admin_update_user_password", {
          p_user_id: body.user_id,
          p_new_password: String(body.new_password).trim(),
        });
      } catch {
        // noop
      }

      return json({ success: true });
    }

    if (action === "upsert_store_user") {
      if (!tenant_id || !body.nome_completo || !String(body.nome_completo).trim()) {
        return json({ error: "tenant_id e nome_completo são obrigatórios" }, 400);
      }

      if (body.user_id) {
        const { error } = await adminClient
          .from("usuarios")
          .update({
            nome_completo: String(body.nome_completo).trim(),
            email: body.email ? String(body.email).trim() : null,
            telefone: body.telefone ? String(body.telefone).trim() : null,
            cargo_id: body.cargo_id || null,
            tipo_regime: body.tipo_regime || null,
            salario_fixo: Number(body.salario_fixo) || 0,
            comissao_percentual: Number(body.comissao_percentual) || 0,
            ativo: body.ativo !== false,
          })
          .eq("id", body.user_id)
          .eq("tenant_id", tenant_id);

        if (error) return json({ error: error.message }, 500);
        return json({ user_id: body.user_id });
      }

      const { data: hashedPassword, error: hashError } = await adminClient.rpc("hash_password", { plain_text: "123456" });
      if (hashError) return json({ error: hashError.message }, 500);

      const { data, error } = await adminClient
        .from("usuarios")
        .insert({
          tenant_id,
          nome_completo: String(body.nome_completo).trim(),
          email: body.email ? String(body.email).trim() : null,
          telefone: body.telefone ? String(body.telefone).trim() : null,
          cargo_id: body.cargo_id || null,
          tipo_regime: body.tipo_regime || null,
          salario_fixo: Number(body.salario_fixo) || 0,
          comissao_percentual: Number(body.comissao_percentual) || 0,
          ativo: body.ativo !== false,
          senha: hashedPassword || "123456",
          primeiro_login: true,
        })
        .select("id")
        .single();

      if (error) return json({ error: error.message }, 500);
      return json({ user_id: data?.id });
    }

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
