import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    switch (body.action) {
      case "create_store_admin":
        return await handleCreateStoreAdmin(body);
      case "create_tenant_user":
        return await handleCreateTenantUser(req, body);
      default:
        return respond({ success: false, error: "Ação inválida." }, 400);
    }
  } catch (error) {
    console.error("store-signup error:", error);
    return respond({ success: false, error: getFriendlyErrorMessage(error) }, 500);
  }
});

async function handleCreateStoreAdmin(body: Record<string, unknown>) {
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "").trim();

  if (!isValidEmail(email)) {
    return respond({ success: false, error: "Informe um email válido." }, 400);
  }

  if (password.length < 6) {
    return respond({ success: false, error: "A senha deve ter pelo menos 6 caracteres." }, 400);
  }

  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    return respond({ success: false, error: "Este email já está cadastrado." }, 409);
  }

  const created: {
    tenantId?: string;
    cargoId?: string;
    authUserId?: string;
  } = {};

  try {
    const codigoLoja = await generateCodigoLoja();

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .insert({
        nome_loja: "Minha Loja",
        codigo_loja: codigoLoja,
        plano: "trial",
        plano_periodo: "mensal",
        max_usuarios: 999,
        ativo: true,
        email_contato: email,
      })
      .select("id, codigo_loja")
      .single();

    if (tenantError || !tenant) {
      throw new Error(tenantError?.message || "Não foi possível criar a loja.");
    }

    created.tenantId = tenant.id;

    const { error: settingsError } = await supabase.from("company_settings").insert({
      company_name: "Minha Loja",
      company_subtitle: "Orce. Venda. Simplifique",
      tenant_id: tenant.id,
      codigo_loja: codigoLoja,
      email_loja: email,
    });

    if (settingsError) {
      throw new Error(settingsError.message || "Não foi possível criar as configurações da loja.");
    }

    const { data: cargo, error: cargoError } = await supabase
      .from("cargos")
      .insert({
        nome: "Administrador",
        comissao_percentual: 0,
        tenant_id: tenant.id,
        permissoes: {
          clientes: true,
          simulador: true,
          configuracoes: true,
          desconto1: true,
          desconto2: true,
          desconto3: true,
          plus: true,
        },
      })
      .select("id")
      .single();

    if (cargoError || !cargo) {
      throw new Error(cargoError?.message || "Não foi possível criar o cargo administrador.");
    }

    created.cargoId = cargo.id;

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        tenant_id: tenant.id,
        cargo_id: cargo.id,
        nome_completo: email.split("@")[0],
        apelido: "Admin",
      },
    });

    if (authError || !authData.user) {
      throw new Error(authError?.message || "Não foi possível criar o acesso do administrador.");
    }

    created.authUserId = authData.user.id;

    const senhaHash = await hashPassword(password);

    const { error: userError } = await supabase.from("usuarios").insert({
      id: authData.user.id,
      auth_user_id: authData.user.id,
      nome_completo: email.split("@")[0],
      apelido: "Admin",
      email,
      cargo_id: cargo.id,
      tenant_id: tenant.id,
      senha: senhaHash,
      primeiro_login: true,
      ativo: true,
    });

    if (userError) {
      throw new Error(userError.message || "Não foi possível vincular o administrador à loja.");
    }

    return respond({
      success: true,
      data: {
        tenantId: tenant.id,
        codigoLoja: tenant.codigo_loja ?? codigoLoja,
      },
    });
  } catch (error) {
    await rollbackCreatedResources(created);
    return respond({ success: false, error: getFriendlyErrorMessage(error) }, getErrorStatus(error));
  }
}

