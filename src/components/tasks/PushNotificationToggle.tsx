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
        toast.error("Permissão de notificações bloqueada no navegador. Verifique as configurações do site.");
      }
    }
  };

  const Icon = isSubscribed ? BellRing : permission === "denied" ? BellOff : Bell;
  const label = isSubscribed
    ? "Push ativo — clique para desativar"
    : permission === "denied"
      ? "Notificações bloqueadas no navegador"
      : "Ativar notificações push";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={isSubscribed ? "default" : "outline"}
          size="sm"
          onClick={handleToggle}
          disabled={loading || permission === "denied"}
          className="gap-1.5"
        >
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline text-xs">
            {isSubscribed ? "Push ativo" : "Push"}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
