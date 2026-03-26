import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

export interface VendaZapAddon {
  id: string;
  tenant_id: string;
  ativo: boolean;
  max_mensagens_dia: number;
  max_tokens_mensagem: number;
  prompt_sistema: string;
  tom_padrao: string;
  api_provider: string;
  openai_model: string;
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

  const createVipAddon = (tid: string): VendaZapAddon => ({
    id: `vip-${tid}`,
    tenant_id: tid,
    ativo: true,
    max_mensagens_dia: 0,
    max_tokens_mensagem: 2000,
    prompt_sistema: "Você é um assistente de vendas especializado em móveis planejados.",
    tom_padrao: "consultivo",
    api_provider: "openai",
    openai_model: "gpt-4o-mini",
  });

  const fetchAddon = async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    // Try reading vendazap_addon table
    const { data, error } = await supabase
      .from("vendazap_addon")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (data && !error) {
      setAddon(data as unknown as VendaZapAddon);
      setLoading(false);
      return;
    }

    // Fallback: check recursos_vip on tenants table
    const { data: tenant } = await supabase
      .from("tenants")
      .select("recursos_vip")
      .eq("id", tenantId)
      .single();
    const vip = (tenant as any)?.recursos_vip;
    if (vip?.vendazap) {
      // Try to auto-create addon record
      const { data: created, error: upsertErr } = await supabase
        .from("vendazap_addon")
        .upsert({
          tenant_id: tenantId,
          ativo: true,
          prompt_sistema: "Você é um assistente de vendas especializado em móveis planejados.",
          tom_padrao: "consultivo",
          max_mensagens_dia: 0,
          max_tokens_mensagem: 2000,
        } as any, { onConflict: "tenant_id" })
        .select()
        .single();
      if (created && !upsertErr) {
        setAddon(created as unknown as VendaZapAddon);
      } else {
        // RLS may block upsert — use local addon object so the UI still works
        setAddon(createVipAddon(tenantId));
      }
    }
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
    const { data, error } = await supabase
      .from("vendazap_usage")
      .select("mensagens_geradas")
      .eq("tenant_id", tenantId)
      .eq("usage_date", today);

    if (error) {
      // RLS may block — default to 0
      setDailyUsage(0);
      return;
    }
    const total = (data || []).reduce((sum, row: any) => sum + (row.mensagens_geradas || 0), 0);
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
          api_provider: addon.api_provider,
          openai_model: addon.openai_model,
          max_tokens: addon.max_tokens_mensagem,
        },
      });

      if (error) {
        const errorMessage = typeof error.message === "string" ? error.message : "Erro ao gerar mensagem.";
        throw new Error(errorMessage);
      }

      if (data?.error) {
        toast.error(data.error);
        setGenerating(false);
        return null;
      }

      const generatedMessage = data?.mensagem as string | undefined;
      if (!generatedMessage) {
        throw new Error("A IA não retornou nenhuma mensagem.");
      }

      const today = new Date().toISOString().split("T")[0];

      const persistResults = await Promise.allSettled([
        supabase.from("vendazap_messages").insert({
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
            provider: addon.api_provider,
            model: addon.openai_model,
          },
          mensagem_cliente: params.mensagem_cliente || null,
          mensagem_gerada: generatedMessage,
          tokens_usados: data.tokens_usados || 0,
        } as any),
        (async () => {
          const { data: existingUsage } = await supabase
            .from("vendazap_usage")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("usuario_id", params.usuario_id || "")
            .eq("usage_date", today)
            .maybeSingle();

          if (existingUsage) {
            return supabase.from("vendazap_usage").update({
              mensagens_geradas: (existingUsage as any).mensagens_geradas + 1,
              tokens_consumidos: (existingUsage as any).tokens_consumidos + (data.tokens_usados || 0),
            } as any).eq("id", (existingUsage as any).id);
          }

          return supabase.from("vendazap_usage").insert({
            tenant_id: tenantId,
            usuario_id: params.usuario_id || null,
            usage_date: today,
            mensagens_geradas: 1,
            tokens_consumidos: data.tokens_usados || 0,
          } as any);
        })(),
      ]);

      const persistError = persistResults.find(
        (result) => result.status === "rejected",
      );

      if (persistError) {
        console.error("VendaZap persistence error:", persistError);
      }

      setDailyUsage((prev) => prev + 1);
      void fetchMessages(params.client_id);
      setGenerating(false);
      return generatedMessage;
    } catch (err: any) {
      console.error("VendaZap error:", err);
      toast.error(err?.message || "Erro ao gerar mensagem. Tente novamente.");
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
