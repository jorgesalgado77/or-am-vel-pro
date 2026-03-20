import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface BenefitItem {
  icon: string;
  title: string;
  description: string;
}

export interface HowItWorksStep {
  step: number;
  title: string;
  description: string;
}

export interface PlanItem {
  name: string;
  price_monthly: number;
  price_yearly: number;
  max_users: number;
  features: string[];
  recommended: boolean;
}

export interface LandingConfig {
  id: string;
  hero_title: string;
  hero_subtitle: string;
  hero_image_url: string | null;
  hero_video_url: string | null;
  benefits: BenefitItem[];
  carousel_images: string[];
  how_it_works: HowItWorksStep[];
  proof_text: string;
  plans: PlanItem[];
  cta_final_text: string;
  primary_color: string;
  secondary_color: string;
  sections_visible: Record<string, boolean>;
  footer_text: string;
  footer_contact_email: string | null;
  footer_contact_phone: string | null;
}

const DEFAULT_CONFIG: LandingConfig = {
  id: "",
  hero_title: "Orçamentos rápidos. Vendas fechadas. Sem complicação.",
  hero_subtitle: "O sistema completo para marcenarias e lojas de móveis planejados venderem mais, com organização e controle total.",
  hero_image_url: null,
  hero_video_url: null,
  benefits: [],
  carousel_images: [],
  how_it_works: [],
  proof_text: "",
  plans: [],
  cta_final_text: "Comece agora e transforme suas vendas",
  primary_color: "#1e40af",
  secondary_color: "#0ea5e9",
  sections_visible: { hero: true, benefits: true, carousel: true, how_it_works: true, proof: true, plans: true, lead_form: true, cta_final: true },
  footer_text: "Todos os direitos reservados",
  footer_contact_email: "contato@orcamovel.com.br",
  footer_contact_phone: null,
};

export function useLandingConfig() {
  const [config, setConfig] = useState<LandingConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    const { data } = await supabase
      .from("landing_page_config")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (data) {
      const d = data as any;
      setConfig({
        id: d.id,
        hero_title: d.hero_title,
        hero_subtitle: d.hero_subtitle,
        hero_image_url: d.hero_image_url,
        hero_video_url: d.hero_video_url,
        benefits: (d.benefits as BenefitItem[]) || [],
        carousel_images: (d.carousel_images as string[]) || [],
        how_it_works: (d.how_it_works as HowItWorksStep[]) || [],
        proof_text: d.proof_text,
        plans: (d.plans as PlanItem[]) || [],
        cta_final_text: d.cta_final_text,
        primary_color: d.primary_color,
        secondary_color: d.secondary_color,
        sections_visible: (d.sections_visible as Record<string, boolean>) || DEFAULT_CONFIG.sections_visible,
        footer_text: d.footer_text,
        footer_contact_email: d.footer_contact_email,
        footer_contact_phone: d.footer_contact_phone,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const updateConfig = useCallback(async (updates: Partial<LandingConfig>) => {
    const { error } = await supabase
      .from("landing_page_config")
      .update({ ...updates, updated_at: new Date().toISOString() } as any)
      .eq("id", config.id);
    if (!error) {
      setConfig(prev => ({ ...prev, ...updates }));
    }
    return { error };
  }, [config.id]);

  return { config, loading, updateConfig, refresh: fetchConfig };
}
