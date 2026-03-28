/**
 * Google Calendar integration status tab for Settings panel.
 * Shows connection status, connected email, and manage actions.
 */
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CalendarSync, Check, LogOut, Loader2, ExternalLink, AlertTriangle, RefreshCw } from "lucide-react";
import { useGoogleCalendarOAuth } from "@/hooks/useGoogleCalendarOAuth";
import { useAuth } from "@/contexts/AuthContext";
import { getTenantId } from "@/lib/tenantState";

export function GoogleCalendarTab() {
  const { user } = useAuth();
  const tenantId = getTenantId();
  const { status, loading, checking, startOAuth, disconnect, checkStatus } = useGoogleCalendarOAuth(tenantId, user?.id);

  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const currentEnvironmentUri = currentOrigin ? `${currentOrigin}/app?gcal_callback=1` : "";
  const productionUri = "https://orcamovelpro.lovable.app/app?gcal_callback=1";

  return (
    <div className="space-y-4">
      {/* Connection Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <CalendarSync className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Google Calendar</CardTitle>
                <CardDescription className="text-xs">Sincronize tarefas com sua agenda Google</CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={checkStatus} disabled={checking} title="Atualizar status">
              <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {checking ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verificando conexão...
            </div>
          ) : status.connected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1.5">
                  <Check className="h-3 w-3" />
                  Conectado
                </Badge>
              </div>
              {status.google_email && (
                <div className="bg-muted/40 rounded-lg p-3 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    {status.google_email.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{status.google_email}</p>
                    <p className="text-xs text-muted-foreground">Conta Google conectada</p>
                  </div>
                </div>
              )}
              {status.expires_at && (
                <p className="text-xs text-muted-foreground">
                  Token expira em: {new Date(status.expires_at).toLocaleString("pt-BR")}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  onClick={disconnect}
                  disabled={loading}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Desconectar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={startOAuth}
                  disabled={loading}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reconectar
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-amber-600 border-amber-400 gap-1.5">
                  <AlertTriangle className="h-3 w-3" />
                  Não conectado
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Conecte sua conta Google para sincronizar automaticamente as tarefas criadas no sistema com o Google Calendar.
              </p>
              <Button
                onClick={startOAuth}
                disabled={loading}
                className="gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarSync className="h-4 w-4" />}
                Conectar Google Agenda
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Redirect URIs Reference Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            URIs de Redirecionamento Autorizadas
          </CardTitle>
          <CardDescription className="text-xs">
            Configure estas URIs no Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Produção</p>
            <div className="bg-muted/40 rounded-md p-2.5 font-mono text-xs text-foreground break-all select-all cursor-pointer" title="Clique para selecionar">
              {productionUri}
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ambiente atual</p>
            <div className="bg-muted/40 rounded-md p-2.5 font-mono text-xs text-foreground break-all select-all cursor-pointer" title="Clique para selecionar">
              {currentEnvironmentUri || "Abra esta página no ambiente desejado para copiar a URI correta"}
            </div>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mt-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-700 dark:text-amber-400 space-y-1">
                <p className="font-semibold">Importante:</p>
                <p>Ambas as URIs devem estar adicionadas nas <strong>Authorized redirect URIs</strong> do seu OAuth Client no Google Cloud Console para que o login funcione tanto no preview quanto em produção.</p>
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline font-medium mt-1"
                >
                  Abrir Google Cloud Console <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
