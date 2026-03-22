import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentTenantId } from "@/contexts/TenantContext";

export interface CompanySettings {
  id: string;
  tenant_id?: string | null;
  company_name: string;
  company_subtitle: string | null;
  logo_url: string | null;
  budget_validity_days: number;
  manager_password: string | null;
  admin_password: string | null;
  orcamento_numero_inicial: number;
  codigo_loja: string | null;
  cnpj_loja: string | null;
  endereco_loja: string | null;
  bairro_loja: string | null;
  cidade_loja: string | null;
  uf_loja: string | null;
  cep_loja: string | null;
  telefone_loja: string | null;
  email_loja: string | null;
}

const DEFAULT_SETTINGS: CompanySettings = {
  id: "",
  tenant_id: null,
  company_name: "OrçaMóvel PRO",
  company_subtitle: "Orce. Venda. Simplifique",
  logo_url: null,
  budget_validity_days: 30,
  manager_password: null,
  admin_password: null,
  orcamento_numero_inicial: 1,
  codigo_loja: null,
  cnpj_loja: null,
  endereco_loja: null,
  bairro_loja: null,
  cidade_loja: null,
  uf_loja: null,
  cep_loja: null,
  telefone_loja: null,
  email_loja: null,
};

let cachedSettingsByTenant: Record<string, CompanySettings> = {};
let listeners: Array<(s: CompanySettings) => void> = [];

function normalizeSettings(row: any): CompanySettings {
  return {
    ...DEFAULT_SETTINGS,
    ...row,
    company_name: row?.company_name || row?.nome_empresa || row?.nome_loja || DEFAULT_SETTINGS.company_name,
    company_subtitle: row?.company_subtitle || row?.subtitulo || DEFAULT_SETTINGS.company_subtitle,
  };
}

function getCacheKey(tenantId: string | null) {
  return tenantId || "__global__";
}

function notify(settings: CompanySettings, tenantId: string | null) {
  cachedSettingsByTenant[getCacheKey(tenantId)] = settings;
  listeners.forEach((fn) => fn(settings));
}

async function fetchCompanySettingsForTenant(tenantId: string | null): Promise<CompanySettings | null> {
  if (!tenantId) return null;

  const baseQuery = supabase.from("company_settings").select("*");

  const scopedQuery = baseQuery.eq("tenant_id", tenantId).limit(1).maybeSingle();

  const { data, error } = await Promise.race([
    scopedQuery,
    new Promise<{ data: null; error: null }>((resolve) => setTimeout(() => resolve({ data: null, error: null }), 8000)),
  ]);

  if (error) {
    console.warn("[CompanySettings] Falha ao carregar company_settings:", error.message);
    return null;
  }

  if (data) {
    return normalizeSettings(data);
  }

  const { data: tenantData, error: tenantError } = await Promise.race([
    supabase
      .from("tenants")
      .select("id, nome_loja, codigo_loja, email_contato, telefone_contato")
      .eq("id", tenantId)
      .maybeSingle(),
    new Promise<{ data: null; error: null }>((resolve) => setTimeout(() => resolve({ data: null, error: null }), 8000)),
  ]);

  if (tenantError) {
    console.warn("[CompanySettings] Falha ao carregar fallback de tenant:", tenantError.message);
    return null;
  }

  if (!tenantData) return null;

  return normalizeSettings({
    id: `tenant-${tenantData.id}`,
    tenant_id: tenantData.id,
    company_name: tenantData.nome_loja,
    codigo_loja: tenantData.codigo_loja,
    telefone_loja: tenantData.telefone_contato,
    email_loja: tenantData.email_contato,
  });
}

export function useCompanySettings() {
  const tenantId = getCurrentTenantId();
  const cacheKey = getCacheKey(tenantId);
  const [settings, setSettings] = useState<CompanySettings>(cachedSettingsByTenant[cacheKey] || DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(!cachedSettingsByTenant[cacheKey]);

  const refresh = useCallback(async () => {
    const nextSettings = await fetchCompanySettingsForTenant(tenantId);
    if (nextSettings) {
      notify(nextSettings, tenantId);
      setSettings(nextSettings);
    } else {
      setSettings(DEFAULT_SETTINGS);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    listeners.push(setSettings);
    const cached = cachedSettingsByTenant[cacheKey];
    if (cached) {
      setSettings(cached);
      setLoading(false);
    } else {
      refresh();
    }
    return () => {
      listeners = listeners.filter((fn) => fn !== setSettings);
    };
  }, [cacheKey, refresh]);

  return { settings, loading, refresh };
}
