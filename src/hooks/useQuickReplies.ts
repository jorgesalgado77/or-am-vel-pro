import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

export interface QuickReply {
  id: string;
  titulo: string;
  mensagem: string;
  categoria: string;
  atalho: string | null;
  ativo: boolean;
  ordem: number;
}

export function useQuickReplies(tenantId: string | null) {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("quick_replies")
      .select("id, titulo, mensagem, categoria, atalho, ativo, ordem")
      .eq("tenant_id", tenantId)
      .eq("ativo", true)
      .order("ordem", { ascending: true });

    if (error) {
      console.warn("[QuickReplies] fetch error:", error.message);
    }
    setReplies((data as QuickReply[]) || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetch(); }, [fetch]);

  const add = useCallback(async (titulo: string, mensagem: string, categoria = "geral", atalho?: string) => {
    if (!tenantId) return;
    const { error } = await (supabase as any).from("quick_replies").insert({
      tenant_id: tenantId,
      titulo,
      mensagem,
      categoria,
      atalho: atalho || null,
      ativo: true,
      ordem: replies.length,
    });
    if (error) toast.error("Erro ao criar resposta rápida");
    else { toast.success("Resposta rápida criada"); fetch(); }
  }, [tenantId, replies.length, fetch]);

  const remove = useCallback(async (id: string) => {
    const { error } = await (supabase as any).from("quick_replies").delete().eq("id", id);
    if (error) toast.error("Erro ao remover");
    else fetch();
  }, [fetch]);

  return { replies, loading, add, remove, refresh: fetch };
}
