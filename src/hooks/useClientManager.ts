/**
 * Hook that manages client state and operations.
 * Extracted from Index.tsx to reduce its complexity.
 */

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import * as clientService from "@/services/clientService";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

export function useClientManager() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSims, setLastSims] = useState<Record<string, clientService.LastSimInfo>>({});
  const [allSimulations, setAllSimulations] = useState<{ created_at: string; valor_final: number }[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    const result = await clientService.fetchClients();
    if (result.error) toast.error(result.error);
    else setClients(result.clients);
    setLoading(false);
  }, []);

  const fetchLastSims = useCallback(async () => {
    const result = await clientService.fetchLastSimulations();
    setLastSims(result.lastSims);
    setAllSimulations(result.allSimulations);
  }, []);

  const handleSaveClient = useCallback(async (
    data: Record<string, unknown>,
    editingClient: Client | null,
    onDone: () => void
  ) => {
    setSaving(true);
    if (editingClient) {
      const result = await clientService.updateClient(editingClient.id, data);
      if (result.error) toast.error(result.error);
      else toast.success("Cliente atualizado!");
    } else {
      const result = await clientService.createClient(data as any);
      if (result.error) toast.error(result.error);
      else toast.success("Cliente criado!");
    }
    setSaving(false);
    onDone();
    fetchClients();
  }, [fetchClients]);

  const handleDeleteClient = useCallback(async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este cliente?")) return;
    const result = await clientService.deleteClient(id);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Cliente excluído");
      fetchClients();
    }
  }, [fetchClients]);

  useEffect(() => {
    fetchClients();
    fetchLastSims();
  }, [fetchClients, fetchLastSims]);

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
