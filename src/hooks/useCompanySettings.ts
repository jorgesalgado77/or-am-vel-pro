import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface CompanySettings {
  id: string;
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

let cachedSettings: CompanySettings | null = null;
let listeners: Array<(s: CompanySettings) => void> = [];

function notify(s: CompanySettings) {
  cachedSettings = s;
  listeners.forEach((fn) => fn(s));
}

export function useCompanySettings() {
  const [settings, setSettings] = useState<CompanySettings>(cachedSettings || DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(!cachedSettings);

  useEffect(() => {
    listeners.push(setSettings);
    if (!cachedSettings) {
      supabase
        .from("company_settings")
        .select("*")
        .limit(1)
        .single()
        .then(({ data }) => {
          if (data) notify(data as unknown as CompanySettings);
          setLoading(false);
        });
    }
    return () => {
      listeners = listeners.filter((fn) => fn !== setSettings);
    };
  }, []);

  const refresh = async () => {
    const { data } = await supabase.from("company_settings").select("*").limit(1).single();
    if (data) notify(data as unknown as CompanySettings);
  };

  return { settings, loading, refresh };
}
