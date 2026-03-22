import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentTenantId, getResolvedTenantId } from "@/contexts/TenantContext";

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

  // Always fetch tenant data for fallback store name
  const [settingsRes, tenantRes] = await Promise.all([
    Promise.race([
      supabase.from("company_settings").select("*").eq("tenant_id", tenantId).limit(1).maybeSingle(),
      new Promise<{ data: null; error: null }>((resolve) => setTimeout(() => resolve({ data: null, error: null }), 8000)),
    ]),
    Promise.race([
      supabase.from("tenants").select("id, nome_loja, codigo_loja, email_contato, telefone_contato").eq("id", tenantId).maybeSingle(),
      new Promise<{ data: null; error: null }>((resolve) => setTimeout(() => resolve({ data: null, error: null }), 8000)),
    ]),
  ]);

  const tenantData = tenantRes.data;
  const settingsData = settingsRes.data;

  if (settingsData) {
    const normalized = normalizeSettings(settingsData);
    // If company_name is still the default, use tenant nome_loja as override
    const isDefault = !normalized.company_name || normalized.company_name === DEFAULT_SETTINGS.company_name;
    if (isDefault && tenantData?.nome_loja) {
      normalized.company_name = tenantData.nome_loja;
    }
    // Fill codigo_loja from tenant if not in settings
    if (!normalized.codigo_loja && tenantData?.codigo_loja) {
      normalized.codigo_loja = tenantData.codigo_loja;
    }
    return normalized;
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
  const syncTenantId = getCurrentTenantId();
  const [tenantId, setTenantId] = useState<string | null>(syncTenantId);
  const cacheKey = getCacheKey(tenantId);
  const [settings, setSettings] = useState<CompanySettings>(cachedSettingsByTenant[cacheKey] || DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(!cachedSettingsByTenant[cacheKey]);
  const retryRef = useRef(0);

  // Resolve tenant_id asynchronously if not available synchronously
  useEffect(() => {
    if (syncTenantId) {
      setTenantId(syncTenantId);
      return;
    }

    // Poll for tenant ID resolution (covers race conditions with AuthContext)
    let cancelled = false;
    const tryResolve = async () => {
      const resolved = await getResolvedTenantId();
      if (!cancelled && resolved) {
        setTenantId(resolved);
        return;
      }
      // Retry up to 5 times with 500ms intervals
      if (!cancelled && retryRef.current < 5) {
        retryRef.current++;
        setTimeout(tryResolve, 500);
      }
    };
    tryResolve();
    return () => { cancelled = true; };
  }, [syncTenantId]);

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
    if (cached && cacheKey !== "__global__") {
      setSettings(cached);
      setLoading(false);
    } else if (tenantId) {
      refresh();
    }
    return () => {
      listeners = listeners.filter((fn) => fn !== setSettings);
    };
  }, [cacheKey, refresh, tenantId]);

  return { settings, loading, refresh };
}
