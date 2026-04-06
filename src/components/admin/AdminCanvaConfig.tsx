import {useState, useEffect} from "react";
import {addDays, format} from "date-fns";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Button} from "@/components/ui/button";
import {Switch} from "@/components/ui/switch";
import {Badge} from "@/components/ui/badge";
import {Separator} from "@/components/ui/separator";
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter} from "@/components/ui/dialog";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {supabase} from "@/lib/supabaseClient";
import {toast} from "sonner";
import {Save, Eye, EyeOff, Palette, CheckCircle2, XCircle, Plus, Trash2, Share2} from "lucide-react";

const CANVA_PROVIDER_KEY = "canva_master";

interface TenantRow { id: string; nome_loja: string; codigo_loja: string | null; ativo: boolean; }
interface ShareRow { id: string; config_id: string; tenant_id: string; starts_at: string; ends_at: string; is_active: boolean; }

export function AdminCanvaConfig() {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [redirectUri, setRedirectUri] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);

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

  useEffect(() => {
    const fetchAll = async () => {
      // Try dealroom_api_configs first, fallback to admin_canva_settings
      const { data: apiCfg } = await (supabase as any)
        .from("dealroom_api_configs")
        .select("*")
        .eq("provider", CANVA_PROVIDER_KEY)
        .limit(1)
        .maybeSingle();

      if (apiCfg) {
        setConfigId(apiCfg.id);
        const creds = apiCfg.credenciais || {};
        setClientId(creds.client_id || "");
        setClientSecret(creds.client_secret || "");
        setRedirectUri(creds.redirect_uri || "");
        setAtivo(apiCfg.is_active ?? false);
      } else {
        // Fallback: legacy table
        const { data } = await supabase
          .from("admin_canva_settings" as any)
          .select("*")
          .limit(1)
          .maybeSingle();
        if (data) {
          const d = data as any;
          setClientId(d.client_id || "");
          setClientSecret(d.client_secret || "");
          setRedirectUri(d.redirect_uri || "");
          setAtivo(d.ativo ?? false);
        }
      }

      // Tenants
      const { data: t } = await supabase.from("tenants").select("id, nome_loja, codigo_loja, ativo").order("nome_loja");
      if (t) setTenants(t as TenantRow[]);

      // Shares
      await fetchShares();

      setLoading(false);
    };
    fetchAll();
  }, []);

  const fetchShares = async () => {
    const { data: cfg } = await (supabase as any)
      .from("dealroom_api_configs")
      .select("id")
      .eq("provider", CANVA_PROVIDER_KEY)
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

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        provider: CANVA_PROVIDER_KEY,
        nome: "Canva Admin Master",
        categoria: "design",
        credenciais: {
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
          redirect_uri: redirectUri.trim(),
        },
        is_active: ativo,
        updated_at: new Date().toISOString(),
      };

      if (configId) {
        const { error } = await (supabase as any)
          .from("dealroom_api_configs")
          .update(payload)
          .eq("id", configId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any)
          .from("dealroom_api_configs")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        setConfigId(data.id);
      }

      // Also sync legacy table
      const legacyPayload = {
        client_id: clientId.trim() || null,
        client_secret: clientSecret.trim() || null,
        redirect_uri: redirectUri.trim() || null,
        ativo,
      };
      const { data: existingLegacy } = await supabase.from("admin_canva_settings" as any).select("id").limit(1).maybeSingle();
      if (existingLegacy) {
        await supabase.from("admin_canva_settings" as any).update(legacyPayload as any).eq("id", (existingLegacy as any).id);
      }

      toast.success("Configurações Canva salvas!");
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
      if (!configId) await handleSave();
      const cfgId = configId;
      if (!cfgId) { toast.error("Salve as configurações antes de compartilhar."); return; }

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
      toast.success("Canva compartilhado com a loja!");
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

  if (loading) return <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" /> Canva API — Configuração Global
            </CardTitle>
            <Badge variant={ativo ? "default" : "secondary"} className={ativo ? "bg-green-600 text-white gap-1" : "gap-1"}>
              {ativo ? <><CheckCircle2 className="h-3 w-3" />Ativo</> : <><XCircle className="h-3 w-3" />Inativo</>}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Integração Ativa</Label>
              <p className="text-xs text-muted-foreground">Habilita a importação de designs do Canva para lojistas</p>
            </div>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>

          <Separator />

          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <h4 className="text-sm font-medium">Como configurar</h4>
            <ol className="space-y-1.5 text-xs text-muted-foreground">
              <li>1. Acesse <a href="https://www.canva.com/developers/" target="_blank" rel="noopener" className="text-primary underline">Canva Developers Portal</a></li>
              <li>2. Crie um novo App → selecione "Connect API"</li>
              <li>3. Copie o <strong>Client ID</strong> e <strong>Client Secret</strong></li>
              <li>4. Configure a <strong>Redirect URI</strong> apontando para seu domínio</li>
              <li>5. Solicite os escopos: <code className="bg-muted px-1 rounded">design:read</code>, <code className="bg-muted px-1 rounded">asset:read</code></li>
            </ol>
          </div>

          <div>
            <Label>Client ID</Label>
            <Input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="OC-xxxxxxxxxxxx" className="mt-1 font-mono text-xs" />
          </div>

          <div>
            <Label>Client Secret</Label>
            <div className="relative mt-1">
              <Input type={showSecret ? "text" : "password"} value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder="Chave secreta do app Canva" className="pr-10 font-mono text-xs" />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowSecret(!showSecret)}>
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <Label>Redirect URI</Label>
            <Input value={redirectUri} onChange={e => setRedirectUri(e.target.value)} placeholder="https://seudominio.com/canva/callback" className="mt-1 font-mono text-xs" />
            <p className="text-xs text-muted-foreground mt-1">URL de callback para OAuth — deve ser registrada no portal do Canva</p>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar Configurações"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sharing Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Share2 className="h-5 w-5 text-primary" />
              Compartilhar Canva com Lojas
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
            <DialogTitle>Compartilhar Canva com loja</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>API</Label>
              <Input value="Canva — Design" readOnly />
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
