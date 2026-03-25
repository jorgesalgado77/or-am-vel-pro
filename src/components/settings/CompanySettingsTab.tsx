/**
 * Company settings tab - extracted from SettingsPanel.tsx
 */
import { forwardRef, useEffect, useState, type ComponentPropsWithoutRef } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Upload, Save } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { isNotificationSoundEnabled, setNotificationSoundEnabled, getNotificationVolume, setNotificationVolume, playNotificationSound } from "@/lib/notificationSound";

const NotificationSoundToggle = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(function NotificationSoundToggle({ className, ...props }, ref) {
  const [enabled, setEnabled] = useState(isNotificationSoundEnabled());
  const [volume, setVolume] = useState(getNotificationVolume());

  return (
    <div ref={ref} className={className ?? "space-y-3 max-w-[600px]"} {...props}>
      <div className="flex items-center justify-between">
        <div>
          <Label>Som de Notificação</Label>
          <p className="text-xs text-muted-foreground">Toca um som ao receber novas mensagens em tempo real</p>
        </div>
        <Switch checked={enabled} onCheckedChange={(val) => { setEnabled(val); setNotificationSoundEnabled(val); toast.success(val ? "Som ativado" : "Som desativado"); }} />
      </div>
      {enabled && (
        <div className="flex items-center gap-3 pl-1">
          <span className="text-xs text-muted-foreground w-12">Volume</span>
          <Slider value={[volume]} onValueChange={(v) => { setVolume(v[0]); setNotificationVolume(v[0]); }} min={0.05} max={1} step={0.05} className="flex-1" />
          <span className="text-xs text-muted-foreground w-10 text-right">{Math.round(volume * 100)}%</span>
          <Button variant="outline" size="sm" onClick={playNotificationSound} className="text-xs h-7 px-2">Testar</Button>
        </div>
      )}
    </div>
  );
});

const InactivitySoundToggle = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(function InactivitySoundToggle({ className, ...props }, ref) {
  const [enabled, setEnabled] = useState(() => {
    const val = localStorage.getItem("inactivity_sound_enabled");
    return val === null ? true : val === "true";
  });

  return (
    <div ref={ref} className={className ?? "flex items-center justify-between max-w-[600px]"} {...props}>
      <div>
        <Label>Som de Alerta de Inatividade</Label>
        <p className="text-xs text-muted-foreground">Toca um som quando a sessão está prestes a expirar por inatividade</p>
      </div>
      <Switch checked={enabled} onCheckedChange={(val) => { setEnabled(val); localStorage.setItem("inactivity_sound_enabled", String(val)); toast.success(val ? "Ativado" : "Desativado"); }} />
    </div>
  );
});

