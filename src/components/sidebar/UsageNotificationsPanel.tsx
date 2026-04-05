/**
 * UsageNotificationsPanel — popover panel showing persistent usage alerts history
 */
import { useState, useEffect, useCallback } from "react";
import { Bell, AlertTriangle, TrendingUp, Check, CheckCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  clearNotifications,
  subscribeNotifications,
  type UsageNotification,
} from "@/services/billing/UsageNotificationStore";

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function UsageNotificationsPanel({ collapsed }: { collapsed: boolean }) {
  const [notifications, setNotifications] = useState<UsageNotification[]>([]);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    setNotifications(getNotifications());
    setUnread(getUnreadCount());
  }, []);

  useEffect(() => {
    refresh();
    return subscribeNotifications(refresh);
  }, [refresh]);

  const handleMarkRead = (id: string) => {
    markNotificationRead(id);
    refresh();
  };

  const handleMarkAllRead = () => {
    markAllNotificationsRead();
    refresh();
  };

  const handleClear = () => {
    clearNotifications();
    refresh();
  };

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 relative"
      style={{ color: "hsl(var(--sidebar-foreground) / 0.7)" }}
    >
      <Bell className="h-4 w-4" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Button>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              Alertas de consumo{unread > 0 ? ` (${unread})` : ""}
            </TooltipContent>
          </Tooltip>
        ) : (
          trigger
        )}
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="end"
        className="w-80 p-0"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Alertas de Consumo</span>
            {unread > 0 && (
              <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
                {unread}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unread > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleMarkAllRead}>
                    <CheckCheck className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Marcar tudo como lido</TooltipContent>
              </Tooltip>
            )}
            {notifications.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={handleClear}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Limpar tudo</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Notifications list */}
        <ScrollArea className="max-h-[320px]">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Nenhum alerta de consumo
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.read && handleMarkRead(n.id)}
                  className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-muted/50 transition-colors ${
                    !n.read ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    {n.type === "exceeded" ? (
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    ) : (
                      <TrendingUp className="h-4 w-4 text-amber-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!n.read ? "font-medium" : "text-muted-foreground"}`}>
                      {n.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {n.description}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      {timeAgo(n.timestamp)}
                    </p>
                  </div>
                  {!n.read && (
                    <div className="shrink-0 mt-1">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
