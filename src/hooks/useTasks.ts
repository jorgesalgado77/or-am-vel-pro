import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Task, TaskStatus } from "@/components/tasks/taskTypes";
import { playNotificationSound } from "@/lib/notificationSound";
import { sendPushIfEnabled } from "@/lib/pushHelper";

export function useTasks(tenantId: string | null, userId: string | undefined) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data } = await supabase
      .from("tasks" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("data_tarefa", { ascending: true });
    if (data) setTasks(data as unknown as Task[]);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Realtime subscription for new tasks assigned to current user
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel("tasks-realtime")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "tasks",
        filter: `tenant_id=eq.${tenantId}`,
      }, (payload) => {
        const newTask = payload.new as unknown as Task;
        setTasks(prev => {
          if (prev.some(t => t.id === newTask.id)) return prev;
          return [...prev, newTask];
        });
        // Alert if assigned to current user
        if (newTask.responsavel_id === userId) {
          playNotificationSound();
          import("sonner").then(({ toast }) => {
            toast.info(`📋 Nova tarefa: ${newTask.titulo}`, { duration: 6000 });
          });
          // Send push notification for background alerts
          sendPushIfEnabled(
            "tarefas",
            userId,
            "📋 Nova tarefa atribuída",
            newTask.titulo,
            `task-${newTask.id}`,
          );
        }
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "tasks",
        filter: `tenant_id=eq.${tenantId}`,
      }, (payload) => {
        const updated = payload.new as unknown as Task;
        setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
      })
      .on("postgres_changes", {
        event: "DELETE",
        schema: "public",
        table: "tasks",
        filter: `tenant_id=eq.${tenantId}`,
      }, (payload) => {
        const id = (payload.old as any).id;
        setTasks(prev => prev.filter(t => t.id !== id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenantId, userId]);

  const createTask = async (taskData: Partial<Task>) => {
    const { data, error } = await supabase
      .from("tasks" as any)
      .insert({ ...taskData, tenant_id: tenantId })
      .select()
      .single();
    if (error) throw error;
    return data;
  };

  const updateTaskStatus = async (taskId: string, status: TaskStatus) => {
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
    const { error } = await supabase
      .from("tasks" as any)
      .update({ status })
      .eq("id", taskId);
    if (error) {
      fetchTasks(); // rollback
      throw error;
    }
  };

  const updateTask = async (taskId: string, data: Partial<Task>) => {
    const { error } = await supabase
      .from("tasks" as any)
      .update(data)
      .eq("id", taskId);
    if (error) throw error;
    fetchTasks();
  };

  const deleteTask = async (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    const { error } = await supabase
      .from("tasks" as any)
      .delete()
      .eq("id", taskId);
    if (error) {
      fetchTasks();
      throw error;
    }
  };

  return { tasks, loading, fetchTasks, createTask, updateTaskStatus, updateTask, deleteTask };
}
