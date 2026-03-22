/**
 * Login Diagnostic Service
 * Logs login attempts for support and debugging.
 * Fire-and-forget — never blocks UI.
 */
import { supabase } from "@/lib/supabaseClient";

export type DiagnosticResult =
  | "sucesso"
  | "falha_credencial"
  | "falha_tenant"
  | "falha_vinculo"
  | "falha_plano"
  | "falha_inativo"
  | "falha_email_nao_confirmado"
  | "falha_desconhecida";

interface DiagnosticInput {
  email?: string;
  codigo_loja?: string;
  tenant_id?: string | null;
  usuario_id?: string | null;
  cargo_nome?: string | null;
  auth_user_id?: string | null;
  resultado: DiagnosticResult;
  detalhes?: Record<string, unknown>;
}

export function logLoginDiagnostic(input: DiagnosticInput): void {
  const payload = {
    p_email: input.email || null,
    p_codigo_loja: input.codigo_loja || null,
    p_tenant_id: input.tenant_id || null,
    p_usuario_id: input.usuario_id || null,
    p_cargo_nome: input.cargo_nome || null,
    p_auth_user_id: input.auth_user_id || null,
    p_resultado: input.resultado,
    p_detalhes: input.detalhes || {},
  };

  void (supabase as any)
    .rpc("log_login_diagnostic", payload)
    .then(({ error }: any) => {
      if (error) {
        const message = String(error.message || "");
        const isMissingRpc = error.code === "PGRST202" || message.includes("schema cache") || message.includes("Could not find the function");

        if (isMissingRpc) {
          console.warn("[Diagnostic] RPC log_login_diagnostic não existe no banco externo; tentando insert direto.");
        }

        return supabase
          .from("login_diagnostics" as any)
          .insert({
            email: input.email,
            codigo_loja: input.codigo_loja,
            tenant_id: input.tenant_id,
            usuario_id: input.usuario_id,
            cargo_nome: input.cargo_nome,
            auth_user_id: input.auth_user_id,
            resultado: input.resultado,
            detalhes: input.detalhes || {},
          } as any)
          .then(({ error: insertErr }: any) => {
            if (insertErr) {
              console.warn("[Diagnostic] Falha no fallback insert de login_diagnostics:", insertErr.message);
            }
          });
      }

      return undefined;
    })
    .catch((err: any) => {
      console.warn("[Diagnostic] Erro inesperado ao registrar diagnóstico de login:", err?.message || err);
    });
}
