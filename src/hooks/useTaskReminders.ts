import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { playNotificationSound } from "@/lib/notificationSound";
import { sendPushIfEnabled } from "@/lib/pushHelper";
import type { Task } from "@/components/tasks/taskTypes";

const REMINDER_MINUTES_KEY = "task_reminder_minutes_before";
const SNOOZE_MINUTES_KEY = "task_snooze_minutes";
const DEFAULT_REMINDER_MINUTES = 15;
const DEFAULT_SNOOZE_MINUTES = 5;

export interface TaskReminder {
  task: Task;
  triggeredAt: number;
  snoozedUntil?: number;
}

export function getReminderMinutes(): number {
  const val = localStorage.getItem(REMINDER_MINUTES_KEY);
  return val ? Number(val) : DEFAULT_REMINDER_MINUTES;
}

export function setReminderMinutes(minutes: number) {
  localStorage.setItem(REMINDER_MINUTES_KEY, String(minutes));
}

export function getSnoozeMinutes(): number {
  const val = localStorage.getItem(SNOOZE_MINUTES_KEY);
  return val ? Number(val) : DEFAULT_SNOOZE_MINUTES;
}

export function setSnoozeMinutes(minutes: number) {
  localStorage.setItem(SNOOZE_MINUTES_KEY, String(minutes));
}

export function useTaskReminders(tenantId: string | null, userId: string | undefined) {
  const [activeReminders, setActiveReminders] = useState<TaskReminder[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const dismissedRef = useRef(new Set<string>());
  const snoozedRef = useRef(new Map<string, number>());

  // Fetch tasks with time today that are nova/pendente
  useEffect(() => {
    if (!tenantId) return;

    const fetchTasks = async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("tasks" as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("data_tarefa", today)
        .in("status", ["nova", "pendente"])
        .not("horario", "is", null);
      if (data) setTasks(data as unknown as Task[]);
    };

    fetchTasks();
    const interval = setInterval(fetchTasks, 60_000); // refresh every minute
    return () => clearInterval(interval);
  }, [tenantId]);

  // Realtime: listen for task changes
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel("task-reminders-rt")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "tasks",
        filter: `tenant_id=eq.${tenantId}`,
      }, (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as any).id;
          setTasks(prev => prev.filter(t => t.id !== id));
          setActiveReminders(prev => prev.filter(r => r.task.id !== id));
          return;
        }
        const updated = payload.new as unknown as Task;
        const today = new Date().toISOString().slice(0, 10);
        // Only track today's tasks with time, nova/pendente
        if (updated.data_tarefa === today && updated.horario && ["nova", "pendente"].includes(updated.status)) {
          setTasks(prev => {
            const exists = prev.find(t => t.id === updated.id);
            if (exists) return prev.map(t => t.id === updated.id ? updated : t);
            return [...prev, updated];
          });
        } else {
          // Remove if status changed to em_execucao/concluida
          setTasks(prev => prev.filter(t => t.id !== updated.id));
          setActiveReminders(prev => prev.filter(r => r.task.id !== updated.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenantId]);

  // Check every 15 seconds if any task should trigger a reminder
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const reminderMinutes = getReminderMinutes();
      const today = new Date().toISOString().slice(0, 10);

      tasks.forEach(task => {
        if (!task.horario || dismissedRef.current.has(task.id)) return;

        // Check snooze
        const snoozedUntil = snoozedRef.current.get(task.id);
        if (snoozedUntil && now < snoozedUntil) return;

        const [h, m] = task.horario.split(":").map(Number);
        const taskTime = new Date(`${today}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
        const triggerTime = taskTime.getTime() - reminderMinutes * 60_000;

        // Trigger if we're past the reminder time but task hasn't happened yet (or up to 30min after)
        if (now >= triggerTime && now <= taskTime.getTime() + 30 * 60_000) {
          setActiveReminders(prev => {
            if (prev.some(r => r.task.id === task.id)) return prev;
            // Sound + push
            playNotificationSound();
            if (userId) {
              sendPushIfEnabled(
                "tarefas",
                userId,
                `⏰ Tarefa em ${reminderMinutes}min`,
                task.titulo,
                `reminder-${task.id}`,
              );
            }
            return [...prev, { task, triggeredAt: now }];
          });
        }
      });
    };

    check();
    const interval = setInterval(check, 15_000);
    return () => clearInterval(interval);
  }, [tasks, userId]);

  const dismissReminder = useCallback((taskId: string) => {
    dismissedRef.current.add(taskId);
    setActiveReminders(prev => prev.filter(r => r.task.id !== taskId));
  }, []);

  const snoozeReminder = useCallback((taskId: string, minutes?: number) => {
    const snoozeMin = minutes ?? getSnoozeMinutes();
    snoozedRef.current.set(taskId, Date.now() + snoozeMin * 60_000);
    setActiveReminders(prev => prev.filter(r => r.task.id !== taskId));
  }, []);

  return { activeReminders, dismissReminder, snoozeReminder };
}
