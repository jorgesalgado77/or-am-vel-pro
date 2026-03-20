import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { Save, Eye, EyeOff, Palette, ExternalLink, CheckCircle2, XCircle } from "lucide-react";

export function AdminCanvaConfig() {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [redirectUri, setRedirectUri] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
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
      }
      setLoading(false);
    };
    fetch();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      client_id: clientId.trim() || null,
      client_secret: clientSecret.trim() || null,
      redirect_uri: redirectUri.trim() || null,
      ativo,
    };

    if (configId) {
      const { error } = await supabase.from("admin_canva_settings" as any).update(payload as any).eq("id", configId);
      if (error) toast.error("Erro ao salvar"); else toast.success("Configurações Canva salvas!");
    } else {
      const { data, error } = await supabase.from("admin_canva_settings" as any).insert(payload as any).select("id").single();
      if (error) toast.error("Erro ao criar configuração"); else { setConfigId((data as any).id); toast.success("Configurações Canva salvas!"); }
    }
    setSaving(false);
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
    </div>
  );
}