export function CompanySettingsTab() {
  const { settings, refresh } = useCompanySettings();
  const [name, setName] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [codigoLoja, setCodigoLoja] = useState("");
  const [cnpjLoja, setCnpjLoja] = useState("");
  const [enderecoLoja, setEnderecoLoja] = useState("");
  const [bairroLoja, setBairroLoja] = useState("");
  const [cidadeLoja, setCidadeLoja] = useState("");
  const [ufLoja, setUfLoja] = useState("");
  const [cepLoja, setCepLoja] = useState("");
  const [telefoneLoja, setTelefoneLoja] = useState("");
  const [emailLoja, setEmailLoja] = useState("");
  const [validityDays, setValidityDays] = useState(30);
  const [managerPassword, setManagerPassword] = useState("");
  const [confirmManagerPassword, setConfirmManagerPassword] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmAdminPassword, setConfirmAdminPassword] = useState("");
  const [showManagerPw, setShowManagerPw] = useState(false);
  const [showAdminPw, setShowAdminPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [orcamentoInicial, setOrcamentoInicial] = useState(1);
  const [buscandoCep, setBuscandoCep] = useState(false);

  const formatOrcamento = (value: number): string => {
    const str = String(value).replace(/\D/g, "").slice(0, 11);
    let result = "";
    for (let i = 0; i < str.length; i++) {
      if (i === 3 || i === 6 || i === 9) result += ".";
      result += str[i];
    }
    return result;
  };

  const handleOrcamentoChange = (masked: string) => {
    const raw = masked.replace(/\D/g, "").slice(0, 11);
    setOrcamentoInicial(parseInt(raw, 10) || 0);
  };

  useEffect(() => {
    setName(settings.company_name);
    setSubtitle(settings.company_subtitle || "");
    setCodigoLoja(settings.codigo_loja || "");
    setCnpjLoja(settings.cnpj_loja || "");
    setEnderecoLoja(settings.endereco_loja || "");
    setBairroLoja(settings.bairro_loja || "");
    setCidadeLoja(settings.cidade_loja || "");
    setUfLoja(settings.uf_loja || "");
    setCepLoja(settings.cep_loja || "");
    setTelefoneLoja(settings.telefone_loja || "");
    setEmailLoja(settings.email_loja || "");
    setValidityDays(settings.budget_validity_days);
    setManagerPassword(settings.manager_password || "");
    setConfirmManagerPassword(settings.manager_password || "");
    setAdminPassword(settings.admin_password || "");
    setConfirmAdminPassword(settings.admin_password || "");
    setOrcamentoInicial(Math.round(settings.orcamento_numero_inicial) || 1);
  }, [settings]);

  const buscarCepLoja = async () => {
    const cepClean = cepLoja.replace(/\D/g, "");
    if (cepClean.length !== 8) { toast.error("CEP inválido"); return; }
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepClean}/json/`);
      const data = await res.json();
      if (data.erro) { toast.error("CEP não encontrado"); return; }
      setEnderecoLoja(data.logradouro || "");
      setBairroLoja(data.bairro || "");
      setCidadeLoja(data.localidade || "");
      setUfLoja(data.uf || "");
      toast.success("Endereço preenchido!");
    } catch { toast.error("Erro ao buscar CEP"); }
    finally { setBuscandoCep(false); }
  };

  const handleSave = async () => {
    if (managerPassword && managerPassword !== confirmManagerPassword) { toast.error("Senhas do gerente não coincidem"); return; }
    if (adminPassword && adminPassword !== confirmAdminPassword) { toast.error("Senhas do administrador não coincidem"); return; }
    setSaving(true);
    const { error } = await supabase.from("company_settings").update({
      company_name: name, company_subtitle: subtitle, cnpj_loja: cnpjLoja.trim() || null,
      endereco_loja: enderecoLoja.trim() || null, bairro_loja: bairroLoja.trim() || null,
      cidade_loja: cidadeLoja.trim() || null, uf_loja: ufLoja.trim() || null,
      cep_loja: cepLoja.trim() || null, telefone_loja: telefoneLoja.trim() || null,
      email_loja: emailLoja.trim() || null, budget_validity_days: validityDays,
      manager_password: managerPassword, admin_password: adminPassword,
      orcamento_numero_inicial: Math.round(orcamentoInicial),
    } as any).eq("id", settings.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar");
    else { toast.success("Configurações salvas!"); refresh(); }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `logo.${ext}`;
    const { error: upErr } = await supabase.storage.from("company-assets").upload(path, file, { upsert: true });
    if (upErr) { toast.error("Erro ao enviar logo"); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("company-assets").getPublicUrl(path);
    await supabase.from("company_settings").update({ logo_url: publicUrl }).eq("id", settings.id);
    toast.success("Logo atualizado!");
    setUploading(false);
    refresh();
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Dados da Empresa</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><Label>Nome da Empresa</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" /></div>
          <div><Label>Subtítulo</Label><Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className="mt-1" /></div>
          <div><Label>Código da Loja</Label><Input value={codigoLoja} readOnly disabled className="mt-1 bg-muted cursor-not-allowed" title="Código gerado automaticamente" /></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><Label>CNPJ da Loja</Label><Input value={cnpjLoja} onChange={(e) => setCnpjLoja(e.target.value)} placeholder="00.000.000/0000-00" className="mt-1" /></div>
          <div className="md:col-span-2"><Label>Endereço da Loja</Label><Input value={enderecoLoja} onChange={(e) => setEnderecoLoja(e.target.value)} placeholder="Rua, número" className="mt-1" /></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><Label>Bairro</Label><Input value={bairroLoja} onChange={(e) => setBairroLoja(e.target.value)} className="mt-1" /></div>
          <div><Label>Cidade</Label><Input value={cidadeLoja} onChange={(e) => setCidadeLoja(e.target.value)} className="mt-1" /></div>
          <div><Label>UF</Label><Input value={ufLoja} onChange={(e) => setUfLoja(e.target.value)} placeholder="SP" maxLength={2} className="mt-1" /></div>
          <div>
            <Label>CEP</Label>
            <div className="flex gap-1 mt-1">
              <Input value={cepLoja} onChange={(e) => setCepLoja(e.target.value)} placeholder="00000-000" />
              <Button variant="outline" size="icon" className="shrink-0" onClick={buscarCepLoja} disabled={buscandoCep} title="Buscar CEP">
                {buscandoCep ? <span className="animate-spin text-xs">⏳</span> : <span className="text-xs">🔍</span>}
              </Button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>Telefone da Loja</Label><Input value={telefoneLoja} onChange={(e) => setTelefoneLoja(e.target.value)} placeholder="(00) 00000-0000" className="mt-1" /></div>
          <div><Label>Email da Loja</Label><Input type="email" value={emailLoja} onChange={(e) => setEmailLoja(e.target.value)} placeholder="contato@loja.com" className="mt-1" /></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Validade do Orçamento (dias)</Label>
            <Input type="number" value={validityDays} onChange={(e) => setValidityDays(Number(e.target.value))} min={1} className="mt-1" />
          </div>
          <div>
            <Label>Número Inicial do Orçamento</Label>
            <p className="text-xs text-muted-foreground mb-1">Formato: 999.999.999.99</p>
            <Input type="text" inputMode="numeric" value={formatOrcamento(orcamentoInicial)} onChange={(e) => handleOrcamentoChange(e.target.value)} placeholder="000.000.000.00" className="mt-1" />
          </div>
        </div>
        <Separator />
        <div>
          <Label>Senha do Gerente</Label>
          <p className="text-xs text-muted-foreground mb-1">Libera o campo Desconto 3 na simulação</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1 max-w-[600px]">
            <div className="relative">
              <Input type={showManagerPw ? "text" : "password"} value={managerPassword} onChange={(e) => setManagerPassword(e.target.value)} placeholder="Definir senha" className="pr-10" />
              <button type="button" onClick={() => setShowManagerPw(!showManagerPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showManagerPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div>
              <Input type={showManagerPw ? "text" : "password"} value={confirmManagerPassword} onChange={(e) => setConfirmManagerPassword(e.target.value)} placeholder="Confirmar senha" />
              {managerPassword && confirmManagerPassword && managerPassword !== confirmManagerPassword && (
                <p className="text-xs text-destructive mt-1">As senhas não coincidem</p>
              )}
            </div>
          </div>
        </div>
        <div>
          <Label>Senha do Administrador</Label>
          <p className="text-xs text-muted-foreground mb-1">Libera o campo Plus na simulação</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1 max-w-[600px]">
            <div className="relative">
              <Input type={showAdminPw ? "text" : "password"} value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="Definir senha" className="pr-10" />
              <button type="button" onClick={() => setShowAdminPw(!showAdminPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showAdminPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div>
              <Input type={showAdminPw ? "text" : "password"} value={confirmAdminPassword} onChange={(e) => setConfirmAdminPassword(e.target.value)} placeholder="Confirmar senha" />
              {adminPassword && confirmAdminPassword && adminPassword !== confirmAdminPassword && (
                <p className="text-xs text-destructive mt-1">As senhas não coincidem</p>
              )}
            </div>
          </div>
        </div>
        <Separator />
        <NotificationSoundToggle />
        <Separator />
        <InactivitySoundToggle />
        <Separator />
        <div>
          <Label>Logo da Empresa</Label>
          <div className="flex items-center gap-4 mt-2">
            {settings.logo_url && <img src={settings.logo_url} alt="Logo" className="h-12 w-auto object-contain rounded border border-border p-1" />}
            <label className="cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              <Button variant="outline" size="sm" className="gap-2" asChild><span><Upload className="h-4 w-4" />{uploading ? "Enviando..." : "Enviar Logo"}</span></Button>
            </label>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="gap-2"><Save className="h-4 w-4" />{saving ? "Salvando..." : "Salvar"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
