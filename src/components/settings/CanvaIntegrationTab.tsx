import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { toast } from "sonner";
import { Palette, ExternalLink, CheckCircle2, Image, Save, Eye, EyeOff, XCircle } from "lucide-react";

export function CanvaIntegrationTab() {
  const tenantId = getTenantId();
  const [canvaEnabled, setCanvaEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [configId, setConfigId] = useState<string | null>(null);

  // Config fields
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [redirectUri, setRedirectUri] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const checkCanva = async () => {
      const { data } = await supabase
        .from("admin_canva_settings" as any)
        .select("*")
        .limit(1)
        .maybeSingle();
      if (data) {
        const d = data as any;
        setConfigId(d.id);
        setClientId(d.client_id || "");
        setClientSecret(d.client_secret || "");
        setRedirectUri(d.redirect_uri || "");
        setAtivo(d.ativo ?? false);
        setCanvaEnabled(d.ativo ?? false);
      }
      setLoading(false);
    };
    checkCanva();
  }, []);

  const handleSaveConfig = async () => {
    setSaving(true);
    const payload = {
      client_id: clientId.trim() || null,
      client_secret: clientSecret.trim() || null,
      redirect_uri: redirectUri.trim() || null,
      ativo,
    };

    if (configId) {
      const { error } = await supabase.from("admin_canva_settings" as any).update(payload as any).eq("id", configId);
      if (error) toast.error("Erro ao salvar configurações");
      else { toast.success("Configurações Canva salvas!"); setCanvaEnabled(ativo); }
    } else {
      const { data, error } = await supabase.from("admin_canva_settings" as any).insert(payload as any).select("id").single();
      if (error) toast.error("Erro ao criar configuração");
      else { setConfigId((data as any).id); setCanvaEnabled(ativo); toast.success("Configurações Canva salvas!"); }
    }
    setSaving(false);
  };

  if (loading) return <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>;

  return (
    <div className="space-y-6">
      {/* Configuration Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" /> Canva API — Configuração
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
              <p className="text-xs text-muted-foreground">Habilita a importação de designs do Canva</p>
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
            <Button onClick={handleSaveConfig} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar Configurações"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Templates Card — only when enabled */}
      {canvaEnabled && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" /> Templates Recomendados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { name: "Post Instagram/Facebook", size: "1080×1080", link: "https://www.canva.com/design/create?type=TABNpm0yWwE" },
                { name: "Stories/Reels", size: "1080×1920", link: "https://www.canva.com/design/create?type=TABNqFORQCA" },
                { name: "Banner Facebook Ads", size: "1200×628", link: "https://www.canva.com/design/create?type=TAB_cGia2Lg" },
              ].map(t => (
                <a key={t.name} href={t.link} target="_blank" rel="noopener"
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all group">
                  <Image className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                  <p className="text-sm font-medium text-center">{t.name}</p>
                  <Badge variant="outline" className="text-[10px]">{t.size}</Badge>
                  <span className="text-[10px] text-primary flex items-center gap-1">Criar no Canva <ExternalLink className="h-2.5 w-2.5" /></span>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
