import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

export function useGoogleCalendar(tenantId: string | null, userId?: string) {
  const [syncing, setSyncing] = useState(false);

  const syncTaskToCalendar = useCallback(async (task: {
    id: string;
    titulo: string;
    descricao?: string | null;
    data_tarefa: string;
    horario?: string | null;
    responsavel_nome?: string | null;
  }) => {
    if (!tenantId) return null;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar", {
        body: {
          action: "createEvent",
          tenant_id: tenantId,
          user_id: userId || null,
          task_id: task.id,
          summary: task.titulo,
          description: task.descricao || `Tarefa: ${task.titulo}${task.responsavel_nome ? `\nResponsável: ${task.responsavel_nome}` : ""}`,
          start_date: task.data_tarefa,
          start_time: task.horario || undefined,
        },
      });

      if (error || data?.error) {
        // If needs OAuth, don't show error toast (handled by UI)
        if (data?.needs_oauth) return null;
        console.warn("Google Calendar sync failed:", data?.error || error);
        return null;
      }

      const authLabel = data?.auth_type === "oauth" ? "OAuth" : "API Key";
      toast.success(`📅 Tarefa sincronizada com Google Agenda! (${authLabel})`);
      return data?.data;
    } catch (err) {
      console.warn("Google Calendar sync error:", err);
      return null;
    } finally {
      setSyncing(false);
    }
  }, [tenantId, userId]);

  const deleteCalendarEvent = useCallback(async (eventId: string) => {
    if (!tenantId) return;
    try {
      await supabase.functions.invoke("google-calendar", {
        body: { action: "deleteEvent", tenant_id: tenantId, user_id: userId || null, event_id: eventId },
      });
    } catch (err) {
      console.warn("Delete calendar event error:", err);
    }
  }, [tenantId, userId]);

  return { syncTaskToCalendar, deleteCalendarEvent, syncing };
}
