/**
 * SidebarNotifications — Notification bell popover extracted from AppSidebar.
 */
import React, { useState } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AppNotification } from "@/hooks/useNotificationCenter";

interface SidebarNotificationsProps {
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllRead: () => void;
  onNavigate: (view: string) => void;
  collapsed: boolean;
}

export const SidebarNotifications = React.memo(function SidebarNotifications({
  notifications, unreadCount, markAsRead, markAllRead, onNavigate, collapsed,
}: SidebarNotificationsProps) {
  const [open, setOpen] = useState(false);

  const button = (
    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground relative" onClick={() => setOpen(true)}>
      <Bell className="h-4 w-4" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-0.5">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Notificações</TooltipContent>
          </Tooltip>
        ) : button}
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-80 p-0 max-h-[400px] flex flex-col">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Notificações</h4>
            <p className="text-[10px] text-muted-foreground">{unreadCount} não lida(s) de {notifications.length}</p>
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAllRead}>
              Marcar lidas
            </Button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto max-h-[320px]">
          {notifications.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Nenhuma notificação</p>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map(n => {
                const dateStr = (() => { try { return format(new Date(n.created_at), "dd/MM/yy HH:mm"); } catch { return "—"; } })();
                const typeIcon = n.type === "lead" ? "🆕" : n.type === "tarefa" ? "📋" : n.type === "mensagem" ? "💬" : "🔔";
                return (
                  <button
                    key={n.id}
                    className={cn("w-full text-left px-3 py-2.5 text-xs hover:bg-secondary/50 transition-colors", !n.lido && "bg-primary/5")}
                    onClick={() => {
                      markAsRead(n.id);
                      if (n.link_view) onNavigate(n.link_view);
                      setOpen(false);
                    }}
                  >
                    <div className="flex items-start gap-2">
                      {!n.lido && <span className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />}
                      <span className="text-sm shrink-0">{typeIcon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground font-medium">{n.titulo}</p>
                        <p className="text-muted-foreground leading-relaxed mt-0.5">{n.descricao}</p>
                        <p className="text-muted-foreground mt-1">{dateStr}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
});
