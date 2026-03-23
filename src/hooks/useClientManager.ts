/**
 * Hook that manages client state and operations.
 * Extracted from Index.tsx to reduce its complexity.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import * as clientService from "@/services/clientService";
import { logAudit, getAuditUserInfo } from "@/services/auditService";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { playNotificationSound } from "@/lib/notificationSound";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

export function useClientManager() {
  const { session, loading: authLoading, user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSims, setLastSims] = useState<Record<string, clientService.LastSimInfo>>({});
  const [allSimulations, setAllSimulations] = useState<{ created_at: string; valor_final: number; valor_com_desconto?: number }[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchClients = useCallback(async () => {
    if (authLoading) return;

    if (!session) {
      setClients([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const result = await clientService.fetchClients();
    if (result.error) {
      toast.error(result.error);
      setClients([]);
    } else {
      setClients(result.clients);
    }
    setLoading(false);
  }, [authLoading, session]);

  const fetchLastSims = useCallback(async () => {
    if (authLoading || !session) {
      setLastSims({});
      setAllSimulations([]);
      return;
    }

    const result = await clientService.fetchLastSimulations();
    setLastSims(result.lastSims);
    setAllSimulations(result.allSimulations);
  }, [authLoading, session]);

  const handleSaveClient = useCallback(async (
    data: Record<string, unknown>,
    editingClient: Client | null,
    onDone: () => void
  ) => {
    setSaving(true);
    const userInfo = getAuditUserInfo();

    if (editingClient) {
      const result = await clientService.updateClient(editingClient.id, data);
      if (result.error) toast.error(result.error);
      else {
        toast.success("Cliente atualizado!");
        logAudit({
          acao: "cliente_atualizado",
          entidade: "client",
          entidade_id: editingClient.id,
          detalhes: { nome: data.nome || editingClient.nome },
          ...userInfo,
        });
      }
    } else {
      const result = await clientService.createClient(data as any);
      if (result.error) {
        // Return the error to the caller so it can show upgrade dialog if needed
        setSaving(false);
        return { error: result.error };
      } else {
        toast.success("Cliente criado!");
        logAudit({
          acao: "cliente_criado",
          entidade: "client",
          entidade_id: result.client?.id,
          detalhes: { nome: data.nome },
          ...userInfo,
        });
      }
    }
    setSaving(false);
    onDone();
    fetchClients();
    return { error: null };
  }, [fetchClients]);

  const handleDeleteClient = useCallback(async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este cliente?")) return;
    const clientName = clients.find(c => c.id === id)?.nome;
    const result = await clientService.deleteClient(id);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Cliente excluído");
      const userInfo = getAuditUserInfo();
      logAudit({
        acao: "cliente_excluido",
        entidade: "client",
        entidade_id: id,
        detalhes: { nome: clientName },
        ...userInfo,
      });
      fetchClients();
    }
  }, [fetchClients, clients]);

  // Track known client IDs to detect truly new arrivals
  const knownIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (authLoading) return;
    fetchClients();
    fetchLastSims();
  }, [authLoading, session?.user?.id, user?.tenant_id, fetchClients, fetchLastSims]);

  // Keep knownIds in sync
  useEffect(() => {
    knownIdsRef.current = new Set(clients.map(c => c.id));
  }, [clients]);

  // Realtime subscription for new leads / client changes
  useEffect(() => {
    if (authLoading || !session || !user?.tenant_id) return;

    const channel = supabase
      .channel("clients-realtime")
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "clients",
          filter: `tenant_id=eq.${user.tenant_id}`,
        },
        (payload: any) => {
          const newClient = payload.new as Client;
          if (knownIdsRef.current.has(newClient.id)) return;

          // Play notification sound and show toast
          playNotificationSound();
          const origem = (newClient as any).origem_lead || "manual";
          const label = origem === "manual" ? "Cliente Loja" : "Lead Recebido";
          toast.success(`🆕 Novo ${label}: ${newClient.nome}`, {
            description: "Um novo lead chegou ao sistema!",
            duration: 8000,
          });

          // Add to local state immediately
          setClients(prev => {
            if (prev.some(c => c.id === newClient.id)) return prev;
            return [newClient, ...prev];
          });
          knownIdsRef.current.add(newClient.id);
        }
      )
      .on(
        "postgres_changes" as any,
        {
          event: "UPDATE",
          schema: "public",
          table: "clients",
          filter: `tenant_id=eq.${user.tenant_id}`,
        },
        (payload: any) => {
          const updated = payload.new as Client;
          setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authLoading, session, user?.tenant_id]);

  return {
    clients,
    loading,
    lastSims,
    allSimulations,
    saving,
    fetchClients,
    fetchLastSims,
    handleSaveClient,
    handleDeleteClient,
  };
}
