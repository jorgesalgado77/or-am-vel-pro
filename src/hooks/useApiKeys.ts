import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

export type ApiProvider = "openai" | "perplexity" | "evolution" | "resend" | "stripe" | "asaas" | "pdf";

export interface ApiKeyRecord {
  id: string;
  tenant_id: string;
  provider: ApiProvider;
  api_key: string;
  api_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const API_PROVIDERS: { value: ApiProvider; label: string; description: string; urlRequired: boolean }[] = [
  { value: "openai", label: "OpenAI", description: "IA principal (GPT-4o)", urlRequired: false },
  { value: "perplexity", label: "Perplexity", description: "Pesquisa de mercado com IA", urlRequired: false },
  { value: "evolution", label: "Evolution API", description: "WhatsApp via Evolution", urlRequired: true },
  { value: "resend", label: "Resend", description: "Envio de e-mails", urlRequired: false },
  { value: "stripe", label: "Stripe", description: "Pagamentos internacionais", urlRequired: false },
  { value: "asaas", label: "Asaas", description: "Cobranças PIX/Boleto (Brasil)", urlRequired: true },
  { value: "pdf", label: "PDF Generator", description: "Geração de documentos PDF", urlRequired: true },
];

export function useApiKeys(tenantId: string | null) {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchKeys = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("api_keys")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("provider");

    if (!error && data) setKeys(data as unknown as ApiKeyRecord[]);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const upsertKey = async (provider: ApiProvider, apiKey: string, apiUrl?: string) => {
    if (!tenantId) return false;
    const existing = keys.find(k => k.provider === provider);

    if (existing) {
      const { error } = await supabase
        .from("api_keys")
        .update({ api_key: apiKey, api_url: apiUrl || null, is_active: true } as any)
        .eq("id", existing.id);
      if (error) { toast.error("Erro ao atualizar API key"); return false; }
    } else {
      const { error } = await supabase
        .from("api_keys")
        .insert({ tenant_id: tenantId, provider, api_key: apiKey, api_url: apiUrl || null, is_active: true } as any);
      if (error) { toast.error("Erro ao salvar API key"); return false; }
    }

    toast.success(`API ${provider} configurada com sucesso`);
    await fetchKeys();
    return true;
  };

  const toggleKey = async (id: string, isActive: boolean) => {
    const { error } = await supabase
      .from("api_keys")
      .update({ is_active: isActive } as any)
      .eq("id", id);
    if (error) { toast.error("Erro ao alterar status"); return; }
    await fetchKeys();
  };

  const deleteKey = async (id: string) => {
    const { error } = await supabase
      .from("api_keys")
      .delete()
      .eq("id", id);
    if (error) { toast.error("Erro ao remover API key"); return; }
    toast.success("API key removida");
    await fetchKeys();
  };

  return { keys, loading, upsertKey, toggleKey, deleteKey, refetch: fetchKeys };
}
