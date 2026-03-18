import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

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
}

const DEFAULT_SETTINGS: CompanySettings = {
  id: "",
  company_name: "INOVAMAD",
  company_subtitle: "Gestão & Financiamento",
  logo_url: null,
  budget_validity_days: 30,
  manager_password: null,
  admin_password: null,
  orcamento_numero_inicial: 1,
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
