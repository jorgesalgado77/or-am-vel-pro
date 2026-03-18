import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface VendaZapAddon {
  id: string;
  tenant_id: string;
  ativo: boolean;
  max_mensagens_dia: number;
  max_tokens_mensagem: number;
  prompt_sistema: string;
  tom_padrao: string;
}

export interface VendaZapMessage {
  id: string;
  tenant_id: string;
  usuario_id: string | null;
  client_id: string | null;
  tipo_copy: string;
  tom: string;
  contexto: Record<string, unknown>;
  mensagem_cliente: string | null;
  mensagem_gerada: string;
  tokens_usados: number;
  created_at: string;
}

export function useVendaZap(tenantId: string | null) {
  const [addon, setAddon] = useState<VendaZapAddon | null>(null);
  const [messages, setMessages] = useState<VendaZapMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [dailyUsage, setDailyUsage] = useState(0);

  const fetchAddon = async () => {
    if (!tenantId) { setLoading(false); return; }
    
    const { data } = await supabase
      .from("vendazap_addon")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    
    if (data) setAddon(data as unknown as VendaZapAddon);
    setLoading(false);
  };

  const fetchMessages = async (clientId?: string) => {
    if (!tenantId) return;
    
    let query = supabase
      .from("vendazap_messages")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50);
    
    if (clientId) query = query.eq("client_id", clientId);
    
    const { data } = await query;
    if (data) setMessages(data as unknown as VendaZapMessage[]);
  };

  const fetchDailyUsage = async () => {
    if (!tenantId) return;
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("vendazap_usage")
      .select("mensagens_geradas")
      .eq("tenant_id", tenantId)
      .eq("usage_date", today);
    
    const total = (data || []).reduce((sum, r: any) => sum + (r.mensagens_geradas || 0), 0);
    setDailyUsage(total);
  };

  useEffect(() => {
    fetchAddon();
    fetchDailyUsage();
  }, [tenantId]);

  const generateMessage = async (params: {
    nome_cliente?: string;
    valor_orcamento?: number;
    status_negociacao?: string;
    dias_sem_resposta?: number;
    mensagem_cliente?: string;
    tipo_copy?: string;
    tom?: string;
    deal_room_link?: string;
    client_id?: string;
    usuario_id?: string;
  }) => {
    if (!tenantId || !addon?.ativo) {
      toast.error("VendaZap AI não está ativo para esta loja");
      return null;
    }

    if (addon.max_mensagens_dia > 0 && dailyUsage >= addon.max_mensagens_dia) {
      toast.error(`Limite diário de ${addon.max_mensagens_dia} mensagens atingido`);
      return null;
    }

    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("vendazap-ai", {
        body: {
          ...params,
          prompt_sistema: addon.prompt_sistema,
        },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        setGenerating(false);
        return null;
      }

      // Save message to history
      await supabase.from("vendazap_messages").insert({
        tenant_id: tenantId,
        usuario_id: params.usuario_id || null,
        client_id: params.client_id || null,
        tipo_copy: params.tipo_copy || "geral",
        tom: params.tom || addon.tom_padrao || "persuasivo",
        contexto: {
          nome_cliente: params.nome_cliente,
          valor_orcamento: params.valor_orcamento,
          status_negociacao: params.status_negociacao,
          dias_sem_resposta: params.dias_sem_resposta,
        },
        mensagem_cliente: params.mensagem_cliente || null,
        mensagem_gerada: data.mensagem,
        tokens_usados: data.tokens_usados || 0,
      } as any);

      // Update daily usage
      const today = new Date().toISOString().split("T")[0];
      const { data: existingUsage } = await supabase
        .from("vendazap_usage")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("usuario_id", params.usuario_id || "")
        .eq("usage_date", today)
        .maybeSingle();

      if (existingUsage) {
        await supabase.from("vendazap_usage").update({
          mensagens_geradas: (existingUsage as any).mensagens_geradas + 1,
          tokens_consumidos: (existingUsage as any).tokens_consumidos + (data.tokens_usados || 0),
        } as any).eq("id", (existingUsage as any).id);
      } else {
        await supabase.from("vendazap_usage").insert({
          tenant_id: tenantId,
          usuario_id: params.usuario_id || null,
          usage_date: today,
          mensagens_geradas: 1,
          tokens_consumidos: data.tokens_usados || 0,
        } as any);
      }

      setDailyUsage(prev => prev + 1);
      await fetchMessages(params.client_id);
      setGenerating(false);
      return data.mensagem as string;
    } catch (err) {
      console.error("VendaZap error:", err);
      toast.error("Erro ao gerar mensagem. Tente novamente.");
      setGenerating(false);
      return null;
    }
  };

  return {
    addon,
    messages,
    loading,
    generating,
    dailyUsage,
    generateMessage,
    fetchMessages,
    fetchDailyUsage,
    refetchAddon: fetchAddon,
  };
}
