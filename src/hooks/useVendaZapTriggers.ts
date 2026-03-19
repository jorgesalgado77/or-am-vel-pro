import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { logAudit } from "@/services/auditService";

export interface VendaZapTrigger {
  id: string;
  tenant_id: string;
  client_id: string;
  trigger_type: "no_response" | "expiring_budget" | "viewed_no_reply";
  generated_message: string;
  status: "pending" | "sent";
  created_at: string;
  client_nome?: string;
}

const TRIGGER_LABELS: Record<string, { label: string; emoji: string }> = {
  no_response: { label: "Sem Resposta", emoji: "⏰" },
  expiring_budget: { label: "Orçamento Expirando", emoji: "⚠️" },
  viewed_no_reply: { label: "Visualizou s/ Responder", emoji: "👀" },
};

export { TRIGGER_LABELS };

export function useVendaZapTriggers(tenantId: string | null) {
  const [triggers, setTriggers] = useState<VendaZapTrigger[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTriggers = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);

    const { data } = await supabase
      .from("vendazap_triggers" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) {
      // Enrich with client names
      const clientIds = [...new Set((data as any[]).map((t) => t.client_id))];
      const { data: clients } = await supabase
        .from("clients")
        .select("id, nome")
        .in("id", clientIds);

      const clientMap: Record<string, string> = {};
      (clients || []).forEach((c) => {
        clientMap[c.id] = c.nome;
      });

      setTriggers(
        (data as any[]).map((t) => ({
          ...t,
          client_nome: clientMap[t.client_id] || "Cliente",
        }))
      );
    }

    setLoading(false);
  }, [tenantId]);

  const initialLoadDone = useRef(false);

  useEffect(() => {
    fetchTriggers().then(() => { initialLoadDone.current = true; });
  }, [fetchTriggers]);

  // Realtime: listen for new triggers and show toast
  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`vendazap-triggers-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "vendazap_triggers",
          filter: `tenant_id=eq.${tenantId}`,
        },
        async (payload) => {
          const newTrigger = payload.new as any;
          // Enrich with client name
          const { data: client } = await supabase
            .from("clients")
            .select("nome")
            .eq("id", newTrigger.client_id)
            .maybeSingle();

          const enriched: VendaZapTrigger = {
            ...newTrigger,
            client_nome: client?.nome || "Cliente",
          };

          setTriggers((prev) => [enriched, ...prev]);

          const info = TRIGGER_LABELS[newTrigger.trigger_type] || { emoji: "📌", label: newTrigger.trigger_type };
          toast.info(`${info.emoji} Novo gatilho: ${info.label}`, {
            description: `Cliente: ${enriched.client_nome}`,
            duration: 8000,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  const markSent = useCallback(
    async (triggerId: string, userId?: string) => {
      await supabase
        .from("vendazap_triggers" as any)
        .update({ status: "sent" } as any)
        .eq("id", triggerId);

      logAudit({
        acao: "vendazap_trigger_sent",
        entidade: "vendazap_trigger",
        entidade_id: triggerId,
        usuario_id: userId || null,
        usuario_nome: null,
        tenant_id: tenantId,
        detalhes: {},
      });

      setTriggers((prev) =>
        prev.map((t) => (t.id === triggerId ? { ...t, status: "sent" as const } : t))
      );
    },
    [tenantId]
  );

  const dismiss = useCallback(
    async (triggerId: string) => {
      await supabase
        .from("vendazap_triggers" as any)
        .update({ status: "sent" } as any)
        .eq("id", triggerId);

      setTriggers((prev) => prev.filter((t) => t.id !== triggerId));
    },
    []
  );

  const pendingTriggers = triggers.filter((t) => t.status === "pending");

  return { triggers, pendingTriggers, loading, fetchTriggers, markSent, dismiss };
}
