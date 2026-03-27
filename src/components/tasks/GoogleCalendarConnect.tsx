import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarSync, Check, LogOut, Loader2 } from "lucide-react";
import { useGoogleCalendarOAuth } from "@/hooks/useGoogleCalendarOAuth";
import { useSearchParams } from "react-router-dom";

interface Props {
  tenantId: string | null;
  userId?: string;
}

export function GoogleCalendarConnect({ tenantId, userId }: Props) {
  const { status, loading, checking, startOAuth, handleCallback, disconnect } = useGoogleCalendarOAuth(tenantId, userId);
  const [searchParams, setSearchParams] = useSearchParams();

  // Handle OAuth callback
  useEffect(() => {
    const code = searchParams.get("code");
    const isCallback = searchParams.get("gcal_callback");
    if (code && isCallback) {
      handleCallback(code).then(() => {
        // Clean URL params
        searchParams.delete("code");
        searchParams.delete("gcal_callback");
        searchParams.delete("scope");
        setSearchParams(searchParams, { replace: true });
      });
    }
  }, [searchParams, handleCallback, setSearchParams]);

  if (checking) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-1.5 text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Google Agenda
      </Button>
    );
  }

  if (status.connected) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs border-emerald-300 text-emerald-700 dark:text-emerald-400 dark:border-emerald-700">
            <Check className="h-3.5 w-3.5" />
            Google Agenda
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="end">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CalendarSync className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium">Google Calendar conectado</span>
            </div>
            {status.google_email && (
              <Badge variant="secondary" className="text-xs">
                {status.google_email}
              </Badge>
            )}
            <p className="text-xs text-muted-foreground">
              Novas tarefas serão automaticamente sincronizadas com seu Google Agenda via OAuth 2.0.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-1.5 text-destructive hover:text-destructive"
              onClick={disconnect}
              disabled={loading}
            >
              <LogOut className="h-3.5 w-3.5" />
              Desconectar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5 text-xs"
      onClick={startOAuth}
      disabled={loading}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarSync className="h-3.5 w-3.5" />}
      Conectar Google Agenda
    </Button>
  );
}
