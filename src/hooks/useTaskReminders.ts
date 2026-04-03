import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { playNotificationSound } from "@/lib/notificationSound";
import { sendPushIfEnabled } from "@/lib/pushHelper";
import type { Task } from "@/components/tasks/taskTypes";

const REMINDER_MINUTES_KEY = "task_reminder_minutes_before";
const SNOOZE_MINUTES_KEY = "task_snooze_minutes";
const DEFAULT_REMINDER_MINUTES = 15;
const DEFAULT_SNOOZE_MINUTES = 5;
const OVERDUE_CHECK_INTERVAL = 30 * 60_000; // 30 minutes
const LOGIN_ALERT_KEY = "task_overdue_login_shown";

export interface TaskReminder {
  task: Task;
  triggeredAt: number;
  snoozedUntil?: number;
  isOverdue?: boolean;
  daysOverdue?: number;
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
  const [overdueTasks, setOverdueTasks] = useState<Task[]>([]);
  const [showOverdueAlert, setShowOverdueAlert] = useState(false);
  const dismissedRef = useRef(new Set<string>());
  const snoozedRef = useRef(new Map<string, number>());
  const overdueAlertDismissedRef = useRef(false);
  const lastOverdueCheckRef = useRef(0);

  // Fetch only tasks assigned to the current user (each user sees only their own)
  useEffect(() => {
    if (!tenantId || !userId) return;

    const fetchAllTasks = async () => {
      const { data } = await supabase
        .from("tasks" as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("responsavel_id", userId)
        .in("status", ["nova", "pendente", "em_execucao"])
        .order("data_tarefa", { ascending: true });
      
      if (data) {
        const allTasks = data as unknown as Task[];
        const today = new Date().toISOString().slice(0, 10);
        
        // Tasks with time today -> for time-based reminders
        const todayWithTime = allTasks.filter(t => t.data_tarefa === today && t.horario);
        setTasks(todayWithTime);
        
        // Only truly overdue tasks (date < today) or due today for the alert
        const overdueOnly = allTasks.filter(t => t.data_tarefa && t.data_tarefa <= today);
        setOverdueTasks(overdueOnly);
      }
    };

    fetchAllTasks();
    const interval = setInterval(fetchAllTasks, 60_000);
    return () => clearInterval(interval);
  }, [tenantId, userId]);

  // Realtime
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
          setOverdueTasks(prev => prev.filter(t => t.id !== id));
          setActiveReminders(prev => prev.filter(r => r.task.id !== id));
          return;
        }
        const updated = payload.new as unknown as Task;
        const today = new Date().toISOString().slice(0, 10);
        const isOverdueOrToday = updated.data_tarefa && updated.data_tarefa <= today;
        
        // Only process tasks assigned to current user
        if (updated.responsavel_id !== userId) {
          // Remove if was previously in our list (reassigned away)
          setTasks(prev => prev.filter(t => t.id !== updated.id));
          setOverdueTasks(prev => prev.filter(t => t.id !== updated.id));
          setActiveReminders(prev => prev.filter(r => r.task.id !== updated.id));
          return;
        }
        
        if (["nova", "pendente", "em_execucao"].includes(updated.status)) {
          // Only add to overdue list if task is due today or earlier
          if (isOverdueOrToday) {
            setOverdueTasks(prev => {
              const exists = prev.find(t => t.id === updated.id);
              if (exists) return prev.map(t => t.id === updated.id ? updated : t);
              return [...prev, updated];
            });
          } else {
            // Future task - remove from overdue if it was there
            setOverdueTasks(prev => prev.filter(t => t.id !== updated.id));
          }
          if (updated.data_tarefa === today && updated.horario) {
            setTasks(prev => {
              const exists = prev.find(t => t.id === updated.id);
              if (exists) return prev.map(t => t.id === updated.id ? updated : t);
              return [...prev, updated];
            });
          }
        } else {
          setTasks(prev => prev.filter(t => t.id !== updated.id));
          setOverdueTasks(prev => prev.filter(t => t.id !== updated.id));
          setActiveReminders(prev => prev.filter(r => r.task.id !== updated.id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, userId]);

  // Show overdue alert on login and every 30 minutes
  useEffect(() => {
    if (overdueTasks.length === 0) {
      setShowOverdueAlert(false);
      return;
    }

    const now = Date.now();
    const loginKey = `${LOGIN_ALERT_KEY}_${userId || "anon"}`;
    const lastLoginShown = localStorage.getItem(loginKey);
    const sessionStart = !lastLoginShown || (now - Number(lastLoginShown)) > 3600_000; // Reset after 1h gap

    // Show on login
    if (sessionStart && !overdueAlertDismissedRef.current) {
      localStorage.setItem(loginKey, String(now));
      setShowOverdueAlert(true);
      playNotificationSound();
      lastOverdueCheckRef.current = now;
    }

    // Periodic check every 30 minutes
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastOverdueCheckRef.current;
      if (elapsed >= OVERDUE_CHECK_INTERVAL && overdueTasks.length > 0) {
        overdueAlertDismissedRef.current = false;
        setShowOverdueAlert(true);
        playNotificationSound();
        lastOverdueCheckRef.current = Date.now();
      }
    }, 60_000); // Check every minute

    return () => clearInterval(interval);
  }, [overdueTasks.length, userId]);

  // Time-based reminders (existing logic)
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const reminderMinutes = getReminderMinutes();
      const today = new Date().toISOString().slice(0, 10);

      tasks.forEach(task => {
        if (!task.horario || dismissedRef.current.has(task.id)) return;
        const snoozedUntil = snoozedRef.current.get(task.id);
        if (snoozedUntil && now < snoozedUntil) return;

        const [h, m] = task.horario.split(":").map(Number);
        const taskTime = new Date(`${today}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
        const triggerTime = taskTime.getTime() - reminderMinutes * 60_000;

        if (now >= triggerTime && now <= taskTime.getTime() + 30 * 60_000) {
          setActiveReminders(prev => {
            if (prev.some(r => r.task.id === task.id)) return prev;
            playNotificationSound();
            if (userId) {
              sendPushIfEnabled("tarefas", userId, `⏰ Tarefa em ${reminderMinutes}min`, task.titulo, `reminder-${task.id}`);
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

  const dismissOverdueAlert = useCallback(() => {
    overdueAlertDismissedRef.current = true;
    setShowOverdueAlert(false);
    lastOverdueCheckRef.current = Date.now();
  }, []);

  return {
    activeReminders,
    dismissReminder,
    snoozeReminder,
    overdueTasks,
    showOverdueAlert,
    dismissOverdueAlert,
  };
}
