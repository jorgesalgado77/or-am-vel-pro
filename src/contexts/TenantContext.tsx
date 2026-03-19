import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getTenantId } from "@/lib/tenantState";

export interface Tenant {
  id: string;
  nome_loja: string;
  codigo_loja: string | null;
  plano: string;
  plano_periodo: string;
  max_usuarios: number;
  ativo: boolean;
  trial_inicio: string;
  trial_fim: string;
  assinatura_inicio: string | null;
  assinatura_fim: string | null;
  recursos_vip: Record<string, boolean>;
  email_contato: string | null;
  telefone_contato: string | null;
}

interface TenantContextType {
  tenant: Tenant | null;
  tenantId: string | null;
  loading: boolean;
  refreshTenant: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType>({
  tenant: null,
  tenantId: null,
  loading: true,
  refreshTenant: async () => {},
});

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  const tenantId = user?.tenant_id ?? null;

  const fetchTenant = useCallback(async (id: string) => {
    const { data } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", id)
      .single();

    if (data) {
      setTenant({
        id: data.id,
        nome_loja: data.nome_loja,
        codigo_loja: data.codigo_loja,
        plano: data.plano,
        plano_periodo: data.plano_periodo,
        max_usuarios: data.max_usuarios,
        ativo: data.ativo,
        trial_inicio: data.trial_inicio,
        trial_fim: data.trial_fim,
        assinatura_inicio: data.assinatura_inicio,
        assinatura_fim: data.assinatura_fim,
        recursos_vip: (data.recursos_vip as Record<string, boolean>) || {},
        email_contato: data.email_contato,
        telefone_contato: data.telefone_contato,
      });
    }
    setLoading(false);
  }, []);

  const refreshTenant = useCallback(async () => {
    if (tenantId) await fetchTenant(tenantId);
  }, [tenantId, fetchTenant]);

  useEffect(() => {
    if (tenantId) {
      fetchTenant(tenantId);
    } else {
      setTenant(null);
      setLoading(false);
    }
  }, [tenantId, fetchTenant]);

  return (
    <TenantContext.Provider value={{ tenant, tenantId, loading, refreshTenant }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}

/**
 * For non-React contexts only (e.g. auditService).
 * Reads from in-memory state set by AuthContext — never localStorage.
 */
export function getCurrentTenantId(): string | null {
  return getTenantId();
}
