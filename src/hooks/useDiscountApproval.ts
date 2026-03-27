import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { logAudit, getAuditUserInfo } from "@/services/auditService";

interface SalesRulesCache {
  min_margin: number;
  max_discount: number;
  approval_required_above: number | null;
  max_parcelas: number | null;
}

interface DiscountCheckResult {
  allowed: boolean;
  violations: string[];
  needsApproval: boolean;
}

export function useDiscountApproval() {
  const [rules, setRules] = useState<SalesRulesCache | null>(null);
  const [pendingApproval, setPendingApproval] = useState(false);

  const loadRules = useCallback(async () => {
    const tenantId = await getResolvedTenantId();
    if (!tenantId) return null;

    const { data } = await supabase
      .from("sales_rules" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (data) {
      const r: SalesRulesCache = {
        min_margin: Number((data as any).min_margin) || 0,
        max_discount: Number((data as any).max_discount) || 100,
        approval_required_above: (data as any).approval_required_above
          ? Number((data as any).approval_required_above)
          : null,
        max_parcelas: (data as any).max_parcelas
          ? Number((data as any).max_parcelas)
          : null,
      };
      setRules(r);
      return r;
    }
    return null;
  }, []);

  const checkDiscount = useCallback(
    (
      valorBase: number,
      desconto1: number,
      desconto2: number,
      desconto3: number,
      plusPercentual: number,
      currentRules?: SalesRulesCache | null
    ): DiscountCheckResult => {
      const r = currentRules ?? rules;
      if (!r) return { allowed: true, violations: [], needsApproval: false };

      const valorDesc =
        valorBase *
        (1 - desconto1 / 100) *
        (1 - desconto2 / 100) *
        (1 - desconto3 / 100);
      const discPct =
        valorBase > 0 ? ((valorBase - valorDesc) / valorBase) * 100 : 0;
      const margin = 100 - discPct + plusPercentual;

      const violations: string[] = [];
      let needsApproval = false;

      if (r.max_discount < 100 && discPct > r.max_discount) {
        violations.push(
          `Desconto de ${discPct.toFixed(1)}% excede o limite de ${r.max_discount}%`
        );
        needsApproval = true;
      }

      if (r.min_margin > 0 && margin < r.min_margin) {
        violations.push(
          `Margem de ${margin.toFixed(1)}% abaixo do mínimo de ${r.min_margin}%`
        );
        needsApproval = true;
      }

      if (
        r.approval_required_above &&
        valorDesc > r.approval_required_above
      ) {
        violations.push(
          `Valor de R$ ${valorDesc.toLocaleString("pt-BR")} acima do limite de aprovação`
        );
        needsApproval = true;
      }

      return {
        allowed: !needsApproval,
        violations,
        needsApproval,
      };
    },
    [rules]
  );

  const requestApproval = useCallback(
    async (opts: {
      clientName: string;
      vendedorName: string;
      valorFinal: number;
      discountPercent: number;
      violations: string[];
    }) => {
      const tenantId = await getResolvedTenantId();
      if (!tenantId) return;

      setPendingApproval(true);

      // Find managers/admins to notify
      const { data: managers } = await supabase
        .from("usuarios" as any)
        .select("id, nome_completo, cargo_id, cargos(nome)")
        .eq("tenant_id", tenantId)
        .eq("ativo", true);

      const adminUsers = (managers as any[] || []).filter((u: any) => {
        const cargoNome = u.cargos?.nome?.toLowerCase() || "";
        return cargoNome.includes("administrador") || cargoNome.includes("gerente");
      });

      // Create notification in audit_logs for visibility
      const userInfo = getAuditUserInfo();
      await logAudit({
        acao: "desconto_excedido_aprovacao",
        entidade: "simulation",
        entidade_id: tenantId,
        detalhes: {
          cliente: opts.clientName,
          vendedor: opts.vendedorName,
          valor_final: opts.valorFinal,
          desconto_percentual: opts.discountPercent,
          violacoes: opts.violations,
          gerentes_notificados: adminUsers.map((u: any) => u.nome_completo),
        },
        ...userInfo,
      });

      // Create a push notification for each manager
      for (const mgr of adminUsers) {
        try {
          await supabase.from("push_subscriptions" as any)
            .select("id")
            .eq("user_id", (mgr as any).id)
            .limit(1)
            .then(async ({ data: subs }) => {
              if (subs && subs.length > 0) {
                await supabase.functions.invoke("push-notification", {
                  body: {
                    user_id: (mgr as any).id,
                    title: "⚠️ Aprovação de Desconto",
                    body: `${opts.vendedorName} solicitou desconto de ${opts.discountPercent.toFixed(1)}% para ${opts.clientName}. ${opts.violations[0]}`,
                    tag: "discount-approval",
                  },
                });
              }
            });
        } catch {
          // Silent — push may not be configured
        }
      }

      toast.warning(
        `Desconto excede os limites. Notificação enviada para ${adminUsers.length} gerente(s) para aprovação.`,
        { duration: 6000 }
      );

      setPendingApproval(false);
    },
    []
  );

  return {
    rules,
    loadRules,
    checkDiscount,
    requestApproval,
    pendingApproval,
  };
}
