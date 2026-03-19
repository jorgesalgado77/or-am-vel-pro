import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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
  setTenantId: (id: string) => void;
  refreshTenant: () => Promise<void>;
  clearTenant: () => void;
}

const TenantContext = createContext<TenantContextType>({
  tenant: null,
  tenantId: null,
  loading: true,
  setTenantId: () => {},
  refreshTenant: async () => {},
  clearTenant: () => {},
});

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantId, setTenantIdState] = useState<string | null>(
    () => localStorage.getItem("current_tenant_id")
  );
  const [loading, setLoading] = useState(true);

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

  const setTenantId = useCallback((id: string) => {
    setTenantIdState(id);
    localStorage.setItem("current_tenant_id", id);
  }, []);

  const clearTenant = useCallback(() => {
    setTenant(null);
    setTenantIdState(null);
    localStorage.removeItem("current_tenant_id");
  }, []);

  const refreshTenant = useCallback(async () => {
    if (tenantId) await fetchTenant(tenantId);
  }, [tenantId, fetchTenant]);

  // Auto-sync tenant from auth user
  useEffect(() => {
    if (user?.tenant_id) {
      setTenantIdState(user.tenant_id);
      localStorage.setItem("current_tenant_id", user.tenant_id);
      fetchTenant(user.tenant_id);
    } else if (tenantId) {
      fetchTenant(tenantId);
    } else {
      setLoading(false);
    }
  }, [user?.tenant_id, tenantId, fetchTenant]);

  return (
    <TenantContext.Provider value={{ tenant, tenantId, loading, setTenantId, refreshTenant, clearTenant }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}

export function getCurrentTenantId(): string | null {
  return localStorage.getItem("current_tenant_id");
}