async function handleCreateTenantUser(req: Request, body: Record<string, unknown>) {
  const authUser = await authenticateRequest(req);

  if (!authUser) {
    return respond({ success: false, error: "Sessão inválida. Faça login novamente." }, 401);
  }

  const caller = await loadAppUser(authUser.id, authUser.email ?? "");
  if (!caller?.tenant_id) {
    return respond({ success: false, error: "Usuário sem loja vinculada." }, 403);
  }

  const callerCargo = caller.cargo_id ? await loadCargo(caller.cargo_id) : null;
  if (!isAdminCargo(callerCargo?.nome)) {
    return respond({ success: false, error: "Apenas administradores podem criar usuários." }, 403);
  }

  const nomeCompleto = String(body.nomeCompleto ?? "").trim();
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "").trim();
  const cargoId = body.cargoId ? String(body.cargoId) : null;

  if (!nomeCompleto) {
    return respond({ success: false, error: "Nome completo é obrigatório." }, 400);
  }

  if (!isValidEmail(email)) {
    return respond({ success: false, error: "Informe um email válido." }, 400);
  }

  if (password.length < 6) {
    return respond({ success: false, error: "A senha deve ter pelo menos 6 caracteres." }, 400);
  }

  if (await findUserByEmail(email)) {
    return respond({ success: false, error: "Este email já está cadastrado." }, 409);
  }

  if (cargoId) {
    const { data: cargo } = await supabase
      .from("cargos")
      .select("id")
      .eq("id", cargoId)
      .eq("tenant_id", caller.tenant_id)
      .maybeSingle();

    if (!cargo) {
      return respond({ success: false, error: "Cargo inválido para esta loja." }, 400);
    }
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("codigo_loja")
    .eq("id", caller.tenant_id)
    .maybeSingle();

  let createdAuthUserId: string | null = null;

  try {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        tenant_id: caller.tenant_id,
        cargo_id: cargoId,
        nome_completo: nomeCompleto,
        apelido: body.apelido ? String(body.apelido) : null,
      },
    });

    if (authError || !authData.user) {
      throw new Error(authError?.message || "Não foi possível criar o acesso do usuário.");
    }

    createdAuthUserId = authData.user.id;
    const senhaHash = await hashPassword(password);

    const { error: userError } = await supabase.from("usuarios").insert({
      id: authData.user.id,
      auth_user_id: authData.user.id,
      nome_completo: nomeCompleto,
      apelido: body.apelido ? String(body.apelido).trim() || null : null,
      telefone: body.telefone ? String(body.telefone).trim() || null : null,
      email,
      cargo_id: cargoId,
      foto_url: body.fotoUrl ? String(body.fotoUrl) || null : null,
      primeiro_login: true,
      senha: senhaHash,
      tenant_id: caller.tenant_id,
      ativo: true,
      tipo_regime: body.tipoRegime ? String(body.tipoRegime) || null : null,
      comissao_percentual: typeof body.comissaoPercentual === "number" ? body.comissaoPercentual : 0,
      salario_fixo: typeof body.salarioFixo === "number" ? body.salarioFixo : 0,
    });

    if (userError) {
      throw new Error(userError.message || "Não foi possível vincular o usuário à loja.");
    }

    return respond({
      success: true,
      data: {
        userId: authData.user.id,
        codigoLoja: tenant?.codigo_loja ?? null,
      },
    });
  } catch (error) {
    if (createdAuthUserId) {
      await supabase.auth.admin.deleteUser(createdAuthUserId);
    }

    return respond({ success: false, error: getFriendlyErrorMessage(error) }, getErrorStatus(error));
  }
}

async function authenticateRequest(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "").trim();

  if (!token) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  return data.user;
}

async function loadAppUser(authUserId: string, email: string) {
  const byId = await supabase
    .from("usuarios")
    .select("id, tenant_id, cargo_id, email")
    .eq("id", authUserId)
    .maybeSingle();

  if (byId.data) {
    return byId.data;
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const byEmail = await supabase
    .from("usuarios")
    .select("id, tenant_id, cargo_id, email")
    .eq("email", normalizedEmail)
    .maybeSingle();

  return byEmail.data ?? null;
}

async function loadCargo(cargoId: string) {
  const { data } = await supabase
    .from("cargos")
    .select("id, nome, tenant_id, permissoes")
    .eq("id", cargoId)
    .maybeSingle();

  return data;
}

async function findUserByEmail(email: string) {
  if (!email) {
    return null;
  }

  const { data } = await supabase
    .from("usuarios")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  return data;
}

async function hashPassword(password: string) {
  const { data, error } = await supabase.rpc("hash_password", { plain_text: password });

  if (error) {
    console.error("hash_password error:", error);
    return null;
  }

  return data;
}

async function rollbackCreatedResources(created: { tenantId?: string; cargoId?: string; authUserId?: string }) {
  if (created.authUserId) {
    await supabase.auth.admin.deleteUser(created.authUserId);
    await supabase.from("usuarios").delete().eq("id", created.authUserId);
  }

  if (created.cargoId) {
    await supabase.from("cargos").delete().eq("id", created.cargoId);
  }

  if (created.tenantId) {
    await supabase.from("company_settings").delete().eq("tenant_id", created.tenantId);
    await supabase.from("tenants").delete().eq("id", created.tenantId);
  }
}

async function generateCodigoLoja() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const digits = String(Math.floor(100000 + Math.random() * 900000));
    const codigo = `${digits.slice(0, 3)}.${digits.slice(3, 6)}`;

    const { data } = await supabase
      .from("tenants")
      .select("id")
      .eq("codigo_loja", codigo)
      .maybeSingle();

    if (!data) {
      return codigo;
    }
  }

  const fallback = Date.now().toString().slice(-6);
  return `${fallback.slice(0, 3)}.${fallback.slice(3, 6)}`;
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isAdminCargo(nome?: string | null) {
  return Boolean(nome?.toUpperCase().includes("ADMIN"));
}

function getFriendlyErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro interno ao processar a solicitação.";

  if (/already registered|already been registered|duplicate|unique/i.test(message)) {
    return "Este email já está cadastrado.";
  }

  return message;
}

function getErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /already registered|already been registered|duplicate|unique/i.test(message) ? 409 : 400;
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
