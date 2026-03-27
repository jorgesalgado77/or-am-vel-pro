import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { playNotificationSound } from "@/lib/notificationSound";
import { format } from "date-fns";

export interface AppNotification {
  id: string;
  type: "lead" | "tarefa" | "mensagem" | "sistema";
  titulo: string;
  descricao: string;
  created_at: string;
  lido: boolean;
  link_view?: string; // view to navigate to
  meta?: Record<string, any>;
}

export function useNotificationCenter(userId: string | undefined, userName: string | undefined, tenantId: string | null) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const readIds = useMemo(() => {
    try { return new Set<string>(JSON.parse(localStorage.getItem("global_read_notifications") || "[]")); }
    catch { return new Set<string>(); }
  }, []);

  // Fetch initial notifications from multiple sources
  const fetchAll = useCallback(async () => {
    if (!tenantId || !userName) return;

    const results: AppNotification[] = [];

    // 1. Lead notifications (tracking_messages)
    const { data: leads } = await supabase
      .from("tracking_messages" as any)
      .select("id, conteudo, created_at")
      .eq("destinatario", userName)
      .eq("tipo", "sistema")
      .ilike("conteudo", "%enviado para seu atendimento%")
      .order("created_at", { ascending: false })
      .limit(15);

    if (leads) {
      for (const l of leads as any[]) {
        results.push({
          id: `lead-${l.id}`,
          type: "lead",
          titulo: "Novo Lead",
          descricao: l.conteudo?.replace(/[🚀✅⚠️]/g, "").trim() || "",
          created_at: l.created_at,
          lido: readIds.has(`lead-${l.id}`),
          link_view: "clients",
        });
      }
    }

    // 2. Task notifications
    if (userId) {
      const { data: tasks } = await supabase
        .from("tasks" as any)
        .select("id, titulo, data_tarefa, horario, status, created_at, criado_por")
        .eq("tenant_id", tenantId)
        .eq("responsavel_id", userId)
        .in("status", ["nova", "pendente"])
        .order("created_at", { ascending: false })
        .limit(15);

      if (tasks) {
        for (const t of tasks as any[]) {
          const isFromOther = t.criado_por && t.criado_por !== userId;
          results.push({
            id: `task-${t.id}`,
            type: "tarefa",
            titulo: isFromOther ? "Tarefa atribuída" : "Tarefa pendente",
            descricao: `${t.titulo}${t.horario ? ` às ${t.horario}` : ""} — ${format(new Date(t.data_tarefa + "T00:00:00"), "dd/MM")}`,
            created_at: t.created_at,
            lido: readIds.has(`task-${t.id}`),
            link_view: "tasks",
          });
        }
      }
    }

    // 3. Unread messages
    const { data: msgs } = await supabase
      .from("tracking_messages" as any)
      .select("id, conteudo, created_at, remetente_nome")
      .eq("tenant_id", tenantId)
      .eq("lida", false)
      .eq("remetente_tipo", "cliente")
      .order("created_at", { ascending: false })
      .limit(10);

    if (msgs) {
      for (const m of msgs as any[]) {
        results.push({
          id: `msg-${m.id}`,
          type: "mensagem",
          titulo: `Mensagem de ${m.remetente_nome || "Cliente"}`,
          descricao: (m.conteudo || "").slice(0, 80),
          created_at: m.created_at,
          lido: readIds.has(`msg-${m.id}`),
          link_view: "vendazap-chat",
        });
      }
    }

    // Sort by date desc
    results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setNotifications(results.slice(0, 30));
  }, [tenantId, userName, userId, readIds]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Realtime: new tasks assigned
  useEffect(() => {
    if (!tenantId || !userId) return;
    const channel = supabase
      .channel("notif-tasks")
      .on("postgres_changes" as any, {
        event: "INSERT",
        schema: "public",
        table: "tasks",
        filter: `tenant_id=eq.${tenantId}`,
      }, (payload: any) => {
        const t = payload.new;
        if (t?.responsavel_id === userId && t?.criado_por !== userId) {
          playNotificationSound();
          const notif: AppNotification = {
            id: `task-${t.id}`,
            type: "tarefa",
            titulo: "Nova tarefa atribuída",
            descricao: t.titulo,
            created_at: t.created_at,
            lido: false,
            link_view: "tasks",
          };
          setNotifications(prev => [notif, ...prev].slice(0, 30));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenantId, userId]);

  // Realtime: new messages from clients
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel("notif-messages")
      .on("postgres_changes" as any, {
        event: "INSERT",
        schema: "public",
        table: "tracking_messages",
        filter: `tenant_id=eq.${tenantId}`,
      }, (payload: any) => {
        const m = payload.new;
        if (m?.remetente_tipo === "cliente") {
          const notif: AppNotification = {
            id: `msg-${m.id}`,
            type: "mensagem",
            titulo: `Mensagem de ${m.remetente_nome || "Cliente"}`,
            descricao: (m.conteudo || "").slice(0, 80),
            created_at: m.created_at,
            lido: false,
            link_view: "vendazap-chat",
          };
          setNotifications(prev => [notif, ...prev].slice(0, 30));
        }
        // Lead assignment
        if (m?.tipo === "sistema" && m?.destinatario === userName && m?.conteudo?.includes("enviado para seu atendimento")) {
          playNotificationSound();
          const notif: AppNotification = {
            id: `lead-${m.id}`,
            type: "lead",
            titulo: "Novo Lead",
            descricao: m.conteudo?.replace(/[🚀✅⚠️]/g, "").trim() || "",
            created_at: m.created_at,
            lido: false,
            link_view: "clients",
          };
          setNotifications(prev => [notif, ...prev].slice(0, 30));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenantId, userName]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.lido).length, [notifications]);

  const markAsRead = useCallback((id: string) => {
    readIds.add(id);
    localStorage.setItem("global_read_notifications", JSON.stringify([...readIds]));
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, lido: true } : n));
  }, [readIds]);

  const markAllRead = useCallback(() => {
    notifications.forEach(n => readIds.add(n.id));
    localStorage.setItem("global_read_notifications", JSON.stringify([...readIds]));
    setNotifications(prev => prev.map(n => ({ ...n, lido: true })));
  }, [notifications, readIds]);

  return { notifications, unreadCount, markAsRead, markAllRead, refresh: fetchAll };
}
