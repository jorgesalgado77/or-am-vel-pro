import { useState, useEffect } from "react";
import { addDays, format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import {
  Save, Eye, EyeOff, CalendarSync, CheckCircle2, XCircle,
  Plus, Trash2, Share2,
} from "lucide-react";

const GCAL_PROVIDER_KEY = "google_calendar_master";

interface GCalSettings {
  id: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  ativo: boolean;
}

interface TenantRow {
  id: string;
  nome_loja: string;
  codigo_loja: string | null;
  ativo: boolean;
}

interface ShareRow {
  id: string;
  config_id: string;
  tenant_id: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

export function AdminGoogleCalendarConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);

  // Form
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [ativo, setAtivo] = useState(false);

  // Sharing
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareTenantId, setShareTenantId] = useState("");
  const [shareStartsAt, setShareStartsAt] = useState("");
  const [shareEndsAt, setShareEndsAt] = useState("");
  const [shareSaving, setShareSaving] = useState(false);

  const formatForInput = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    const timezoneOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
  };

  const toIso = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  };

  const fetchSettings = async () => {
    try {
      const { data } = await (supabase as any)
        .from("dealroom_api_configs")
        .select("*")
        .eq("provider", GCAL_PROVIDER_KEY)
        .limit(1)
        .maybeSingle();

      if (data) {
        setConfigId(data.id);
        const creds = data.credenciais || {};
        setClientId(creds.client_id || "");
        setClientSecret(creds.client_secret || "");
        setRedirectUri(creds.redirect_uri || "");
        setAtivo(data.is_active || false);
      }
    } catch (e) {
      console.error("Error fetching Google Calendar config:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchTenants = async () => {
    const { data } = await supabase.from("tenants").select("id, nome_loja, codigo_loja, ativo").order("nome_loja");
    if (data) setTenants(data as TenantRow[]);
  };

  const fetchShares = async () => {
    const { data: cfg } = await (supabase as any)
      .from("dealroom_api_configs")
      .select("id")
      .eq("provider", GCAL_PROVIDER_KEY)
      .limit(1)
      .maybeSingle();
    if (!cfg) { setShares([]); return; }
    const { data } = await (supabase as any)
      .from("dealroom_api_shares")
      .select("*")
      .eq("config_id", cfg.id)
      .order("created_at", { ascending: false });
    if (data) setShares(data as ShareRow[]);
  };

  useEffect(() => {
    fetchSettings();
    fetchTenants();
    fetchShares();
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const payload = {
        provider: GCAL_PROVIDER_KEY,
        nome: "Google Calendar Admin Master",
        categoria: "calendar",
        credenciais: {
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
          redirect_uri: redirectUri.trim(),
        },
        is_active: ativo,
        updated_at: new Date().toISOString(),
      };

      let result;
      if (configId) {
        const { data, error } = await (supabase as any)
          .from("dealroom_api_configs")
          .update(payload)
          .eq("id", configId)
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await (supabase as any)
          .from("dealroom_api_configs")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        result = data;
        setConfigId(result.id);
      }

      toast.success("Configurações do Google Calendar salvas!");
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e?.message || "desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  const openShareDialog = () => {
    const now = new Date();
    setShareTenantId("");
    setShareStartsAt(formatForInput(now.toISOString()));
    setShareEndsAt(formatForInput(addDays(now, 30).toISOString()));
    setShareDialogOpen(true);
  };

  const saveShare = async () => {
    if (!shareTenantId || !shareEndsAt) {
      toast.error("Selecione a loja e o período do compartilhamento.");
      return;
    }
    setShareSaving(true);
    try {
      // Ensure config exists
      if (!configId) {
        await saveSettings();
      }
      const cfgId = configId;
      if (!cfgId) {
        toast.error("Salve as configurações antes de compartilhar.");
        return;
      }

      const { error } = await (supabase as any)
        .from("dealroom_api_shares")
        .upsert({
          config_id: cfgId,
          tenant_id: shareTenantId,
          starts_at: toIso(shareStartsAt),
          ends_at: toIso(shareEndsAt),
          is_active: true,
          shared_by: "admin_master",
          updated_at: new Date().toISOString(),
        }, { onConflict: "config_id,tenant_id" });

      if (error) throw new Error(error.message);
      toast.success("Google Calendar compartilhado com a loja!");
      setShareDialogOpen(false);
      fetchShares();
    } catch (error: any) {
      toast.error("Erro ao compartilhar: " + (error?.message || "desconhecido"));
    } finally {
      setShareSaving(false);
    }
  };

  const removeShare = async (shareId: string) => {
    if (!confirm("Remover este compartilhamento?")) return;
    await (supabase as any).from("dealroom_api_shares").delete().eq("id", shareId);
    toast.success("Compartilhamento removido");
    fetchShares();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Settings Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarSync className="h-5 w-5 text-primary" />
            Configurações OAuth — Google Calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Client ID</Label>
              <Input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="xxxxxxx.apps.googleusercontent.com"
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Client Secret</Label>
              <div className="relative">
                <Input
                  type={showSecret ? "text" : "password"}
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="GOCSPX-..."
                  className="text-sm pr-10"
                />
                <Button
                  variant="ghost" size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium">Redirect URI</Label>
            <Input
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
              placeholder="https://seudominio.com/app?gcal_callback=1"
              className="text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              URI autorizada no Google Cloud Console. Deve corresponder ao domínio da aplicação.
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-3">
              <Switch checked={ativo} onCheckedChange={setAtivo} />
              <span className="text-sm text-foreground">
                {ativo ? (
                  <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4" /> Ativo
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <XCircle className="h-4 w-4" /> Inativo
                  </span>
                )}
              </span>
            </div>
            <Button onClick={saveSettings} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : "Salvar Configurações"}
            </Button>
          </div>

          <Separator />
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Escopos necessários:</strong> openid, email, profile, calendar.events, calendar.readonly</p>
            <p><strong>Tipo de aplicação:</strong> Web Application</p>
            <p><strong>User Type:</strong> External (adicionar e-mails em "Test users" durante modo Testing)</p>
          </div>
        </CardContent>
      </Card>

      {/* Sharing Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Share2 className="h-5 w-5 text-primary" />
              Compartilhar Google Calendar com Lojas
            </CardTitle>
            <Button size="sm" onClick={openShareDialog} className="gap-2">
              <Plus className="h-3 w-3" /> Compartilhar com loja
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {shares.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">Nenhum compartilhamento ativo.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loja</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shares.map((share) => {
                  const tenant = tenants.find(t => t.id === share.tenant_id);
                  const now = new Date();
                  const isExpired = new Date(share.ends_at) < now;
                  const isActive = share.is_active && !isExpired;
                  return (
                    <TableRow key={share.id}>
                      <TableCell className="font-medium">
                        {tenant ? `${tenant.nome_loja}${tenant.codigo_loja ? ` • ${tenant.codigo_loja}` : ""}` : share.tenant_id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-xs">{format(new Date(share.starts_at), "dd/MM/yyyy HH:mm")}</TableCell>
                      <TableCell className="text-xs">{format(new Date(share.ends_at), "dd/MM/yyyy HH:mm")}</TableCell>
                      <TableCell>
                        <Badge variant={isActive ? "default" : "secondary"} className={isActive ? "bg-green-600 text-white" : ""}>
                          {isExpired ? "Expirado" : isActive ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeShare(share.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Share Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compartilhar Google Calendar com loja</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>API</Label>
              <Input value="Google Calendar — OAuth" readOnly />
            </div>
            <div className="space-y-2">
              <Label>Loja</Label>
              <Select value={shareTenantId} onValueChange={setShareTenantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a loja" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.filter(t => t.ativo).map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome_loja} {t.codigo_loja ? `• ${t.codigo_loja}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Início do uso</Label>
                <Input type="datetime-local" value={shareStartsAt} onChange={(e) => setShareStartsAt(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Fim programado</Label>
                <Input type="datetime-local" value={shareEndsAt} onChange={(e) => setShareEndsAt(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveShare} disabled={shareSaving}>{shareSaving ? "Salvando..." : "Salvar compartilhamento"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
