import { Bell, BellOff, BellRing, Settings2, MessageSquare, ListTodo, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { usePushPreferences, type PushCategory } from "@/hooks/usePushPreferences";
import { toast } from "sonner";

interface Props {
  tenantId: string | null;
  userId?: string;
}

const CATEGORIES: { key: PushCategory; label: string; icon: React.ElementType; desc: string }[] = [
  { key: "tarefas", label: "Tarefas", icon: ListTodo, desc: "Novas tarefas atribuídas e lembretes de prazo" },
  { key: "mensagens", label: "Mensagens", icon: MessageSquare, desc: "Mensagens de clientes no VendaZap" },
  { key: "leads", label: "Leads", icon: UserPlus, desc: "Novos leads enviados para seu atendimento" },
];

export function PushNotificationToggle({ tenantId, userId }: Props) {
  const { supported, permission, isSubscribed, loading, subscribe, unsubscribe } =
    usePushNotifications(tenantId, userId);
  const { preferences, updatePreference } = usePushPreferences();

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

  return (
    <div className="flex items-center gap-1">
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
        <TooltipContent>
          {isSubscribed
            ? "Push ativo — clique para desativar"
            : permission === "denied"
              ? "Notificações bloqueadas no navegador"
              : "Ativar notificações push"}
        </TooltipContent>
      </Tooltip>

      {isSubscribed && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="end">
            <div className="space-y-3">
              <div>
                <h4 className="font-medium text-sm">Preferências de Push</h4>
                <p className="text-xs text-muted-foreground">Escolha quais notificações receber</p>
              </div>
              <Separator />
              {CATEGORIES.map(({ key, label, icon: CatIcon, desc }) => (
                <div key={key} className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <CatIcon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <Label htmlFor={`push-${key}`} className="text-sm font-medium cursor-pointer">
                        {label}
                      </Label>
                      <p className="text-xs text-muted-foreground leading-tight">{desc}</p>
                    </div>
                  </div>
                  <Switch
                    id={`push-${key}`}
                    checked={preferences[key]}
                    onCheckedChange={(checked) => updatePreference(key, checked)}
                  />
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
