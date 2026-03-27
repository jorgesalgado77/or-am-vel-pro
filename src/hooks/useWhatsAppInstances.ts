import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

export interface WhatsAppInstance {
  id: string;
  tenant_id: string;
  instance_name: string;
  status: "connected" | "disconnected" | "connecting" | "error";
  qr_code: string | null;
  connected: boolean;
  phone_number: string | null;
  created_at: string;
  updated_at: string;
}

export function useWhatsAppInstances(tenantId: string | null) {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchInstances = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    const { data, error } = await (supabase as any)
      .from("whatsapp_instances")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (!error && data) setInstances(data as WhatsAppInstance[]);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchInstances(); }, [fetchInstances]);

  // Realtime subscription for instance status changes
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel("whatsapp-instances-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_instances", filter: `tenant_id=eq.${tenantId}` },
        () => { fetchInstances(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenantId, fetchInstances]);

  const callGateway = async (action: string, instanceName: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error("Sessão expirada"); return null; }

    const res = await supabase.functions.invoke("whatsapp-gateway", {
      body: { action, instance_name: instanceName, tenant_id: tenantId },
    });

    if (res.error) {
      toast.error(res.error.message || "Erro na operação");
      return null;
    }
    return res.data;
  };

  const createInstance = async (instanceName: string) => {
    if (!tenantId || !instanceName.trim()) {
      toast.error("Nome da instância é obrigatório");
      return false;
    }
    setActionLoading("create");
    const result = await callGateway("createInstance", instanceName.trim());
    setActionLoading(null);

    if (result?.success) {
      toast.success(`Instância "${instanceName}" criada!`);
      await fetchInstances();
      return true;
    }
    if (result?.error) toast.error(result.error);
    return false;
  };

  const connectInstance = async (instanceName: string) => {
    setActionLoading(instanceName);
    const result = await callGateway("connectInstance", instanceName);
    setActionLoading(null);

    if (result?.success) {
      // QR code will appear via realtime update
      if (result.qr_code) {
        // Also update local state immediately
        setInstances(prev => prev.map(i =>
          i.instance_name === instanceName
            ? { ...i, qr_code: result.qr_code, status: "connecting" as const }
            : i
        ));
      }
      toast.success("Escaneie o QR Code com seu WhatsApp");
      return result.qr_code || null;
    }
    if (result?.error) toast.error(result.error);
    return null;
  };

  const checkStatus = async (instanceName: string) => {
    setActionLoading(instanceName);
    const result = await callGateway("instanceStatus", instanceName);
    setActionLoading(null);

    if (result?.success) {
      await fetchInstances();
      return result.connected;
    }
    return false;
  };

  const disconnectInstance = async (instanceName: string) => {
    setActionLoading(instanceName);
    const result = await callGateway("disconnectInstance", instanceName);
    setActionLoading(null);

    if (result?.success) {
      toast.success("Instância desconectada");
      await fetchInstances();
      return true;
    }
    return false;
  };

  const deleteInstance = async (instanceName: string) => {
    if (!confirm(`Excluir a instância "${instanceName}"? Esta ação não pode ser desfeita.`)) return false;
    setActionLoading(instanceName);
    const result = await callGateway("deleteInstance", instanceName);
    setActionLoading(null);

    if (result?.success) {
      toast.success("Instância excluída");
      await fetchInstances();
      return true;
    }
    return false;
  };

  return {
    instances,
    loading,
    actionLoading,
    createInstance,
    connectInstance,
    checkStatus,
    disconnectInstance,
    deleteInstance,
    refetch: fetchInstances,
  };
}
