import { Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";

interface Props {
  tenantId: string | null;
  userId?: string;
}

export function PushNotificationToggle({ tenantId, userId }: Props) {
  const { supported, permission, isSubscribed, loading, subscribe, unsubscribe } =
    usePushNotifications(tenantId, userId);

  if (!supported) return null;

  const handleToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
      toast.info("Notificações push desativadas");
    } else {
      const success = await subscribe();
      if (success) {
        toast.success("Notificações push ativadas! 🔔");
      } else if (permission === "denied") {
        toast.error("Permissão de notificações bloqueada no navegador.");
      }
    }
  };

  const Icon = isSubscribed ? BellRing : permission === "denied" ? BellOff : Bell;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 ${isSubscribed ? "text-primary hover:text-primary/80" : "text-muted-foreground hover:text-foreground"}`}
          onClick={handleToggle}
          disabled={loading || permission === "denied"}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        {isSubscribed
          ? "Push ativo — clique para desativar"
          : permission === "denied"
            ? "Notificações bloqueadas no navegador"
            : "Ativar notificações push"}
      </TooltipContent>
    </Tooltip>
  );
}
