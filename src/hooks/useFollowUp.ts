import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { logAudit } from "@/services/auditService";

export interface FollowUpSchedule {
  id: string;
  tenant_id: string;
  client_id: string;
  client_nome?: string;
  stage: "1h" | "24h" | "3d";
  status: "pending" | "sent" | "paused" | "cancelled";
  scheduled_at: string;
  sent_at: string | null;
  generated_message: string | null;
  created_at: string;
}

export interface FollowUpConfig {
  id: string;
  tenant_id: string;
  enabled: boolean;
  stage_1h: boolean;
  stage_24h: boolean;
  stage_3d: boolean;
  max_followups_per_client: number;
  max_daily_total: number;
  daily_count: number;
  updated_at: string;
}

const STAGE_LABELS: Record<string, { label: string; emoji: string; description: string }> = {
  "1h": { label: "1 Hora", emoji: "⏱️", description: "Primeiro follow-up rápido" },
  "24h": { label: "24 Horas", emoji: "🕐", description: "Reforço no dia seguinte" },
  "3d": { label: "3 Dias", emoji: "📅", description: "Última tentativa antes de esfriar" },
};

export { STAGE_LABELS };

export function useFollowUp(tenantId: string | null, userId?: string) {
  const [schedules, setSchedules] = useState<FollowUpSchedule[]>([]);
  const [config, setConfig] = useState<FollowUpConfig | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchConfig = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("followup_config" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (data) setConfig(data as any);
  }, [tenantId]);

  const fetchSchedules = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);

    const { data } = await supabase
      .from("followup_schedules" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "paused"])
      .order("scheduled_at", { ascending: true })
      .limit(100);

    if (data) {
      const clientIds = [...new Set((data as any[]).map((s) => s.client_id))];
      if (clientIds.length > 0) {
        const { data: clients } = await supabase
          .from("clients")
          .select("id, nome")
          .in("id", clientIds);
        const map: Record<string, string> = {};
        (clients || []).forEach((c) => { map[c.id] = c.nome; });
        setSchedules(
          (data as any[]).map((s) => ({ ...s, client_nome: map[s.client_id] || "Cliente" }))
        );
      } else {
        setSchedules([]);
      }
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    fetchConfig();
    fetchSchedules();
  }, [fetchConfig, fetchSchedules]);

  // Realtime for new schedules and status changes (response notifications)
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`followup-${tenantId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "followup_schedules",
        filter: `tenant_id=eq.${tenantId}`,
      }, () => {
        fetchSchedules();
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "followup_schedules",
        filter: `tenant_id=eq.${tenantId}`,
      }, (payload) => {
        const newRecord = payload.new as any;
        const oldRecord = payload.old as any;
        // Client responded — follow-up was cancelled automatically
        if (newRecord.status === "cancelled" && oldRecord.status === "pending") {
          const clientName = schedules.find(s => s.id === newRecord.id)?.client_nome || "Cliente";
          toast.success(`🎉 ${clientName} respondeu! Follow-up cancelado automaticamente.`, {
            duration: 8000,
            description: "O cliente interagiu após o follow-up. Aproveite para dar continuidade!",
          });
          // Play notification sound for response
          try {
            const audio = new Audio("/notification-high.mp3");
            audio.volume = 0.5;
            audio.play().catch(() => {});
          } catch {}
        }
        // Follow-up was sent successfully
        if (newRecord.status === "sent" && oldRecord.status === "pending") {
          const clientName = schedules.find(s => s.id === newRecord.id)?.client_nome || "Cliente";
          const stageInfo = STAGE_LABELS[newRecord.stage] || { emoji: "📨", label: newRecord.stage };
          toast.info(`${stageInfo.emoji} Follow-up ${stageInfo.label} enviado para ${clientName}`, {
            duration: 5000,
          });
        }
        fetchSchedules();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, fetchSchedules, schedules]);

  const updateConfig = useCallback(async (updates: Partial<FollowUpConfig>) => {
    if (!tenantId) return;
    const { error } = await supabase
      .from("followup_config" as any)
      .upsert({
        tenant_id: tenantId,
        ...config,
        ...updates,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "tenant_id" });

    if (!error) {
      setConfig((prev) => prev ? { ...prev, ...updates } : null);
      toast.success("Configuração atualizada!");
      logAudit({
        acao: "followup_config_update",
        entidade: "followup_config",
        entidade_id: tenantId,
        usuario_id: userId || null,
        usuario_nome: null,
        tenant_id: tenantId,
        detalhes: updates,
      });
    }
  }, [tenantId, config, userId]);

  const pauseSchedule = useCallback(async (scheduleId: string) => {
    await supabase
      .from("followup_schedules" as any)
      .update({ status: "paused" } as any)
      .eq("id", scheduleId);
    setSchedules((prev) =>
      prev.map((s) => s.id === scheduleId ? { ...s, status: "paused" as const } : s)
    );
    logAudit({
      acao: "followup_paused",
      entidade: "followup_schedule",
      entidade_id: scheduleId,
      usuario_id: userId || null,
      usuario_nome: null,
      tenant_id: tenantId,
      detalhes: {},
    });
    toast.info("Follow-up pausado");
  }, [tenantId, userId]);

  const resumeSchedule = useCallback(async (scheduleId: string) => {
    await supabase
      .from("followup_schedules" as any)
      .update({ status: "pending" } as any)
      .eq("id", scheduleId);
    setSchedules((prev) =>
      prev.map((s) => s.id === scheduleId ? { ...s, status: "pending" as const } : s)
    );
    logAudit({
      acao: "followup_resumed",
      entidade: "followup_schedule",
      entidade_id: scheduleId,
      usuario_id: userId || null,
      usuario_nome: null,
      tenant_id: tenantId,
      detalhes: {},
    });
    toast.success("Follow-up retomado");
  }, [tenantId, userId]);

  const cancelSchedule = useCallback(async (scheduleId: string) => {
    await supabase
      .from("followup_schedules" as any)
      .update({ status: "cancelled" } as any)
      .eq("id", scheduleId);
    setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
    toast.info("Follow-up cancelado");
  }, []);

  const pauseAllForClient = useCallback(async (clientId: string) => {
    await supabase
      .from("followup_schedules" as any)
      .update({ status: "paused" } as any)
      .eq("client_id", clientId)
      .eq("status", "pending");
    setSchedules((prev) =>
      prev.map((s) => s.client_id === clientId && s.status === "pending"
        ? { ...s, status: "paused" as const } : s)
    );
    toast.info("Todos follow-ups do cliente pausados");
  }, []);

  const resumeAllForClient = useCallback(async (clientId: string) => {
    await supabase
      .from("followup_schedules" as any)
      .update({ status: "pending" } as any)
      .eq("client_id", clientId)
      .eq("status", "paused");
    setSchedules((prev) =>
      prev.map((s) => s.client_id === clientId && s.status === "paused"
        ? { ...s, status: "pending" as const } : s)
    );
    toast.success("Follow-ups do cliente retomados");
  }, []);

  const pendingCount = schedules.filter((s) => s.status === "pending").length;
  const pausedCount = schedules.filter((s) => s.status === "paused").length;

  return {
    schedules,
    config,
    loading,
    pendingCount,
    pausedCount,
    updateConfig,
    pauseSchedule,
    resumeSchedule,
    cancelSchedule,
    pauseAllForClient,
    resumeAllForClient,
    fetchSchedules,
    fetchConfig,
  };
}
