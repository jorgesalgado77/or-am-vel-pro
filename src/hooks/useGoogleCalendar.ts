import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

export function useGoogleCalendar(tenantId: string | null) {
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
          task_id: task.id,
          summary: task.titulo,
          description: task.descricao || `Tarefa: ${task.titulo}${task.responsavel_nome ? `\nResponsável: ${task.responsavel_nome}` : ""}`,
          start_date: task.data_tarefa,
          start_time: task.horario || undefined,
        },
      });

      if (error || data?.error) {
        console.warn("Google Calendar sync failed:", data?.error || error);
        return null;
      }

      toast.success("📅 Tarefa sincronizada com Google Agenda!");
      return data?.data;
    } catch (err) {
      console.warn("Google Calendar sync error:", err);
      return null;
    } finally {
      setSyncing(false);
    }
  }, [tenantId]);

  const deleteCalendarEvent = useCallback(async (eventId: string) => {
    if (!tenantId) return;
    try {
      await supabase.functions.invoke("google-calendar", {
        body: { action: "deleteEvent", tenant_id: tenantId, event_id: eventId },
      });
    } catch (err) {
      console.warn("Delete calendar event error:", err);
    }
  }, [tenantId]);

  return { syncTaskToCalendar, deleteCalendarEvent, syncing };
}
